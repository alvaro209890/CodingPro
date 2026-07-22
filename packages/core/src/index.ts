export {
  AGENT_DEFAULT_MAX_RETRIES,
  AGENT_DEFAULT_MAX_STEPS,
  AGENT_DEFAULT_RETRY_BASE_MS,
  type AgentEvent,
  type AgentFinishReason,
  type AgentResult,
  type RetryOptions,
  runAgent,
  type RunAgentOptions,
} from "./agent.js";
export {
  type CompactionOptions,
  type CompactionResult,
  compactMessages,
  estimateMessageTokens,
} from "./compaction.js";
export { CoreError, type CoreErrorCode } from "./errors.js";
export { readFileWithin, writeFileWithin } from "./fs-safe.js";
export { ToolGate } from "./gate.js";
export {
  type Approval,
  type Approver,
  decidePermission,
  deniedResult,
  PermissionController,
  type PermissionDecision,
  type PermissionMode,
  type PermissionPolicy,
  type PermissionRequest,
} from "./permissions.js";
export { ToolRegistry } from "./registry.js";
export { newSessionId, SessionStore } from "./session.js";
export { SYSTEM_PROMPT_V1 } from "./system-prompt.js";
export {
  errorResult,
  type ExecutableTool,
  textResult,
  type ToolContext,
  type ToolSideEffect,
} from "./tool.js";
export {
  BASH_DEFAULT_TIMEOUT_MS,
  BASH_ENV_ALLOWLIST,
  BASH_MAX_COMMAND_LENGTH,
  BASH_MAX_OUTPUT_BYTES,
  BASH_MAX_TIMEOUT_MS,
  bashTool,
} from "./tools/bash.js";
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
export { WRITE_FILE_MAX_BYTES, writeFileTool } from "./tools/write-file.js";
export { Workspace } from "./workspace.js";

import { bashTool } from "./tools/bash.js";
import { grepTool } from "./tools/grep.js";
import { listDirTool } from "./tools/list-dir.js";
import { readFileTool } from "./tools/read-file.js";
import { writeFileTool } from "./tools/write-file.js";

/** Tools de leitura seguras — não têm efeito colateral e dispensam permissão. */
export const READ_ONLY_TOOLS = Object.freeze([readFileTool, listDirTool, grepTool] as const);

/** Tools com efeito colateral — sempre passam pelo gate de permissão. */
export const EFFECT_TOOLS = Object.freeze([writeFileTool, bashTool] as const);

/** Todas as tools do núcleo, prontas para registrar. */
export const ALL_TOOLS = Object.freeze([...READ_ONLY_TOOLS, ...EFFECT_TOOLS] as const);
