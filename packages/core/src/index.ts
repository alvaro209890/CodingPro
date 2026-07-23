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
  CHECKPOINT_MAX_FILE_BYTES,
  type CheckpointMeta,
  type CheckpointRecorder,
  CheckpointStore,
  type FileSnapshot,
  type FileStatus,
  type UndoResult,
} from "./checkpoints.js";
export {
  type CompactionOptions,
  type CompactionResult,
  compactMessages,
  estimateMessageTokens,
} from "./compaction.js";
export {
  diffLinhas,
  type FormatarDiffOptions,
  formatarDiff,
  type LinhaDiff,
  type TipoLinha,
} from "./diff.js";
export { CoreError, type CoreErrorCode } from "./errors.js";
export { readFileWithin, removeFileWithin, writeFileWithin } from "./fs-safe.js";
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
export {
  describeAgentEvent,
  describeToolCall,
  describeToolResult,
  PROGRESS_THINKING,
} from "./progress.js";
export {
  formatarPreviaDeEscrita,
  PREVIA_MAX_LINHAS,
  type PreviaEscrita,
  resolverPreviaDeEscrita,
} from "./preview.js";
export {
  alvosMakefile,
  contarExtensoes,
  detectarProjeto,
  gerarCodingproMd,
  type ProjetoInfo,
  resumoProjeto,
} from "./project-detect.js";
export { ToolRegistry } from "./registry.js";
export { RepoMapCache } from "./repo-map-cache.js";
export {
  construirRepoMap,
  REPO_MAP_MAX_ARQUIVOS,
  REPO_MAP_ORCAMENTO_TOKENS,
  REPO_MAX_FILE_BYTES,
  type RepoMap,
  type RepoMapArquivo,
  type RepoMapOptions,
} from "./repo-map.js";
export {
  extrairSimbolos,
  type Linguagem,
  linguagemDeArquivo,
  type Simbolo,
  SYMBOLS_MAX_LINHAS,
  SYMBOLS_MAX_SIMBOLOS,
  type TipoSimbolo,
} from "./symbols.js";
export { newSessionId, SessionStore } from "./session.js";
export { SYSTEM_PROMPT_V1 } from "./system-prompt.js";
export {
  createReadTracker,
  errorResult,
  type ExecutableTool,
  type ReadTracker,
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
  aplicarEdicoes,
  EDIT_FILE_MAX_BLOCKS,
  EDIT_FILE_MAX_BYTES,
  type EditBlock,
  editFileTool,
  parseEditBlocks,
} from "./tools/edit-file.js";
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
export { repoMapTool } from "./tools/repo-map.js";
export { WRITE_FILE_MAX_BYTES, writeFileTool } from "./tools/write-file.js";
export { Workspace } from "./workspace.js";

import { bashTool } from "./tools/bash.js";
import { editFileTool } from "./tools/edit-file.js";
import { grepTool } from "./tools/grep.js";
import { listDirTool } from "./tools/list-dir.js";
import { readFileTool } from "./tools/read-file.js";
import { repoMapTool } from "./tools/repo-map.js";
import { writeFileTool } from "./tools/write-file.js";

/** Tools de leitura seguras — não têm efeito colateral e dispensam permissão. */
export const READ_ONLY_TOOLS = Object.freeze([
  readFileTool,
  listDirTool,
  grepTool,
  repoMapTool,
] as const);

/** Tools com efeito colateral — sempre passam pelo gate de permissão. */
export const EFFECT_TOOLS = Object.freeze([writeFileTool, editFileTool, bashTool] as const);

/** Todas as tools do núcleo, prontas para registrar. */
export const ALL_TOOLS = Object.freeze([...READ_ONLY_TOOLS, ...EFFECT_TOOLS] as const);
