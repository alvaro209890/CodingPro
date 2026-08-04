import type { ExecutableTool } from "./tool.js";
import { applyPatchTool } from "./tools/apply-patch.js";
import { bashTool } from "./tools/bash.js";
import { checkpointRestoreTool } from "./tools/checkpoint-restore.js";
import { codeSearchTool } from "./tools/code-search.js";
import { editFileTool } from "./tools/edit-file.js";
import { editSymbolTool } from "./tools/edit-symbol.js";
import { findReferencesTool } from "./tools/find-references.js";
import { getDiagnosticsTool } from "./tools/get-diagnostics.js";
import { gitDiffTool } from "./tools/git-diff.js";
import { gitStatusTool } from "./tools/git-status.js";
import { globTool } from "./tools/glob.js";
import { grepTool } from "./tools/grep.js";
import { httpRequestTool } from "./tools/http-request.js";
import { listDirTool } from "./tools/list-dir.js";
import { readFileTool } from "./tools/read-file.js";
import { readFilesTool } from "./tools/read-files.js";
import { rememberTool } from "./tools/remember.js";
import { repoMapTool } from "./tools/repo-map.js";
import { runCommandTool } from "./tools/run-command.js";
import { runTestsTool } from "./tools/run-tests.js";
import { taskTool } from "./tools/task.js";
import { todoListTool } from "./tools/todo-list.js";
import { webExtractTool, webSearchTool } from "./tools/web-search.js";
import { writeFileTool } from "./tools/write-file.js";
import { isNodeSqliteDisponivel } from "./vector/vector-store.js";

/** Tools de leitura seguras — não têm efeito colateral e dispensam permissão. */
export const READ_ONLY_TOOLS = Object.freeze([
  readFileTool,
  readFilesTool,
  listDirTool,
  globTool,
  grepTool,
  findReferencesTool,
  repoMapTool,
  codeSearchTool,
  gitStatusTool,
  gitDiffTool,
  getDiagnosticsTool,
  runCommandTool,
  webSearchTool,
  webExtractTool,
  httpRequestTool,
] as const);

/** Tools com efeito colateral — sempre passam pelo gate de permissão. */
export const EFFECT_TOOLS = Object.freeze([
  writeFileTool,
  editFileTool,
  editSymbolTool,
  applyPatchTool,
  bashTool,
  runTestsTool,
  todoListTool,
  checkpointRestoreTool,
] as const);

/**
 * Tools de memória — escrevem só na loja de memória da CLI, nunca no projeto; pré-autorizadas via
 * `alwaysAllow`. O nome vive em `MEMORY_TOOL_NAMES` para o gate liberá-las sem prompt.
 */
export const MEMORY_TOOLS = Object.freeze([rememberTool] as const);

/** Nomes das tools de memória, para semear `alwaysAllow` na política de permissão. */
export const MEMORY_TOOL_NAMES = Object.freeze(MEMORY_TOOLS.map((t) => t.definition.name));

/** Tools de orquestração — delegam a subagentes; leitura pura, sem tocar o projeto direto. */
export const ORCHESTRATION_TOOLS = Object.freeze([taskTool] as const);

/** Todas as tools do núcleo, prontas para registrar. */
export const ALL_TOOLS = Object.freeze([
  ...READ_ONLY_TOOLS,
  ...EFFECT_TOOLS,
  ...MEMORY_TOOLS,
  ...ORCHESTRATION_TOOLS,
] as const);

/**
 * Pool de tools que um subagente pode receber (nunca inclui `task` — sem aninhar).
 * `checkpoint_restore` fica de fora: subagentes não têm CheckpointStore.
 */
export const SUBAGENT_TOOL_POOL = Object.freeze(
  [...READ_ONLY_TOOLS, ...MEMORY_TOOLS, ...EFFECT_TOOLS].filter(
    (tool) => tool.definition.name !== "checkpoint_restore",
  ),
);

/** Omite `code_search` quando `node:sqlite` não existe (Electron 34 / Node 20). */
export function filtrarToolsDoRuntime(tools: readonly ExecutableTool[]): readonly ExecutableTool[] {
  if (isNodeSqliteDisponivel()) {
    return tools;
  }
  return tools.filter((tool) => tool.definition.name !== "code_search");
}
