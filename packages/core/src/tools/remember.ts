import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { CoreError } from "../errors.js";
import type { TipoMemoria } from "../memory.js";
import type { ExecutableTool, ToolContext } from "../tool.js";
import { errorResult, textResult } from "../tool.js";

/**
 * Grava um fato na memória persistente da CLI (não no projeto do usuário). O system prompt instrui
 * o modelo a chamar isto para correções, preferências, decisões e gotchas. Pré-autorizada no gate
 * (`alwaysAllow`), então não gera prompt de aprovação.
 */

const TIPOS: readonly TipoMemoria[] = ["feedback", "project", "reference", "user"];

const definition: Tool = {
  description:
    "Salva um fato duradouro na memória (entre sessões): correções do usuário, preferências, " +
    "decisões de projeto, gotchas. NUNCA salve valores de segredos — só onde encontrá-los. " +
    "Se um fato parecido já existe, ele é reforçado em vez de duplicado.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      escopo: {
        description: "'projeto' (padrão quando há repo) ou 'global' (entre projetos).",
        enum: ["projeto", "global"],
        type: "string",
      },
      fato: { description: "O fato a lembrar, em uma ou poucas frases.", type: "string" },
      tipo: {
        description: "Categoria do fato.",
        enum: ["user", "feedback", "project", "reference"],
        type: "string",
      },
    },
    required: ["fato", "tipo"],
    type: "object",
  },
  name: "remember",
};

function tipoDe(valor: unknown): TipoMemoria {
  return typeof valor === "string" && TIPOS.includes(valor as TipoMemoria)
    ? (valor as TipoMemoria)
    : "project";
}

export const rememberTool: ExecutableTool = {
  definition,
  sideEffect: "write",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    if (context.memory === undefined) {
      return errorResult("A memória não está disponível nesta sessão.");
    }
    const fato = input.fato;
    if (typeof fato !== "string" || fato.trim().length === 0) {
      throw new CoreError("invalid-input", "O fato a lembrar é obrigatório.");
    }
    const tipo = tipoDe(input.tipo);
    const projeto = context.memory.projeto;
    const preferProjeto = input.escopo !== "global" && projeto !== undefined;
    const store = preferProjeto && projeto !== undefined ? projeto : context.memory.global;
    try {
      const memoria = await store.remember(fato, tipo);
      const alvo = preferProjeto ? "projeto" : "global";
      return textResult(
        `Memorizado (${alvo}): ${memoria.name} — força ${memoria.strength}. ${memoria.description}`,
      );
    } catch (error) {
      if (error instanceof CoreError) {
        return errorResult(error.message);
      }
      throw error;
    }
  },
};
