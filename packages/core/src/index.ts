export { CoreError, type CoreErrorCode } from "./errors.js";
export { readFileWithin } from "./fs-safe.js";
export { ToolRegistry } from "./registry.js";
export {
  errorResult,
  type ExecutableTool,
  textResult,
  type ToolContext,
} from "./tool.js";
export {
  GREP_DEADLINE_MS,
  GREP_DEFAULT_MAX_RESULTS,
  GREP_MAX_FILE_BYTES,
  GREP_MAX_PATTERN,
  GREP_MAX_RESULTS_CAP,
  GREP_MAX_TOTAL_BYTES,
  grepTool,
} from "./tools/grep.js";
export { LIST_DIR_MAX_ENTRIES, listDirTool } from "./tools/list-dir.js";
export { READ_FILE_MAX_BYTES, readFileTool } from "./tools/read-file.js";
export { Workspace } from "./workspace.js";

import { grepTool } from "./tools/grep.js";
import { listDirTool } from "./tools/list-dir.js";
import { readFileTool } from "./tools/read-file.js";

/** Tools de leitura seguras — não têm efeito colateral e dispensam permissão. */
export const READ_ONLY_TOOLS = Object.freeze([readFileTool, listDirTool, grepTool] as const);
