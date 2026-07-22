import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { readFileWithin } from "../fs-safe.js";
import { type ExecutableTool, textResult, type ToolContext } from "../tool.js";

/** Teto de leitura: 256 KiB. Arquivos maiores devem ser buscados por trecho (F3+). */
export const READ_FILE_MAX_BYTES = 262_144;

const definition: Tool = {
  description: "Lê o conteúdo de um arquivo de texto do projeto (caminho relativo à raiz).",
  inputSchema: {
    additionalProperties: false,
    properties: {
      path: {
        description: "Caminho do arquivo, relativo à raiz do projeto.",
        type: "string",
      },
    },
    required: ["path"],
    type: "object",
  },
  name: "read_file",
};

export const readFileTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const absolute = context.workspace.resolve(input.path);
    const bytes = await readFileWithin(context.workspace, absolute, READ_FILE_MAX_BYTES);
    // Marca a leitura para habilitar edições subsequentes (guarda do edit_file).
    context.readTracker?.markRead(context.workspace.toRelative(absolute));
    return textResult(bytes.toString("utf8"));
  },
};
