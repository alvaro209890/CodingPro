import { bashTool } from "./tools/bash.js";
import { codeSearchTool } from "./tools/code-search.js";
import { editFileTool } from "./tools/edit-file.js";
import { grepTool } from "./tools/grep.js";
import { listDirTool } from "./tools/list-dir.js";
import { readFileTool } from "./tools/read-file.js";
import { rememberTool } from "./tools/remember.js";
import { repoMapTool } from "./tools/repo-map.js";
import { taskTool } from "./tools/task.js";
import { webExtractTool, webSearchTool } from "./tools/web-search.js";
import { writeFileTool } from "./tools/write-file.js";

/** Tools de leitura seguras — não têm efeito colateral e dispensam permissão. */
export const READ_ONLY_TOOLS = Object.freeze([
  readFileTool,
  listDirTool,
  grepTool,
  repoMapTool,
  codeSearchTool,
  webSearchTool,
  webExtractTool,
] as const);

/** Tools com efeito colateral — sempre passam pelo gate de permissão. */
export const EFFECT_TOOLS = Object.freeze([writeFileTool, editFileTool, bashTool] as const);

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

/** Pool de tools que um subagente pode receber (nunca inclui `task` — sem aninhar). */
export const SUBAGENT_TOOL_POOL = Object.freeze([
  ...READ_ONLY_TOOLS,
  ...MEMORY_TOOLS,
  ...EFFECT_TOOLS,
] as const);
