import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { relative, sep } from "node:path";
import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { CoreError } from "../errors.js";
import type { ExecutableTool, ToolContext } from "../tool.js";

/** Teto de caminhos devolvidos numa única busca. */
export const GLOB_MAX_RESULTS = 500;

/** Diretórios ignorados por padrão (ruído / dependências). */
const IGNORAR = new Set([
  ".git",
  "node_modules",
  ".codingpro",
  "dist",
  "coverage",
  ".next",
  "release",
]);

const definition: Tool = {
  description:
    "Busca arquivos do projeto por glob simples (`*`, `**`, `?`). Retorna caminhos relativos à raiz.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      pattern: {
        description: "Padrão glob, ex. `**/*.ts` ou `src/**/*.tsx`.",
        type: "string",
      },
      path: {
        description: "Subpasta de partida relativa à raiz (opcional).",
        type: "string",
      },
    },
    required: ["pattern"],
    type: "object",
  },
  name: "glob",
};

/** Converte glob simples em RegExp ancorada ao caminho relativo (com `/`). */
export function globParaRegex(pattern: string): RegExp {
  const normalizado = pattern.replaceAll("\\", "/").replace(/^\/+/u, "");
  let i = 0;
  let out = "^";
  while (i < normalizado.length) {
    const c = normalizado[i];
    if (c === undefined) {
      break;
    }
    if (c === "*" && normalizado[i + 1] === "*") {
      const next = normalizado[i + 2];
      if (next === "/" || next === undefined) {
        out += next === "/" ? "(?:.*/)?" : ".*";
        i += next === "/" ? 3 : 2;
        continue;
      }
      out += ".*";
      i += 2;
      continue;
    }
    if (c === "*") {
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    out += c.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
    i += 1;
  }
  out += "$";
  return new RegExp(out, "u");
}

async function coletarArquivos(
  dirAbs: string,
  rootAbs: string,
  acc: string[],
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new CoreError("timeout", "Busca cancelada.");
  if (acc.length >= GLOB_MAX_RESULTS) return;

  let entries: Dirent[];
  try {
    entries = await readdir(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (acc.length >= GLOB_MAX_RESULTS) return;
    if (IGNORAR.has(entry.name)) continue;
    const abs = `${dirAbs}${sep}${entry.name}`;
    if (entry.isDirectory()) {
      await coletarArquivos(abs, rootAbs, acc, signal);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = relative(rootAbs, abs).split(sep).join("/");
    acc.push(rel);
  }
}

export const globTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const pattern = typeof input.pattern === "string" ? input.pattern.trim() : "";
    if (pattern.length === 0 || pattern.length > 400) {
      throw new CoreError("invalid-input", "Informe um padrão glob válido.");
    }

    const startAbs =
      input.path === undefined
        ? context.workspace.root
        : await context.workspace.realpathInside(context.workspace.resolve(input.path));
    const rootAbs = await context.workspace.realpathInside(context.workspace.root);

    const todos: string[] = [];
    await coletarArquivos(startAbs, rootAbs, todos, context.signal);

    const re = globParaRegex(pattern);
    const matches = todos.filter((p) => re.test(p)).sort((a, b) => a.localeCompare(b));
    const truncated = matches.length >= GLOB_MAX_RESULTS || todos.length >= GLOB_MAX_RESULTS;
    const files = matches.slice(0, GLOB_MAX_RESULTS);

    return { type: "json", value: { files, pattern, truncated } };
  },
};
