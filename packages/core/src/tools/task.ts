import type { JsonObject, JsonValue, Tool, ToolResult } from "@codingpro/llm";
import { CoreError } from "../errors.js";
import type { SubagenteRelatorio } from "../subagent.js";
import type { ExecutableTool, ToolContext } from "../tool.js";
import { errorResult, textResult } from "../tool.js";

/**
 * Delega uma ou mais tarefas a subagentes isolados (explorer/worker/architect/reviewer ou custom),
 * roda-as em paralelo e consolida os relatórios. Cada subagente tem contexto próprio e não vê a
 * conversa principal. Habilita casos como "revise este diff com 3 revisores em paralelo".
 */

export const TASK_MAX_TAREFAS = 8;

const itemTarefa = {
  additionalProperties: false,
  properties: {
    prompt: { description: "A tarefa para o subagente.", type: "string" },
    tipo: {
      description: "O tipo de subagente (explorer/worker/architect/reviewer).",
      type: "string",
    },
    type: {
      description: "Alias em inglês de `tipo` (explorer/worker/architect/reviewer).",
      type: "string",
    },
  },
  required: ["prompt"],
  type: "object",
} as const;

const definition: Tool = {
  description:
    "Delega tarefas a subagentes isolados e devolve seus relatórios consolidados. Use para " +
    "exploração, revisão multi-perspectiva, planejamento ou comparação de abordagens em paralelo. " +
    "Cada tarefa tem `tipo` (ou `type`) e `prompt`. Envie `tarefas` (preferido) ou `tasks`.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      tarefas: {
        description: "Lista de subtarefas a rodar em paralelo.",
        items: itemTarefa,
        type: "array",
      },
      tasks: {
        description: "Alias em inglês de `tarefas`.",
        items: itemTarefa,
        type: "array",
      },
    },
    type: "object",
  },
  name: "task",
};

interface Entrada {
  readonly tipo: string;
  readonly prompt: string;
}

function parseTarefas(input: JsonObject): Entrada[] {
  const value = (input.tarefas ?? input.tasks) as JsonValue | undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new CoreError("invalid-input", "Informe ao menos uma tarefa.");
  }
  if (value.length > TASK_MAX_TAREFAS) {
    throw new CoreError("invalid-input", `No máximo ${TASK_MAX_TAREFAS} tarefas por chamada.`);
  }
  return value.map((item) => {
    const obj = item as Record<string, unknown>;
    const tipo = obj?.tipo ?? obj?.type;
    const prompt = obj?.prompt;
    if (typeof tipo !== "string" || typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new CoreError("invalid-input", "Cada tarefa precisa de `tipo` e `prompt`.");
    }
    return { prompt, tipo };
  });
}

function formatarRelatorio(indice: number, r: SubagenteRelatorio): string {
  const sufixo = r.interrompido ? ` (${r.motivo ?? "interrompido"})` : "";
  const cabecalho = `## Subagente ${indice + 1} — ${r.tipo}${sufixo}`;
  const corpo = r.texto.length > 0 ? r.texto : "(sem saída)";
  return `${cabecalho}\n${corpo}`;
}

/** Tipos de subagente que só leem (sem tool de escrita) — podem rodar em paralelo maior. */
const TIPOS_SO_LEITURA = new Set([
  "explorer",
  "reviewer",
  "architect",
  "docs",
  "security",
  "debugger",
  "verifier",
]);

/** O1 — concorrência adaptativa: exploração em massa sobe para 6; efeitos ficam ≤ 2. */
function paralelismoAdaptativo(tarefas: readonly Entrada[], maxParalelo: number | undefined): number {
  const base = Math.max(1, maxParalelo ?? 3);
  const soLeitura = tarefas.every((t) => TIPOS_SO_LEITURA.has(t.tipo));
  if (soLeitura) {
    return Math.min(6, Math.max(base, tarefas.length));
  }
  return Math.min(base, 2);
}

export const taskTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const spawner = context.subagentes;
    if (spawner === undefined) {
      return errorResult("Subagentes não estão disponíveis nesta sessão.");
    }
    let tarefas: Entrada[];
    try {
      tarefas = parseTarefas(input);
    } catch (error) {
      return error instanceof CoreError
        ? errorResult(error.message)
        : errorResult("Entrada inválida.");
    }
    const desconhecido = tarefas.find((t) => !spawner.tiposDisponiveis.includes(t.tipo));
    if (desconhecido !== undefined) {
      return errorResult(
        `Tipo de subagente desconhecido: ${desconhecido.tipo}. Disponíveis: ${spawner.tiposDisponiveis.join(", ")}.`,
      );
    }

    const limite = paralelismoAdaptativo(tarefas, spawner.maxParalelo);
    const relatorios: SubagenteRelatorio[] = new Array(tarefas.length);
    let proximo = 0;
    const trabalhar = async (): Promise<void> => {
      for (;;) {
        const i = proximo;
        proximo += 1;
        const tarefa = tarefas[i];
        if (tarefa === undefined) {
          return;
        }
        try {
          relatorios[i] = await spawner.executar(tarefa.tipo, tarefa.prompt, context.signal);
        } catch (error) {
          // Uma tarefa que estoura não pode derrubar as irmãs nem virar o genérico
          // "A ferramenta falhou ao executar." — vira relatório com a causa.
          relatorios[i] = {
            finishReason: "max-steps",
            interrompido: true,
            motivo: "erro",
            passos: 0,
            texto: `(falhou: ${error instanceof Error ? error.message : String(error)})`,
            tipo: tarefa.tipo,
            usage: { inputTokens: 0, outputTokens: 0 },
          };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, () => trabalhar()));

    const texto = tarefas
      .map((_t, i) => formatarRelatorio(i, relatorios[i] as SubagenteRelatorio))
      .join("\n\n");
    return textResult(texto);
  },
};
