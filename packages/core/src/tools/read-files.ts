import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { readFileWithin } from "../fs-safe.js";
import { type ExecutableTool, errorResult, type ToolContext, textResult } from "../tool.js";
import { READ_FILE_MAX_BYTES } from "./read-file.js";

const MAX_PATHS = 20;
const DEFAULT_MAX_BYTES_TOTAL = 100_000;

const definition: Tool = {
  description:
    "Lê vários arquivos pequenos numa só chamada (até 20), com teto total de bytes. " +
    "Prefira isto a várias chamadas de read_file quando precisar de contexto paralelo.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      maxBytesTotal: {
        description: "Teto total de bytes somados (padrão 100000).",
        type: "integer",
      },
      paths: {
        description: "Caminhos relativos à raiz do projeto.",
        items: { type: "string" },
        type: "array",
      },
    },
    required: ["paths"],
    type: "object",
  },
  name: "read_files",
};

export const readFilesTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const bruto = input.paths;
    if (!Array.isArray(bruto) || bruto.length === 0) {
      return errorResult("Informe ao menos um caminho em paths.");
    }
    const paths = bruto
      .filter((p): p is string => typeof p === "string" && p.trim() !== "")
      .map((p) => p.trim())
      .slice(0, MAX_PATHS);
    if (paths.length === 0) {
      return errorResult("Nenhum caminho válido em paths.");
    }
    const maxTotal =
      typeof input.maxBytesTotal === "number" && Number.isSafeInteger(input.maxBytesTotal)
        ? Math.max(1, Math.min(1_000_000, input.maxBytesTotal))
        : DEFAULT_MAX_BYTES_TOTAL;

    const partes: string[] = [];
    let usados = 0;
    for (const path of paths) {
      if (usados >= maxTotal) {
        partes.push(`## ${path}\n(omitido: teto total de ${maxTotal} bytes atingido)`);
        continue;
      }
      try {
        const absolute = context.workspace.resolve(path);
        const resto = maxTotal - usados;
        const teto = Math.min(READ_FILE_MAX_BYTES, resto);
        const bytes = await readFileWithin(context.workspace, absolute, teto);
        context.readTracker?.markRead(context.workspace.toRelative(absolute));
        usados += bytes.length;
        const texto = bytes.toString("utf8");
        partes.push(`## ${path}\n${texto}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "falha ao ler";
        partes.push(`## ${path}\n(erro: ${msg})`);
      }
    }
    return textResult(
      `Lidos ${paths.length} caminho(s); ${usados} bytes.\n\n${partes.join("\n\n")}`,
    );
  },
};
