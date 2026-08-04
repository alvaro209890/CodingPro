import { randomUUID } from "node:crypto";
import type { CostBreakdown, Provider, TokenUsage } from "@codingpro/llm";
import { type AgentFinishReason, runAgent } from "./agent.js";
import type { TipoAgente } from "./agent-types.js";
import { ToolGate } from "./gate.js";
import { type Approver, PermissionController, type PermissionMode } from "./permissions.js";
import { ToolRegistry } from "./registry.js";
import type { ExecutableTool, ToolContext } from "./tool.js";
import { rememberTool } from "./tools/remember.js";

/** Nomes de tools pré-autorizadas para subagentes (memória; nunca tocam o projeto). */
const SUBAGENTE_ALWAYS_ALLOW = [rememberTool.definition.name];

/** Teto de passos padrão de um subagente (menor que o do loop principal). */
export const SUBAGENTE_MAX_STEPS = 12;
/** Concorrência padrão do orquestrador. */
export const SUBAGENTE_MAX_PARALELO = 3;
/**
 * Tempo máximo de um subagente. Todo papel roda DeepSeek V4 Flash com raciocínio `high`/`max`
 * e até {@link SUBAGENTE_MAX_STEPS} passos com ferramentas: os 2 min antigos cortavam quase
 * toda execução real no meio, e o relatório voltava vazio.
 */
export const SUBAGENTE_TIMEOUT_PADRAO_MS = 600_000;

export interface SubagenteRelatorio {
  readonly tipo: string;
  /** Texto final do subagente (relatório/plano). */
  readonly texto: string;
  readonly usage: TokenUsage;
  readonly cost?: CostBreakdown;
  readonly finishReason: AgentFinishReason;
  readonly passos: number;
  /** `true` se foi interrompido por tempo/cancelamento/erro antes de concluir. */
  readonly interrompido: boolean;
  /** Por que foi interrompido; ausente quando concluiu normalmente. */
  readonly motivo?: "timeout" | "cancelado" | "erro";
}

export type SubagenteEvento =
  | {
      readonly type: "started";
      readonly id: string;
      readonly agentType: string;
      readonly objective: string;
      readonly startedAt: string;
    }
  | {
      readonly type: "progress";
      readonly id: string;
      readonly action: string;
      readonly tool?: string;
    }
  | {
      readonly type: "step";
      readonly id: string;
      readonly step: number;
      readonly usage?: TokenUsage;
    }
  | {
      readonly type: "completed" | "failed" | "cancelled" | "timeout";
      readonly id: string;
      readonly durationMs: number;
      readonly steps: number;
      readonly tools: readonly string[];
      readonly report: string;
      readonly usage: TokenUsage;
      readonly cost?: CostBreakdown;
    };

export interface ExecutarSubagenteOptions {
  readonly tipo: TipoAgente;
  readonly prompt: string;
  readonly provider: Provider;
  /** Conjunto de tools disponível; é filtrado pelas `tipo.tools`. */
  readonly toolPool: readonly ExecutableTool[];
  /** Contexto isolado do subagente (workspace, memória…). Sem checkpoints por padrão. */
  readonly context: ToolContext;
  readonly maxSteps?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly executionId?: string;
  readonly onEvent?: (event: SubagenteEvento) => void;
  /**
   * Aprovador do runtime pai. Sem ele, um subagente com tools de efeito (`worker`) tem toda
   * escrita negada fail-closed e devolve relatório vazio — que era o sintoma de "subagente não
   * funciona". Com ele, a escrita passa pelo mesmo fluxo de permissão do agente principal.
   */
  readonly approver?: Approver;
  /** Modo de permissão do subagente; padrão `ask` (o aprovador decide). */
  readonly permissionMode?: PermissionMode;
}

function registrarTools(
  pool: readonly ExecutableTool[],
  permitidas: readonly string[],
): ToolRegistry {
  const registry = new ToolRegistry();
  const nomes = new Set(permitidas);
  for (const tool of pool) {
    if (nomes.has(tool.definition.name)) {
      registry.register(tool);
    }
  }
  return registry;
}

/**
 * Executa UM subagente com contexto isolado: registra só as tools do seu tipo, roda o loop com o
 * system prompt do tipo e a tarefa como único input, e devolve um relatório. Efeitos passam pelo
 * gate sem aprovador (negados fail-closed na v1). Interrupção por tempo/cancelamento vira relatório
 * parcial em vez de erro. O roteamento de modelo por papel fica de upgrade (reusa o provider dado).
 */
export async function executarSubagente(
  options: ExecutarSubagenteOptions,
): Promise<SubagenteRelatorio> {
  const executionId = options.executionId ?? randomUUID();
  const startedMs = Date.now();
  const toolsUsadas = new Set<string>();
  options.onEvent?.({
    agentType: options.tipo.nome,
    id: executionId,
    objective: options.prompt,
    startedAt: new Date(startedMs).toISOString(),
    type: "started",
  });
  const registry = registrarTools(options.toolPool, options.tipo.tools);
  const gate = new ToolGate(
    registry,
    new PermissionController(
      { alwaysAllow: SUBAGENTE_ALWAYS_ALLOW, mode: options.permissionMode ?? "ask" },
      options.approver,
    ),
  );

  const controller = new AbortController();
  const onParentAbort = () => controller.abort(options.signal?.reason);
  if (options.signal !== undefined) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener("abort", onParentAbort, { once: true });
    }
  }
  // Distingue "estourou o tempo do subagente" de "o usuário cancelou": sem isso os dois casos
  // viravam o mesmo relatório mudo e não dava para saber que o culpado era o timeout.
  let porTimeout = false;
  const timeoutMs = options.timeoutMs ?? SUBAGENTE_TIMEOUT_PADRAO_MS;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          porTimeout = true;
          controller.abort(new Error("tempo esgotado"));
        }, timeoutMs)
      : undefined;

  let texto = "";
  let passos = 0;
  let anunciouRelatorio = false;
  try {
    const result = await runAgent({
      context: { ...options.context, signal: controller.signal },
      gate,
      maxSteps: options.maxSteps ?? SUBAGENTE_MAX_STEPS,
      messages: [{ content: options.prompt, role: "user" }],
      onEvent: (event) => {
        if (event.type === "text-delta") {
          texto += event.text;
          if (!anunciouRelatorio) {
            anunciouRelatorio = true;
            options.onEvent?.({ action: "Redigindo relatório", id: executionId, type: "progress" });
          }
        } else if (event.type === "step") {
          passos = event.step;
          options.onEvent?.({
            id: executionId,
            step: event.step,
            type: "step",
            ...(event.usage === undefined ? {} : { usage: event.usage }),
          });
        } else if (event.type === "tool-call") {
          toolsUsadas.add(event.call.name);
          options.onEvent?.({
            action: `Executando ${event.call.name}`,
            id: executionId,
            tool: event.call.name,
            type: "progress",
          });
        } else if (event.type === "tool-result") {
          toolsUsadas.add(event.call.name);
          options.onEvent?.({
            action: `${event.call.name} concluída`,
            id: executionId,
            tool: event.call.name,
            type: "progress",
          });
        }
      },
      provider: options.provider,
      signal: controller.signal,
      systemPrompt: options.tipo.systemPrompt,
      tools: registry.definitions(),
    });
    const relatorio: SubagenteRelatorio = {
      finishReason: result.finishReason,
      interrompido: false,
      passos: result.steps,
      texto: texto.trim(),
      tipo: options.tipo.nome,
      usage: result.usage,
      ...(result.cost === undefined ? {} : { cost: result.cost }),
    };
    options.onEvent?.({
      durationMs: Date.now() - startedMs,
      id: executionId,
      report: relatorio.texto,
      steps: relatorio.passos,
      tools: [...toolsUsadas],
      type: "completed",
      usage: relatorio.usage,
      ...(relatorio.cost === undefined ? {} : { cost: relatorio.cost }),
    });
    return relatorio;
  } catch (error) {
    if (controller.signal.aborted) {
      const motivo = porTimeout
        ? `(interrompido: tempo esgotado após ${Math.round(timeoutMs / 1000)}s)`
        : "(interrompido: cancelado)";
      const parcial = texto.trim();
      const relatorio: SubagenteRelatorio = {
        finishReason: "max-steps",
        interrompido: true,
        motivo: porTimeout ? "timeout" : "cancelado",
        passos,
        texto: parcial.length > 0 ? `${parcial}\n\n${motivo}` : motivo,
        tipo: options.tipo.nome,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
      options.onEvent?.({
        durationMs: Date.now() - startedMs,
        id: executionId,
        report: relatorio.texto,
        steps: relatorio.passos,
        tools: [...toolsUsadas],
        type: porTimeout ? "timeout" : "cancelled",
        usage: relatorio.usage,
      });
      return relatorio;
    }
    // Falha real (auth, saldo, rede…): vira relatório com a causa em vez de derrubar a tool
    // inteira, que no runtime virava o genérico "A ferramenta falhou ao executar."
    const parcial = texto.trim();
    const causa = error instanceof Error ? error.message : String(error);
    const relatorio: SubagenteRelatorio = {
      finishReason: "max-steps",
      interrompido: true,
      motivo: "erro",
      passos,
      texto: parcial.length > 0 ? `${parcial}\n\n(falhou: ${causa})` : `(falhou: ${causa})`,
      tipo: options.tipo.nome,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    options.onEvent?.({
      durationMs: Date.now() - startedMs,
      id: executionId,
      report: relatorio.texto,
      steps: relatorio.passos,
      tools: [...toolsUsadas],
      type: "failed",
      usage: relatorio.usage,
    });
    return relatorio;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    options.signal?.removeEventListener("abort", onParentAbort);
  }
}

/**
 * Fábrica de subagentes injetada no `ToolContext` pelo runtime (que tem o provider + pool de tools).
 * A tool `task` a usa para delegar. Mantém o núcleo das tools agnóstico de provider.
 */
export interface SubagenteSpawner {
  /** Nomes de tipos disponíveis (padrão + custom), para descrição/validação da tool. */
  readonly tiposDisponiveis: readonly string[];
  /** Concorrência sugerida ao rodar várias tarefas. */
  readonly maxParalelo?: number;
  /** Executa um subagente pelo nome de tipo; erro se o tipo não existir. */
  executar(tipo: string, prompt: string, signal?: AbortSignal): Promise<SubagenteRelatorio>;
}

export interface TarefaSubagente {
  readonly tipo: TipoAgente;
  readonly prompt: string;
}

/**
 * Roda várias tarefas de subagente com concorrência limitada (padrão 3), preservando a ordem de
 * entrada nos relatórios. Compartilham o mesmo pool de tools, provider e contexto-base.
 */
export async function orquestrarSubagentes(
  tarefas: readonly TarefaSubagente[],
  base: Omit<ExecutarSubagenteOptions, "prompt" | "tipo">,
  maxParalelo: number = SUBAGENTE_MAX_PARALELO,
): Promise<SubagenteRelatorio[]> {
  const limite = Math.max(1, Math.trunc(maxParalelo));
  const relatorios: SubagenteRelatorio[] = new Array(tarefas.length);
  let proximo = 0;
  const trabalhar = async (): Promise<void> => {
    for (;;) {
      const indice = proximo;
      proximo += 1;
      const tarefa = tarefas[indice];
      if (tarefa === undefined) {
        return;
      }
      relatorios[indice] = await executarSubagente({
        ...base,
        prompt: tarefa.prompt,
        tipo: tarefa.tipo,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, () => trabalhar()));
  return relatorios;
}
