import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { readFileWithin } from "../fs-safe.js";
import { type ExecutableTool, errorResult, type ToolContext, textResult } from "../tool.js";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage", ".next", "build"]);
const MAX_FILE_BYTES = 512_000;
const MAX_RESULTS = 40;
const MAX_LINE = 200;

const definition: Tool = {
  description:
    "Encontra onde um símbolo (nome de função/classe/variável) é referenciado no projeto. " +
    "Busca literal; devolve até 40 ocorrências no formato arquivo:linha: trecho.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      pathPrefix: {
        description: "Restringe a busca a um subdiretório relativo.",
        type: "string",
      },
      symbol: { description: "Nome do símbolo a procurar.", type: "string" },
    },
    required: ["symbol"],
    type: "object",
  },
  name: "find_references",
};

async function varrer(
  rootAbs: string,
  rel: string,
  profundidade: number,
  arquivos: string[],
): Promise<void> {
  if (arquivos.length >= 2_000 || profundidade > 12) return;
  let entradas: Dirent[];
  try {
    entradas = await readdir(rootAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entradas) {
    if (e.isSymbolicLink()) continue;
    const nome = e.name;
    const filhoRel = rel === "." ? nome : `${rel}/${nome}`;
    const filhoAbs = join(rootAbs, nome);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(nome)) continue;
      await varrer(filhoAbs, filhoRel, profundidade + 1, arquivos);
    } else if (e.isFile()) {
      arquivos.push(filhoRel);
    }
  }
}

export const findReferencesTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const symbol = typeof input.symbol === "string" ? input.symbol.trim() : "";
    if (!symbol) return errorResult("Informe o símbolo.");
    const prefix =
      typeof input.pathPrefix === "string" && input.pathPrefix.trim() !== ""
        ? input.pathPrefix.trim().replace(/\\/gu, "/")
        : ".";

    const startAbs = prefix === "." ? context.workspace.root : context.workspace.resolve(prefix);
    const arquivos: string[] = [];
    await varrer(startAbs, prefix === "." ? "." : prefix, 0, arquivos);

    const hits: string[] = [];
    for (const rel of arquivos) {
      if (hits.length >= MAX_RESULTS) break;
      try {
        const abs = context.workspace.resolve(rel === "." ? "" : rel);
        const bytes = await readFileWithin(context.workspace, abs, MAX_FILE_BYTES);
        const texto = bytes.toString("utf8");
        const linhas = texto.split("\n");
        for (let i = 0; i < linhas.length; i += 1) {
          if (hits.length >= MAX_RESULTS) break;
          const linha = linhas[i] ?? "";
          if (!linha.includes(symbol)) continue;
          const trecho = linha.length > MAX_LINE ? `${linha.slice(0, MAX_LINE)}…` : linha.trimEnd();
          const caminho = context.workspace.toRelative(abs);
          hits.push(`${caminho}:${i + 1}: ${trecho}`);
        }
      } catch {
        // ignora arquivos ilegíveis
      }
    }

    if (hits.length === 0) {
      return textResult(`Nenhuma referência a "${symbol}" encontrada.`);
    }
    return textResult(
      `${hits.length} referência(s) a "${symbol}"` +
        `${hits.length >= MAX_RESULTS ? " (teto)" : ""}:\n\n${hits.join("\n")}`,
    );
  },
};
