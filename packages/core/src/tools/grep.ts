import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { JsonObject, JsonValue, Tool, ToolResult } from "@codingpro/llm";
import { CoreError } from "../errors.js";
import { readFileWithin } from "../fs-safe.js";
import type { ExecutableTool, ToolContext } from "../tool.js";

/**
 * Busca LITERAL (não regex) para eliminar ReDoS por completo — o padrão do usuário nunca
 * vira `RegExp`. Suporte a regex com motor linear fica para uma fase futura.
 */
export const GREP_MAX_PATTERN = 1_000;
export const GREP_MAX_FILE_BYTES = 1_048_576; // 1 MiB por arquivo
export const GREP_MAX_TOTAL_BYTES = 10 * 1_048_576; // 10 MiB escaneados por chamada
export const GREP_MAX_RESULTS_CAP = 1_000;
export const GREP_DEFAULT_MAX_RESULTS = 200;
export const GREP_DEADLINE_MS = 5_000;
const SKIP_DIRS = new Set([".git", "node_modules"]);
const MAX_LINE_LENGTH = 1_000;

const definition: Tool = {
  description:
    "Busca literal de um texto nos arquivos do projeto (recursivo). Sem `path`, busca da raiz. " +
    "Ignora binários, .git e node_modules.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      ignoreCase: { description: "Ignorar maiúsculas/minúsculas.", type: "boolean" },
      maxResults: { description: "Máximo de ocorrências a retornar.", type: "integer" },
      path: { description: "Subdiretório inicial, relativo à raiz.", type: "string" },
      pattern: { description: "Texto literal a procurar.", type: "string" },
    },
    required: ["pattern"],
    type: "object",
  },
  name: "grep",
};

interface Match {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function clampMaxResults(value: JsonValue | undefined): number {
  if (typeof value !== "number") {
    return GREP_DEFAULT_MAX_RESULTS;
  }
  return Math.min(Math.max(1, Math.trunc(value)), GREP_MAX_RESULTS_CAP);
}

export const grepTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const pattern = input.pattern;
    if (typeof pattern !== "string" || pattern.length === 0) {
      throw new CoreError("invalid-input", "O texto de busca é obrigatório.");
    }
    if (pattern.length > GREP_MAX_PATTERN) {
      throw new CoreError("invalid-input", "O texto de busca é longo demais.");
    }
    const ignoreCase = input.ignoreCase === true;
    const needle = ignoreCase ? pattern.toLowerCase() : pattern;
    const maxResults = clampMaxResults(input.maxResults);

    const requested =
      input.path === undefined ? context.workspace.root : context.workspace.resolve(input.path);
    const base = await context.workspace.realpathInside(requested);

    const matches: Match[] = [];
    const visited = new Set<string>();
    const deadline = Date.now() + GREP_DEADLINE_MS;
    let scannedBytes = 0;
    let truncated = false;

    const budgetLeft = (): boolean => {
      if (matches.length >= maxResults || scannedBytes >= GREP_MAX_TOTAL_BYTES) {
        truncated = true;
        return false;
      }
      if (Date.now() > deadline || context.signal?.aborted === true) {
        truncated = true;
        return false;
      }
      return true;
    };

    const scanFile = async (absolute: string): Promise<void> => {
      let bytes: Buffer;
      try {
        bytes = await readFileWithin(context.workspace, absolute, GREP_MAX_FILE_BYTES);
      } catch {
        return; // arquivo grande demais, sem permissão ou removido: ignora e segue.
      }
      scannedBytes += bytes.byteLength;
      if (bytes.includes(0)) {
        return; // binário
      }
      const relative = context.workspace.toRelative(absolute);
      const lines = bytes.toString("utf8").split(/\r?\n/u);
      for (let index = 0; index < lines.length; index += 1) {
        if (!budgetLeft()) {
          return;
        }
        const line = lines[index] ?? "";
        const haystack = ignoreCase ? line.toLowerCase() : line;
        if (haystack.includes(needle)) {
          matches.push({
            file: relative,
            line: index + 1,
            text: line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line,
          });
        }
      }
    };

    const walk = async (dir: string): Promise<void> => {
      if (!budgetLeft() || visited.has(dir)) {
        return;
      }
      visited.add(dir);
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!budgetLeft()) {
          return;
        }
        if (entry.isSymbolicLink()) {
          continue; // nunca segue symlink: evita escape e ciclos.
        }
        const child = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) {
            continue;
          }
          await walk(child);
        } else if (entry.isFile()) {
          await scanFile(child);
        }
      }
    };

    const baseStats = await stat(base);
    if (baseStats.isFile()) {
      await scanFile(base);
    } else if (baseStats.isDirectory()) {
      await walk(base);
    } else {
      throw new CoreError("not-found", "O caminho de busca é inválido.");
    }

    return {
      type: "json",
      value: {
        matches: matches.map((match) => ({ ...match })),
        truncated,
      },
    };
  },
};
