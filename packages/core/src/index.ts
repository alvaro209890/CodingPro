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
  AGENTE_ARCHITECT,
  AGENTE_EXPLORER,
  AGENTE_REVIEWER,
  AGENTE_WORKER,
  parseTipoAgente,
  resolverTipoAgente,
  type TipoAgente,
  TIPOS_AGENTE_PADRAO,
} from "./agent-types.js";
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
export {
  diretrizAtribuicao,
  MODO_ATRIBUICAO_PADRAO,
  type ModoAtribuicao,
  modoAtribuicaoValido,
} from "./attribution.js";
export { CoreError, type CoreErrorCode } from "./errors.js";
export { readFileWithin, removeFileWithin, writeFileWithin } from "./fs-safe.js";
export { ToolGate } from "./gate.js";
export {
  criarHookRunner,
  executarHook,
  type Hook,
  HOOK_DEFAULT_TIMEOUT_MS,
  type HookEvent,
  type HookOutcome,
  type HookRunner,
  rodarHooksStop,
} from "./hooks.js";
export {
  type BlocoMemoriaEntrada,
  buscarMemorias,
  descricaoDe,
  gerarIndice,
  hojeIso,
  type Memoria,
  montarBlocoMemoria,
  MEMORY_MAX_BYTES,
  MEMORY_MAX_NOME,
  MEMORY_RETRIEVAL_ORCAMENTO,
  MEMORY_RETRIEVAL_TOP_K,
  parseMemoria,
  pareceSegredo,
  pontuarMemoria,
  type RetrievalOptions,
  serializarMemoria,
  slugify,
  termosDe,
  type TipoMemoria,
} from "./memory.js";
export { MemoryStore } from "./memory-store.js";
export {
  MCP_DEFAULT_TIMEOUT_MS,
  MCP_PROTOCOL_VERSION,
  McpClient,
  type McpServerConfig,
  nomeMcpTool,
  toolsDoServidorMcp,
} from "./mcp.js";
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
export {
  blocoSkill,
  parseSkill,
  SKILL_MAX_BYTES,
  type Skill,
  sugerirSkills,
} from "./skills.js";
export {
  executarSubagente,
  type ExecutarSubagenteOptions,
  orquestrarSubagentes,
  SUBAGENTE_MAX_PARALELO,
  SUBAGENTE_MAX_STEPS,
  type SubagenteRelatorio,
  type SubagenteSpawner,
  type TarefaSubagente,
} from "./subagent.js";
export { SYSTEM_PROMPT_V1 } from "./system-prompt.js";
export {
  createReadTracker,
  errorResult,
  type ExecutableTool,
  type MemoryScope,
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
export { rememberTool } from "./tools/remember.js";
export { repoMapTool } from "./tools/repo-map.js";
export { codeSearchTool } from "./tools/code-search.js";
export { TASK_MAX_TAREFAS, taskTool } from "./tools/task.js";
export { WRITE_FILE_MAX_BYTES, writeFileTool } from "./tools/write-file.js";
export { Workspace } from "./workspace.js";

// Busca vetorial local (SQLite FTS5 + embeddings offline)
export {
  CHUNK_MAX_CHARS,
  CHUNK_MAX_PER_FILE,
  type CodeChunk,
  fragmentarCodigo,
} from "./vector/chunking.js";
export {
  blobParaEmbedding,
  cosseno,
  EMBEDDING_DIM,
  embedTexto,
  embeddingParaBlob,
  hashToken,
  tokenizarCodigo,
} from "./vector/embeddings.js";
export {
  abrirStoreComIndice,
  type IndexarOptions,
  type IndexProgresso,
  type IndexResult,
  indexarRepositorio,
  VECTOR_MAX_ARQUIVOS,
  VECTOR_MAX_FILE_BYTES,
} from "./vector/vector-index.js";
export {
  type ChunkHit,
  dirCodingpro,
  type IndexFileRecord,
  sanitizarQueryFts,
  VECTOR_DB_FILENAME,
  VECTOR_SCHEMA_VERSION,
  type VectorStoreStats,
  VectorStore,
} from "./vector/vector-store.js";

// Auto-effort (escolha automática Flash/Pro)
export {
  atualizarAutoEffort,
  criarAutoEffortState,
  prepararAutoEffort,
  resolverAutoEffort,
} from "./auto-effort.js";
export type { AutoEffortState } from "./auto-effort.js";

import { bashTool } from "./tools/bash.js";
import { editFileTool } from "./tools/edit-file.js";
import { grepTool } from "./tools/grep.js";
import { listDirTool } from "./tools/list-dir.js";
import { readFileTool } from "./tools/read-file.js";
import { rememberTool } from "./tools/remember.js";
import { codeSearchTool } from "./tools/code-search.js";
import { repoMapTool } from "./tools/repo-map.js";
import { taskTool } from "./tools/task.js";
import { writeFileTool } from "./tools/write-file.js";

/** Tools de leitura seguras — não têm efeito colateral e dispensam permissão. */
export const READ_ONLY_TOOLS = Object.freeze([
  readFileTool,
  listDirTool,
  grepTool,
  repoMapTool,
  codeSearchTool,
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
