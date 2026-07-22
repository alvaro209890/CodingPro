import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { CoreError } from "../errors.js";
import type { ExecutableTool, ToolContext } from "../tool.js";

/** Teto de entradas listadas por diretório. */
export const LIST_DIR_MAX_ENTRIES = 1_000;

type EntryKind = "dir" | "file" | "link" | "other";

const definition: Tool = {
  description:
    "Lista as entradas de um diretório do projeto (não recursivo). Sem `path`, usa a raiz.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      path: {
        description: "Caminho do diretório, relativo à raiz do projeto.",
        type: "string",
      },
    },
    type: "object",
  },
  name: "list_dir",
};

export function kindOf(entry: {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}): EntryKind {
  if (entry.isSymbolicLink()) {
    return "link";
  }
  if (entry.isDirectory()) {
    return "dir";
  }
  if (entry.isFile()) {
    return "file";
  }
  return "other";
}

export function toListError(error: unknown): CoreError {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOTDIR") {
    return new CoreError("not-a-directory", "O caminho não é um diretório.");
  }
  if (code === "ENOENT") {
    return new CoreError("not-found", "O diretório não existe.");
  }
  return new CoreError("execution-failed", "Não foi possível listar o diretório.");
}

export const listDirTool: ExecutableTool = {
  definition,
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const requested =
      input.path === undefined ? context.workspace.root : context.workspace.resolve(input.path);
    const base = await context.workspace.realpathInside(requested);

    let raw: Dirent[];
    try {
      raw = await readdir(base, { withFileTypes: true });
    } catch (error) {
      throw toListError(error);
    }

    const sorted = raw
      .map((entry) => ({ kind: kindOf(entry), name: entry.name }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const truncated = sorted.length > LIST_DIR_MAX_ENTRIES;
    const entries = truncated ? sorted.slice(0, LIST_DIR_MAX_ENTRIES) : sorted;

    return { type: "json", value: { entries, truncated } };
  },
};
