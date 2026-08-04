export {
  AGENT_DEFAULT_MAX_RETRIES,
  AGENT_DEFAULT_MAX_STEPS,
  AGENT_DEFAULT_RETRY_BASE_MS,
  AGENT_MAX_INVALID_REQUEST_FIXES,
  AGENT_MAX_TOOL_CALL_FIXES,
  type AgentEvent,
  type AgentFinishReason,
  type AgentResult,
  type RetryOptions,
  type RunAgentOptions,
  runAgent,
  sanitizeMessagesForProvider,
} from "./agent.js";
export {
  AGENTE_ARCHITECT,
  AGENTE_EXPLORER,
  AGENTE_REVIEWER,
  AGENTE_WORKER,
  parseTipoAgente,
  resolverTipoAgente,
  TIPOS_AGENTE_PADRAO,
  type TipoAgente,
} from "./agent-types.js";
export {
  diretrizAtribuicao,
  MODO_ATRIBUICAO_PADRAO,
  type ModoAtribuicao,
  modoAtribuicaoValido,
} from "./attribution.js";
export type { AutoEffortState } from "./auto-effort.js";
// Auto-effort (escolha automática Flash/Pro)
export {
  atualizarAutoEffort,
  criarAutoEffortState,
  prepararAutoEffort,
  resolverAutoEffort,
} from "./auto-effort.js";
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
  coletarSondas,
  type Diagnostico,
  type DoctorIo,
  formatarRelatorioDoctor,
  montarDiagnosticos,
  rodarDoctor,
  type SondasDoctor,
  verificarBinario,
  verificarEscrita,
  verificarGit,
  verificarProvider,
  verificarVersaoNode,
} from "./doctor.js";
export { CoreError, type CoreErrorCode } from "./errors.js";
export {
  CORE_UI_EVENT_PROTOCOL_VERSION,
  type CoreUiEvent,
  type IpcEnvelope,
  type UiPermissionEvent,
  type UiPermissionResponse,
  type UsageSnapshotUi,
  type UsageSourceUi,
} from "./events.js";
export { readFileWithin, removeFileWithin, writeFileWithin } from "./fs-safe.js";
export { ToolGate } from "./gate.js";
export {
  criarHookRunner,
  executarHook,
  HOOK_DEFAULT_TIMEOUT_MS,
  type Hook,
  type HookEvent,
  type HookOutcome,
  type HookRunner,
  rodarHooksStop,
} from "./hooks.js";
export { carregarHooks } from "./hooks-loader.js";
export {
  MCP_DEFAULT_TIMEOUT_MS,
  MCP_PROTOCOL_VERSION,
  McpClient,
  type McpServerConfig,
  nomeMcpTool,
  toolsDoServidorMcp,
} from "./mcp.js";
export { iniciarServidoresMcp, type ServidoresMcp } from "./mcp-loader.js";
export {
  type BlocoMemoriaEntrada,
  buscarMemorias,
  descricaoDe,
  gerarIndice,
  hojeIso,
  MEMORY_MAX_BYTES,
  MEMORY_MAX_NOME,
  MEMORY_RETRIEVAL_ORCAMENTO,
  MEMORY_RETRIEVAL_TOP_K,
  type Memoria,
  montarBlocoMemoria,
  pareceSegredo,
  parseMemoria,
  pontuarMemoria,
  type RetrievalOptions,
  serializarMemoria,
  slugify,
  type TipoMemoria,
  termosDe,
} from "./memory.js";
export { MemoryStore } from "./memory-store.js";
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
  blocoPlanoAtivo,
  type ClassificacaoArquiteto,
  classificarRespostaArquiteto,
  executarComandoPlan,
  formatarPerguntaUi,
  interpretarResposta,
  mensagemHistoricoPlano,
  type OpcaoPergunta,
  type PerguntaPlano,
  type PlanIo,
  type PlanoAtivo,
  parsePerguntas,
  promptFasePerguntas,
  promptFasePlano,
  type RespostaPergunta,
  type ResultadoPlan,
  salvarPlanoEmDisco,
} from "./plan.js";
export { getGlobalConfigDir, getGlobalMemoryDir, normalizePlatformPath } from "./platform-paths.js";
export {
  formatarPreviaDeEscrita,
  PREVIA_MAX_LINHAS,
  type PreviaEscrita,
  resolverPreviaDeEscrita,
} from "./preview.js";
export {
  describeAgentEvent,
  describeToolCall,
  describeToolResult,
  PROGRESS_THINKING,
} from "./progress.js";
export {
  alvosMakefile,
  contarExtensoes,
  detectarProjeto,
  gerarCodingproMd,
  type ProjetoInfo,
  resumoProjeto,
} from "./project-detect.js";
export {
  contarProblemas,
  corrigirQualidade,
  lerOpcoesQualidadeEnv,
  normalizarArquivos,
  type OpcoesQualidade,
  projetoUsaBiome,
  promptReparoQualidade,
  type QualidadeIo,
  type ResultadoQualidade,
  type RunnerBiome,
  verificarQualidade,
} from "./quality.js";
export { ToolRegistry } from "./registry.js";
export {
  construirRepoMap,
  REPO_MAP_MAX_ARQUIVOS,
  REPO_MAP_ORCAMENTO_TOKENS,
  REPO_MAX_FILE_BYTES,
  type RepoMap,
  type RepoMapArquivo,
  type RepoMapOptions,
} from "./repo-map.js";
export { RepoMapCache } from "./repo-map-cache.js";
export { obterDiff, promptRevisao } from "./review.js";
export { newSessionId, SessionStore } from "./session.js";
export {
  blocoSkill,
  parseSkill,
  SKILL_MAX_BYTES,
  type Skill,
  sugerirSkills,
} from "./skills.js";
export { carregarSkills, dirsSkills } from "./skills-loader.js";
export {
  type ExecutarSubagenteOptions,
  executarSubagente,
  orquestrarSubagentes,
  SUBAGENTE_MAX_PARALELO,
  SUBAGENTE_MAX_STEPS,
  SUBAGENTE_TIMEOUT_PADRAO_MS,
  type SubagenteEvento,
  type SubagenteRelatorio,
  type SubagenteSpawner,
  type TarefaSubagente,
} from "./subagent.js";
export {
  carregarTiposCustom,
  criarSpawnerSubagentes,
  type SpawnerOptions,
} from "./subagent-spawner.js";
export {
  extrairSimbolos,
  type Linguagem,
  linguagemDeArquivo,
  type Simbolo,
  SYMBOLS_MAX_LINHAS,
  SYMBOLS_MAX_SIMBOLOS,
  type TipoSimbolo,
} from "./symbols.js";
export { SYSTEM_PROMPT_V1 } from "./system-prompt.js";
export {
  createReadTracker,
  type ExecutableTool,
  errorResult,
  type MemoryScope,
  type ReadTracker,
  sanitizeToolText,
  type ToolContext,
  type ToolSideEffect,
  textResult,
} from "./tool.js";
export {
  ALL_TOOLS,
  EFFECT_TOOLS,
  filtrarToolsDoRuntime,
  MEMORY_TOOL_NAMES,
  MEMORY_TOOLS,
  ORCHESTRATION_TOOLS,
  READ_ONLY_TOOLS,
  SUBAGENT_TOOL_POOL,
} from "./tool-groups.js";
export {
  BASH_DEFAULT_TIMEOUT_MS,
  BASH_ENV_ALLOWLIST,
  BASH_MAX_COMMAND_LENGTH,
  BASH_MAX_OUTPUT_BYTES,
  BASH_MAX_TIMEOUT_MS,
  bashTool,
} from "./tools/bash.js";
export { codeSearchTool } from "./tools/code-search.js";
export {
  aplicarEdicoes,
  EDIT_FILE_MAX_BLOCKS,
  EDIT_FILE_MAX_BYTES,
  type EditBlock,
  editFileTool,
  parseEditBlocks,
} from "./tools/edit-file.js";
export {
  GLOB_MAX_RESULTS,
  globParaRegex,
  globTool,
} from "./tools/glob.js";
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
export { taskTool } from "./tools/task.js";
export { webExtractTool, webSearchTool } from "./tools/web-search.js";
export { WRITE_FILE_MAX_BYTES, writeFileTool } from "./tools/write-file.js";
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
  embeddingParaBlob,
  embedTexto,
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
  isNodeSqliteDisponivel,
  sanitizarQueryFts,
  VECTOR_DB_FILENAME,
  VECTOR_SCHEMA_VERSION,
  VectorStore,
  type VectorStoreStats,
} from "./vector/vector-store.js";
export { Workspace } from "./workspace.js";
