import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { CoreError } from "../errors.js";
import { writeFileWithin } from "../fs-safe.js";
import { type ExecutableTool, textResult, type ToolContext } from "../tool.js";

/** Teto de escrita: 1 MiB. Arquivos maiores devem ser montados em partes (F2+). */
export const WRITE_FILE_MAX_BYTES = 1_048_576;

const definition: Tool = {
  description:
    "Escreve (cria ou sobrescreve) um arquivo de texto do projeto. O diretório-pai já deve existir.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      content: { description: "Conteúdo completo do arquivo.", type: "string" },
      path: { description: "Caminho do arquivo, relativo à raiz do projeto.", type: "string" },
    },
    required: ["content", "path"],
    type: "object",
  },
  name: "write_file",
};

export const writeFileTool: ExecutableTool = {
  definition,
  sideEffect: "write",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    if (typeof input.content !== "string") {
      throw new CoreError("invalid-input", "O conteúdo precisa ser um texto.");
    }
    const absolute = context.workspace.resolve(input.path);
    // Captura o estado atual em disco antes de sobrescrever, para permitir /undo.
    await context.checkpoints?.capture(context.workspace.toRelative(absolute));
    const bytes = await writeFileWithin(
      context.workspace,
      absolute,
      input.content,
      WRITE_FILE_MAX_BYTES,
    );
    return textResult(
      `Arquivo escrito: ${context.workspace.toRelative(absolute)} (${bytes} bytes).`,
    );
  },
};
