import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import type { UndoResult } from "../checkpoints.js";
import { type ExecutableTool, errorResult, type ToolContext, textResult } from "../tool.js";

const definition: Tool = {
  description:
    "Desfaz a última edição capturada em checkpoint (1 passo por padrão). Só funciona no " +
    "agente principal — subagentes não têm checkpoints.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      passos: {
        description: "Quantos checkpoints desfazer (padrão 1, máximo 5).",
        type: "integer",
      },
    },
    type: "object",
  },
  name: "checkpoint_restore",
};

function temUndo(value: unknown): value is { undo: (n?: number) => Promise<UndoResult> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "undo" in value &&
    typeof (value as { undo?: unknown }).undo === "function"
  );
}

export const checkpointRestoreTool: ExecutableTool = {
  definition,
  sideEffect: "write",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const store = context.checkpoints;
    if (!temUndo(store)) {
      return errorResult(
        "Checkpoints indisponíveis neste contexto (subagente ou sessão sem CheckpointStore).",
      );
    }
    const n =
      typeof input.passos === "number" && Number.isSafeInteger(input.passos)
        ? Math.min(5, Math.max(1, input.passos))
        : 1;
    const resultado = await store.undo(n);
    if (resultado.passos === 0) {
      return textResult("Nada a desfazer — não há checkpoints.");
    }
    const labels = resultado.checkpoints.map((c) => c.label || `#${c.seq}`).join(", ");
    return textResult(`Desfeitos ${resultado.passos} passo(s): ${labels}.`);
  },
};
