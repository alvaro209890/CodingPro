import type { CostBreakdown, Provider, TokenUsage } from "@codingpro/llm";
import type { TipoAgente } from "./agent-types.js";
import { type AgentFinishReason, runAgent } from "./agent.js";
import { ToolGate } from "./gate.js";
import { PermissionController } from "./permissions.js";
import { ToolRegistry } from "./registry.js";
import type { ExecutableTool, ToolContext } from "./tool.js";
import { rememberTool } from "./tools/remember.js";

/** Nomes de tools pré-autorizadas para subagentes (memória; nunca tocam o projeto). */
const SUBAGENTE_ALWAYS_ALLOW = [rememberTool.definition.name];

/** Teto de passos padrão de um subagente (menor que o do loop principal). */
export const SUBAGENTE_MAX_STEPS = 12;
/** Concorrência padrão do orquestrador. */
export const SUBAGENTE_MAX_PARALELO = 3;

export interface SubagenteRelatorio {
  readonly tipo: string;
  /** Texto final do subagente (relatório/plano). */
  readonly texto: string;
  readonly usage: TokenUsage;
  readonly cost?: CostBreakdown;
  readonly finishReason: AgentFinishReason;
  readonly passos: number;
  /** `true` se foi interrompido por tempo/cancelamento antes de concluir. */
  readonly interrompido: boolean;
}

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
  const registry = registrarTools(options.toolPool, options.tipo.tools);
  const gate = new ToolGate(
    registry,
    new PermissionController({ alwaysAllow: SUBAGENTE_ALWAYS_ALLOW, mode: "ask" }),
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
  const timer =
    options.timeoutMs !== undefined && options.timeoutMs > 0
      ? setTimeout(() => controller.abort(new Error("tempo esgotado")), options.timeoutMs)
      : undefined;

  let texto = "";
  try {
    const result = await runAgent({
      context: { ...options.context, signal: controller.signal },
      gate,
      maxSteps: options.maxSteps ?? SUBAGENTE_MAX_STEPS,
      messages: [{ content: options.prompt, role: "user" }],
      onEvent: (event) => {
        if (event.type === "text-delta") {
          texto += event.text;
        }
      },
      provider: options.provider,
      signal: controller.signal,
      systemPrompt: options.tipo.systemPrompt,
      tools: registry.definitions(),
    });
    return {
      finishReason: result.finishReason,
      interrompido: false,
      passos: result.steps,
      texto: texto.trim(),
      tipo: options.tipo.nome,
      usage: result.usage,
      ...(result.cost === undefined ? {} : { cost: result.cost }),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        finishReason: "max-steps",
        interrompido: true,
        passos: 0,
        texto: texto.trim(),
        tipo: options.tipo.nome,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
    throw error;
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
