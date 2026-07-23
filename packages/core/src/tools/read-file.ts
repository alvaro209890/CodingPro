import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { readFileWithin } from "../fs-safe.js";
import { type ExecutableTool, textResult, type ToolContext } from "../tool.js";

/** Teto de leitura: 256 KiB. Arquivos maiores devem ser lidos por janela (offset/limit). */
export const READ_FILE_MAX_BYTES = 262_144;

const definition: Tool = {
  description:
    "Lê o conteúdo de um arquivo de texto do projeto (caminho relativo à raiz). " +
    "Opcional: 'offset' (linha inicial, base 1) e 'limit' (nº de linhas) para ler apenas uma janela — útil em arquivos grandes.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      path: {
        description: "Caminho do arquivo, relativo à raiz do projeto.",
        type: "string",
      },
      offset: {
        description: "Primeira linha a retornar (base 1). Padrão: início do arquivo.",
        type: "integer",
      },
      limit: {
        description: "Número máximo de linhas a retornar a partir de 'offset'.",
        type: "integer",
      },
    },
    required: ["path"],
    type: "object",
  },
  name: "read_file",
};

/** Lê um inteiro positivo opcional do input (ignora valores inválidos). */
function inteiroPositivo(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0 ? valor : undefined;
}

export const readFileTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const absolute = context.workspace.resolve(input.path);
    const bytes = await readFileWithin(context.workspace, absolute, READ_FILE_MAX_BYTES);
    // Marca a leitura para habilitar edições subsequentes (guarda do edit_file).
    context.readTracker?.markRead(context.workspace.toRelative(absolute));
    const texto = bytes.toString("utf8");

    const offset = inteiroPositivo(input.offset);
    const limit = inteiroPositivo(input.limit);
    if (offset === undefined && limit === undefined) {
      return textResult(texto);
    }

    // Janela por linhas (base 1). Fora do arquivo → janela vazia, com cabeçalho explicativo.
    const linhas = texto.split("\n");
    const inicio = offset === undefined ? 0 : Math.min(offset - 1, linhas.length);
    const fim = limit === undefined ? linhas.length : Math.min(inicio + limit, linhas.length);
    const janela = linhas.slice(inicio, fim);
    const cabecalho = `# linhas ${inicio + 1}–${fim} de ${linhas.length}\n`;
    return textResult(cabecalho + janela.join("\n"));
  },
};
