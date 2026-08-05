import { type ExecOptions, exec } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AgentEvent,
  ALL_TOOLS,
  type Approval,
  type Approver,
  type AutoEffortState,
  atualizarAutoEffort,
  blocoPlanoAtivo,
  blocoSkill,
  CheckpointStore,
  type CoreUiEvent,
  carregarHooks,
  carregarSkills,
  carregarTiposCustom,
  classificarRespostaArquiteto,
  coletarSondas,
  compactMessages,
  construirRepoMap,
  corrigirQualidade,
  createReadTracker,
  criarAutoEffortState,
  criarHookRunner,
  criarSpawnerSubagentes,
  detectarProjeto,
  dirsSkills,
  estimateMessageTokens,
  filtrarToolsDoRuntime,
  formatarPerguntaUi,
  formatarRelatorioDoctor,
  gerarCodingproMd,
  type Hook,
  indexarRepositorio,
  iniciarServidoresMcp,
  interpretarResposta,
  isNodeSqliteDisponivel,
  lerOpcoesQualidadeEnv,
  MEMORY_TOOL_NAMES,
  MemoryStore,
  montarDiagnosticos,
  newSessionId,
  obterDiff,
  type PerguntaPlano,
  PermissionController,
  type PermissionRequest,
  type PlanoAtivo,
  type PreviaEscrita,
  parsePerguntas,
  prepararAutoEffort,
  promptFasePerguntas,
  promptFasePlano,
  promptReparoQualidade,
  promptRevisao,
  type ReadTracker,
  type RespostaPergunta,
  resolverAutoEffort,
  resolverPreviaDeEscrita,
  resumoProjeto,
  runAgent,
  type ServidoresMcp,
  SessionStore,
  type Skill,
  SUBAGENT_TOOL_POOL,
  type SubagenteSpawner,
  SYSTEM_PROMPT_V1,
  MEMORY_RETRIEVAL_TOP_K,
  montarBlocoMemoria,
  salvarPlanoEmDisco,
  sanitizeMessagesForProvider,
  type ToolContext,
  ToolGate,
  ToolRegistry,
  type UiPermissionResponse,
  type UsageSnapshotUi,
  Workspace,
  WRITE_FILE_MAX_BYTES,
  writeFileWithin,
} from "@codingpro/core";
import {
  type ChatMessage,
  DEEPSEEK_MODEL_FLASH,
  DeepSeekProvider,
  estimateCost,
  type Provider,
  ProviderError,
} from "@codingpro/llm";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import electronUpdater from "electron-updater";
import { parseSaldoMicro, type SaldoContaUI } from "../shared/saldo-conta.js";
import { COMANDOS_CHAT, textoAjudaComandos } from "../shared/slash-commands.js";
import {
  initialUpdateState,
  isNewerVersion,
  releaseNotesToText,
  type UpdateStateUI,
} from "../shared/updater.js";
import { decidirModoAcesso, permiteChavePropria } from "./politica-acesso.js";
import { type IndexedSession, ProjectIndexStore, ZERO_PERSISTED_USAGE } from "./project-index.js";
import { UsageLedger, type UsageSource } from "./usage-ledger.js";
import { appendDesktopDiagnostic } from "./diagnostics.js";

const { autoUpdater } = electronUpdater;

// Renderização em RDP/VM/máquinas sem GPU dedicada fica preta com aceleração de
// hardware (Chromium). Desligar evita janela vazia no primeiro start.
app.disableHardwareAcceleration();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TERMINAL_TIMEOUT_MS = 60_000;
const CONTEXT_BUDGET = 400_000;

let mainWindow: BrowserWindow | null = null;

/** Saldo da conta Cloud (micro-dólares), observado no header do proxy; `undefined` até ver. */
let saldoContaMicro: number | undefined;

/** Envia o saldo atual ao renderer (badge do cabeçalho). */
function notificarSaldoConta(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("codingpro:saldo-event", {
      saldoMicro: saldoContaMicro,
    } satisfies SaldoContaUI);
  }
}

/**
 * Lê o header `x-codingpro-creditos-micro` de uma resposta do proxy Cloud e
 * guarda/notifica o saldo observado. Não dispara se o valor não mudou.
 */
function capturarSaldoDoProxy(headers: Headers): void {
  const saldo = parseSaldoMicro(headers.get("x-codingpro-creditos-micro"));
  if (saldo === saldoContaMicro) return;
  saldoContaMicro = saldo;
  notificarSaldoConta();
}

let requestCounter = 0;
const pendingPermissions = new Map<string, (approval: Approval) => void>();

/** Modo atual do provider da sessão — vira "conta" após fallback de chave inválida. */
let providerModoAtual: "chave-propria" | "conta" = "chave-propria";

/** Pasta de trabalho escolhida na UI (independe do process.cwd do Electron). */
let selectedWorkspacePath: string = process.cwd();
const _SEM_PASTA = false; // true = modo "acesso total ao PC" (usa C:\ ou ~)
let runInFlight = false;
let activeAbort: AbortController | null = null;
let autoApprove = false;
let modoEconomico = false;
let _runStartMs = 0;
let _tokenCount = 0;
let _stepCount = 0;
let _thinkingMs = 0;
let projectIndex: ProjectIndexStore | null = null;
const UPDATE_DIAGNOSTIC = process.env.CODINGPRO_DIAGNOSTIC_UPDATE === "1";
const UPDATE_DIAGNOSTIC_DOWNLOAD = process.env.CODINGPRO_DIAGNOSTIC_UPDATE_DOWNLOAD === "1";
const UPDATE_FEED_URL =
  process.env.CODINGPRO_UPDATE_FEED_URL?.trim() || "https://codingpro.cursar.space/downloads";
const UPDATE_MANUAL_URL = "https://codingpro.cursar.space/comecar";
let updateState: UpdateStateUI = initialUpdateState("0.0.0", "development");
let diagnosticDownloadStarted = false;

function enviarEstadoUpdate(patch: Partial<UpdateStateUI>): UpdateStateUI {
  updateState = { ...updateState, ...patch };
  if (UPDATE_DIAGNOSTIC) {
    console.log(`[codingpro] update diagnostic: ${JSON.stringify(updateState)}`);
    if (
      UPDATE_DIAGNOSTIC_DOWNLOAD &&
      !diagnosticDownloadStarted &&
      updateState.mode === "nsis" &&
      updateState.status === "available"
    ) {
      diagnosticDownloadStarted = true;
      setImmediate(() => {
        void autoUpdater.downloadUpdate().catch((error: unknown) => {
          enviarEstadoUpdate({ error: mensagemUpdateError(error), status: "error" });
        });
      });
    }
    const terminal =
      updateState.status === "error" ||
      updateState.status === "not-available" ||
      updateState.status === "downloaded" ||
      (updateState.status === "available" && !UPDATE_DIAGNOSTIC_DOWNLOAD);
    if (terminal) setTimeout(() => app.quit(), 100);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("codingpro:update-event", updateState);
  }
  return updateState;
}

function mensagemUpdateError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/net::|network|internet|ENOTFOUND|ECONN/u.test(text)) {
    return "Não foi possível consultar atualizações. Verifique a conexão e tente novamente.";
  }
  return "A atualização não pôde ser concluída. Tente novamente mais tarde.";
}

async function verificarAtualizacao(): Promise<UpdateStateUI> {
  if (!app.isPackaged) {
    return enviarEstadoUpdate({ mode: "development", status: "not-available" });
  }
  enviarEstadoUpdate({ error: undefined, status: "checking" });
  if (updateState.mode === "portable") {
    try {
      const response = await fetch(`${UPDATE_FEED_URL}/latest.json`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`feed ${response.status}`);
      const latest = (await response.json()) as {
        version?: unknown;
        notes?: unknown;
        portableUrl?: unknown;
      };
      if (typeof latest.version !== "string") throw new Error("feed inválido");
      if (!isNewerVersion(latest.version, app.getVersion())) {
        return enviarEstadoUpdate({ status: "not-available" });
      }
      return enviarEstadoUpdate({
        availableVersion: latest.version,
        manualUrl: typeof latest.portableUrl === "string" ? latest.portableUrl : UPDATE_MANUAL_URL,
        releaseNotes: releaseNotesToText(latest.notes),
        status: "available",
      });
    } catch (error) {
      return enviarEstadoUpdate({ error: mensagemUpdateError(error), status: "error" });
    }
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    enviarEstadoUpdate({ error: mensagemUpdateError(error), status: "error" });
  }
  return updateState;
}

function configurarUpdater(): void {
  const mode = !app.isPackaged
    ? "development"
    : process.env.PORTABLE_EXECUTABLE_FILE
      ? "portable"
      : "nsis";
  updateState = initialUpdateState(app.getVersion(), mode);
  if (!app.isPackaged || mode === "portable") {
    if (app.isPackaged) setTimeout(() => void verificarAtualizacao(), 2_000);
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({ provider: "generic", url: UPDATE_FEED_URL });
  autoUpdater.on("checking-for-update", () => enviarEstadoUpdate({ status: "checking" }));
  autoUpdater.on("update-not-available", () =>
    enviarEstadoUpdate({ error: undefined, status: "not-available" }),
  );
  autoUpdater.on("update-available", (info) =>
    enviarEstadoUpdate({
      availableVersion: info.version,
      error: undefined,
      releaseNotes: releaseNotesToText(info.releaseNotes),
      status: "available",
    }),
  );
  autoUpdater.on("download-progress", (progress) =>
    enviarEstadoUpdate({
      progress: progress.percent,
      status: "downloading",
      total: progress.total,
      transferred: progress.transferred,
    }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    enviarEstadoUpdate({
      availableVersion: info.version,
      progress: 100,
      status: "downloaded",
    }),
  );
  autoUpdater.on("error", (error) =>
    enviarEstadoUpdate({ error: mensagemUpdateError(error), status: "error" }),
  );
  setTimeout(() => void verificarAtualizacao(), 2_000);
}

function lastWorkspaceFile(): string {
  return join(app.getPath("userData"), "last-workspace.json");
}

function projectIndexFile(): string {
  return join(app.getPath("userData"), "project-sessions-v1.json");
}

function carregarUltimoWorkspace(): string | undefined {
  try {
    const raw = readFileSync(lastWorkspaceFile(), "utf8");
    const data = JSON.parse(raw) as { cwd?: string };
    if (typeof data.cwd === "string" && data.cwd.trim() !== "" && existsSync(data.cwd)) {
      return resolvePath(data.cwd);
    }
  } catch {
    // best-effort
  }
  return undefined;
}

function salvarUltimoWorkspace(cwd: string): void {
  try {
    const dir = dirname(lastWorkspaceFile());
    mkdirSync(dir, { recursive: true });
    writeFileSync(lastWorkspaceFile(), JSON.stringify({ cwd }, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

function pastaDownloads(): string {
  const dl = join(homedir(), "Downloads");
  return existsSync(dl) ? dl : homedir();
}

function ehMonorepoCodingPro(cwd: string): boolean {
  return (
    existsSync(join(cwd, "pnpm-workspace.yaml")) && existsSync(join(cwd, "packages", "desktop"))
  );
}

async function montarSystemPromptDesktop(session: ChatSession): Promise<string> {
  const workspace = session.workspace;
  let projetoLinha = "";
  try {
    const info = await detectarProjeto(workspace);
    projetoLinha = resumoProjeto(info);
  } catch {
    projetoLinha = "(detecção indisponível)";
  }

  // Só as skills ATIVAS (/skill <nome>) entram no prompt — paridade com o chat da CLI.
  const blocosSkill = [...session.skillsAtivas]
    .map((nome) => session.skills.find((s) => s.nome === nome))
    .filter((s): s is Skill => s !== undefined)
    .map((s) => blocoSkill(s));
  const skillsStr =
    blocosSkill.length > 0
      ? `\n\n--- Skills ativas (/skill <nome> para ativar):\n${blocosSkill.join("\n\n")}`
      : "";

  const extra = [
    "",
    "Contexto do workspace (Desktop — paridade com a CLI após `cd` no projeto):",
    `- Raiz aberta (sandbox): ${workspace.root}`,
    `- Projeto detectado: ${projetoLinha}`,
    "- Toda tool (list_dir, read_file, write_file, bash, …) opera SÓ dentro desta raiz.",
    "- Paths relativos são relativos a esta raiz. Use list_dir / read_file / repo_map antes de afirmar o que existe.",
    "- Se o usuário pedir algo fora desta pasta (ex.: outro drive ou Downloads), diga a raiz atual e peça `/abrir <caminho>` ou o botão Pasta — não invente acesso externo.",
    "- Não diga que só pode trabalhar no monorepo CodingPro: a raiz é a pasta que o usuário abriu.",
    skillsStr,
  ].join("\n");
  const base = `${SYSTEM_PROMPT_V1}\n${extra}`;
  // I5 — repo map âncora: no 1º turno (histórico ainda vazio/curto) e com projeto detectado,
  // injeta o repo_map resumido (orçamento 1,5 k tok) para o agente não explorar às cegas.
  let comRepoMap = base;
  const turnoInicial =
    session.transcript.filter((m) => m.role === "user").length <= 1 && session.transcript.length <= 3;
  if (turnoInicial && projetoLinha.length > 0 && !projetoLinha.includes("detecção indisponível")) {
    try {
      const mapa = await construirRepoMap(workspace, {
        cacheDir: join(workspace.root, ".codingpro"),
        orcamentoTokens: 1_500,
        maxArquivos: 400,
      });
      if (mapa.texto.trim().length > 0) {
        comRepoMap = `${base}\n\n### Mapa do repositório (âncora do 1º turno — I5)\n${mapa.texto}`;
      }
    } catch {
      // repo map é best-effort — nunca derruba o turno
    }
  }
  // I4 — recall automático de memória: índices (sempre) + memórias relevantes ao turno,
  // paridade com a CLI (memory-runtime.promptDoTurno). Custo ~300 tok/sessão; evita
  // "reexplorar" decisões/fatos já memorizados em sessões anteriores.
  let comMemoria = base;
  try {
    const ultimaUsuario = [...session.transcript]
      .reverse()
      .find((m) => m.role === "user");
    const consulta =
      ultimaUsuario !== undefined && "content" in ultimaUsuario
        ? String(ultimaUsuario.content).slice(0, 2_000)
        : "";
    const [indiceGlobal, indiceProjeto, relGlobal, relProjeto] = await Promise.all([
      session.memoryGlobal.indice(),
      session.memoryProjeto.indice(),
      consulta.length > 0 ? session.memoryGlobal.buscar(consulta) : Promise.resolve([]),
      consulta.length > 0 ? session.memoryProjeto.buscar(consulta) : Promise.resolve([]),
    ]);
    const relevantes = [...relProjeto, ...relGlobal].slice(0, MEMORY_RETRIEVAL_TOP_K);
    const bloco = montarBlocoMemoria({ indiceGlobal, indiceProjeto, relevantes });
    if (bloco.length > 0) {
      // base já pode conter o repo map do 1º turno (I5) — anexa memória depois dele.
      comMemoria = `${comRepoMap}\n\n${bloco}`;
    } else {
      comMemoria = comRepoMap;
    }
  } catch {
    // memória é best-effort — nunca derruba o turno
    comMemoria = comRepoMap;
  }
  return session.planoAtivo === undefined
    ? comMemoria
    : `${comMemoria}\n\n${blocoPlanoAtivo(session.planoAtivo)}`;
}

async function escolherPastaProjeto(defaultPath?: string): Promise<string | undefined> {
  if (mainWindow === null) return undefined;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Selecionar pasta do projeto a analisar",
    defaultPath: defaultPath ?? pastaDownloads(),
    buttonLabel: "Abrir projeto",
  });
  if (result.canceled || result.filePaths.length === 0) return undefined;
  const chosen = result.filePaths[0];
  return chosen ? resolvePath(chosen) : undefined;
}

function definirWorkspace(cwd: string): string {
  selectedWorkspacePath = resolvePath(cwd);
  // multi-session: não limpa;
  salvarUltimoWorkspace(selectedWorkspacePath);
  projectIndex?.touchProject(selectedWorkspacePath);
  return selectedWorkspacePath;
}

function sendCoreEvent(event: CoreUiEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("codingpro:core-event", event);
  }
}

function rejectPendingPermissions(reason: Approval = "deny"): void {
  for (const [id, resolve] of pendingPermissions) {
    resolve(reason);
    pendingPermissions.delete(id);
  }
}

const approver: Approver = {
  async request(request: PermissionRequest, context: ToolContext): Promise<Approval> {
    if (autoApprove) return "approve-once";
    const requestId = `perm-${++requestCounter}`;
    let previa: PreviaEscrita | undefined;
    if (
      (request.toolName === "write_file" || request.toolName === "edit_file") &&
      request.input !== undefined
    ) {
      previa = await resolverPreviaDeEscrita(context.workspace, request.toolName, request.input);
    }

    return new Promise<Approval>((resolve) => {
      pendingPermissions.set(requestId, resolve);
      const event: CoreUiEvent =
        previa === undefined
          ? { type: "permission-request", request, requestId }
          : { type: "permission-request", request, requestId, previa };
      sendCoreEvent(event);
    });
  },
};

/** Pergunta pendente de um /plan em andamento (Q&A do arquiteto ao longo de vários turnos). */
interface PlanoPendente {
  readonly objetivo: string;
  readonly perguntas: readonly PerguntaPlano[];
  indice: number;
  respostas: RespostaPergunta[];
}

interface ChatSession {
  readonly cwd: string;
  readonly gate: ToolGate;
  provider: Provider;
  providerModo: "chave-propria" | "conta";
  readonly registry: ToolRegistry;
  readonly workspace: Workspace;
  readonly sessionStore: SessionStore;
  readonly checkpoints: CheckpointStore;
  readonly readTracker: ReadTracker;
  readonly memoryGlobal: MemoryStore;
  readonly memoryProjeto: MemoryStore;
  readonly subagentes?: SubagenteSpawner;
  readonly hooks: readonly Hook[];
  readonly mcp: ServidoresMcp;
  readonly skills: readonly Skill[];
  readonly skillsAtivas: Set<string>;
  readonly autoEffort: AutoEffortState;
  sessionId: string;
  transcript: ChatMessage[];
  usage: UsageLedger;
  planoAtivo?: PlanoAtivo | undefined;
  planoPendente?: PlanoPendente | undefined;
  /** Passos do plano ativo com status vivo para o PlanTracker (D7: emitir running/done). */
  planoPassos: readonly PassoPlanoUi[];
}

/** Passo do plano ativo com status vivo para a UI (mesmo shape do evento plan-task). */
interface PassoPlanoUi {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
}

let activeSession: ChatSession | null = null;

function obterApiKey(): string | undefined {
  // O produto instalado precisa passar pelo proxy Cloud para aplicar aprovação e créditos.
  // A chave local é uma conveniência exclusiva do runtime de desenvolvimento.
  if (!permiteChavePropria(app.isPackaged)) return undefined;

  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim().length > 0) {
    return process.env.DEEPSEEK_API_KEY.trim();
  }

  const envPaths = [
    join(selectedWorkspacePath, ".codingpro", ".env"),
    join(selectedWorkspacePath, ".env"),
    join(process.cwd(), ".codingpro", ".env"),
    join(process.cwd(), ".env"),
    join(homedir(), ".codingpro", ".env"),
    join(homedir(), ".config", "codingpro", "deepseek.env"),
    join(homedir(), ".hermes", ".env"),
    // monorepo: chave de dev ao lado do package desktop
    join(__dirname, "..", "..", "..", "..", ".codingpro", ".env"),
    join(__dirname, "..", "..", "..", ".codingpro", ".env"),
  ];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, "utf8");
      const match = content.match(/^DEEPSEEK_API_KEY=(.+)$/m);
      if (match?.[1]) {
        const key = match[1].trim().replace(/^["']|["']$/g, "");
        if (key.length > 0) return key;
      }
    } catch {
      // best-effort
    }
  }
  return undefined;
}

/**
 * Credenciais da conta do CodingPro Cloud, gravadas pelo `codingpro login`.
 * O app desktop distribuído usa exatamente o mesmo arquivo que a CLI: quem já entrou
 * pelo terminal não precisa entrar de novo, e quem só tem o app entra pela mesma tela
 * do site. Na versão empacotada, uma conta é sempre obrigatória; chave própria só é
 * aceita durante o desenvolvimento local.
 */
function obterCredenciaisConta(): { token: string; apiUrl: string } | undefined {
  const caminho = join(homedir(), ".codingpro", "credenciais.json");
  if (!existsSync(caminho)) return undefined;
  try {
    const dados = JSON.parse(readFileSync(caminho, "utf8")) as {
      token?: unknown;
      apiUrl?: unknown;
    };
    if (typeof dados.token !== "string" || !dados.token.startsWith("cp_")) return undefined;
    return {
      apiUrl:
        typeof dados.apiUrl === "string" ? dados.apiUrl : "https://codingpro-api.cursar.space",
      token: dados.token,
    };
  } catch {
    return undefined;
  }
}

/** Estado de acesso do app, consultado pelo renderer para decidir se mostra a tela de login. */
export type EstadoAcesso = {
  readonly modo: "conta" | "chave-propria" | "sem-acesso";
  readonly apiUrl?: string;
  readonly prefixoToken?: string;
};

function obterEstadoAcesso(): EstadoAcesso {
  const conta = obterCredenciaisConta();
  const apiKey = obterApiKey();
  const modo = decidirModoAcesso({
    empacotado: app.isPackaged,
    temChavePropria: apiKey !== undefined && apiKey.trim().length > 0,
    temConta: conta !== undefined,
  });
  if (modo === "conta" && conta) {
    return { apiUrl: conta.apiUrl, modo: "conta", prefixoToken: conta.token.slice(0, 11) };
  }
  return { modo };
}

function criarProvider(role?: "main" | "fast"): Provider {
  const papel = role === undefined ? {} : { role };

  // Fallback ativo: se a chave própria falhou e a sessão caiu para a conta cloud,
  // todos os providers criados depois (subagentes, repair) usam a conta também.
  if (providerModoAtual === "conta") {
    const contaFallback = obterCredenciaisConta();
    if (contaFallback) {
      return new DeepSeekProvider({
        aoReceberResposta: capturarSaldoDoProxy,
        apiKey: contaFallback.token,
        baseUrl: `${contaFallback.apiUrl}/v1`,
        ...papel,
      });
    }
  }

  // Chave própria tem prioridade somente no desenvolvimento. O app empacotado não
  // pode contornar aprovação e créditos com uma chave encontrada neste computador.
  const apiKey = obterApiKey();
  if (apiKey !== undefined && apiKey.trim().length > 0) {
    // Thinking sempre ligado (raciocínio dinâmico): `fast` → high, `main`/padrão → max.
    return new DeepSeekProvider({
      apiKey,
      ...papel,
    });
  }

  const conta = obterCredenciaisConta();
  if (conta) {
    return new DeepSeekProvider({
      aoReceberResposta: capturarSaldoDoProxy,
      apiKey: conta.token,
      baseUrl: `${conta.apiUrl}/v1`,
      ...papel,
    });
  }

  throw new Error(
    app.isPackaged
      ? "Nenhuma conta conectada. Entre com sua conta CodingPro para continuar."
      : "Nenhuma conta conectada. Entre com sua conta CodingPro ou defina DEEPSEEK_API_KEY no ambiente de desenvolvimento.",
  );
}

function mensagemAssistente(content: string): ChatMessage {
  return { role: "assistant", content };
}

/**
 * Fallback de autenticação: se o turno falhar por chave própria inválida (401/403)
 * e existir conta cloud conectada, troca o provider da sessão para a conta e
 * re-executa o runAgent uma única vez.
 */
async function runAgentComFallback(
  session: ChatSession,
  params: Omit<Parameters<typeof runAgent>[0], "provider"> & { provider?: Provider },
): Promise<Awaited<ReturnType<typeof runAgent>>> {
  try {
    return await runAgent({ ...params, provider: params.provider ?? session.provider });
  } catch (err) {
    const ehAuth =
      err instanceof ProviderError &&
      (err.code === "provider-failed" || err.code === "invalid-request") &&
      /autentica/i.test(err.safeMessage);
    if (!ehAuth) throw err;
    if (session.providerModo === "conta") throw err; // já está na conta — não re-tenta

    const conta = obterCredenciaisConta();
    if (!conta) throw err;

    session.provider = new DeepSeekProvider({
      aoReceberResposta: capturarSaldoDoProxy,
      apiKey: conta.token,
      baseUrl: `${conta.apiUrl}/v1`,
    });
    session.providerModo = "conta";
    providerModoAtual = "conta";
    sendCoreEvent({
      type: "agent-event",
      event: {
        type: "notice",
        text: "Chave DeepSeek local inválida — usando conta CodingPro Cloud.",
      },
    });
    return await runAgent({ ...params, provider: session.provider });
  }
}

function mensagemUsuario(content: string): ChatMessage {
  return { role: "user", content };
}

function formatarCusto(session: ChatSession): string {
  const usage = snapshotCusto(session);
  const restam = Math.max(0, CONTEXT_BUDGET - usage.contextTokens);
  if (usage.turns === 0) {
    return [
      "· sem custo de API ainda nesta sessão",
      `· contexto estimado: ${usage.contextTokens.toLocaleString("pt-BR")} / ${CONTEXT_BUDGET.toLocaleString("pt-BR")} tok · restam ${restam.toLocaleString("pt-BR")}`,
    ].join("\n");
  }
  return [
    `sessão: US$ ${usage.totalCostUsd.toFixed(6)} · in ${usage.inputTokens} · out ${usage.outputTokens} · cache ${usage.cacheReadTokens} · raciocínio ${usage.reasoningTokens}`,
    `turnos ${usage.turns} · chamadas ${usage.apiCalls} · subagentes ${usage.subagentCalls}`,
    `contexto: ${usage.contextTokens.toLocaleString("pt-BR")} / ${CONTEXT_BUDGET.toLocaleString("pt-BR")} tok · restam ${restam.toLocaleString("pt-BR")}`,
  ].join("\n");
}

function snapshotCusto(
  session: ChatSession | null,
  estimated = false,
  extraOutputTokens = 0,
): UsageSnapshotUi {
  if (session === null) {
    return {
      apiCalls: 0,
      cacheReadTokens: 0,
      contextBudget: CONTEXT_BUDGET,
      contextTokens: 0,
      estimated,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      sources: [],
      subagentCalls: 0,
      totalCostUsd: 0,
      turns: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  const msgs: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT_V1 },
    ...session.transcript,
  ];
  const contextTokens = msgs.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
  const totals = session.usage.totals();
  const estimate =
    extraOutputTokens > 0
      ? estimateCost({ inputTokens: 0, outputTokens: extraOutputTokens }, DEEPSEEK_MODEL_FLASH)
          .totalCostUsd
      : 0;
  return {
    apiCalls: totals.apiCalls,
    cacheReadTokens: totals.cacheReadTokens,
    contextBudget: CONTEXT_BUDGET,
    contextTokens: contextTokens + extraOutputTokens,
    estimated,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens + extraOutputTokens,
    reasoningTokens: totals.reasoningTokens,
    sources: totals.sources,
    subagentCalls: totals.subagentCalls,
    totalCostUsd: totals.totalCostUsd + estimate,
    turns: totals.turns,
    updatedAt: new Date().toISOString(),
  };
}

function sendUsage(session: ChatSession, estimated = false, extraOutputTokens = 0): void {
  sendCoreEvent({
    snapshot: snapshotCusto(session, estimated, extraOutputTokens),
    type: "usage-updated",
  });
}

function tituloDaSessao(session: ChatSession): string {
  const first = session.transcript.find((message) => message.role === "user") as
    | { role: "user"; content: string }
    | undefined;
  if (!first || first.content.trim() === "") return `Sessão ${session.sessionId.slice(0, 19)}`;
  const compact = first.content.replace(/\s+/gu, " ").trim();
  return compact.length > 80 ? `${compact.slice(0, 80)}…` : compact;
}

function persistirIndiceSessao(session: ChatSession): void {
  const totals = session.usage.totals();
  const existing = projectIndex?.getSession(session.cwd, session.sessionId);
  const metadata: IndexedSession = {
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    id: session.sessionId,
    title: tituloDaSessao(session),
    updatedAt: new Date().toISOString(),
    usage: {
      apiCalls: totals.apiCalls,
      cacheReadTokens: totals.cacheReadTokens,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      reasoningTokens: totals.reasoningTokens,
      subagentCalls: totals.subagentCalls,
      totalCostUsd: totals.totalCostUsd,
      turns: totals.turns,
    },
  };
  projectIndex?.upsertSession(session.cwd, metadata);
}

async function sincronizarSessoesConhecidas(): Promise<void> {
  if (!projectIndex) return;
  if (activeSession?.transcript.length) persistirIndiceSessao(activeSession);
  for (const group of projectIndex.groups()) {
    if (!group.available) continue;
    try {
      const store = await SessionStore.create(join(group.workspacePath, ".codingpro", "sessions"));
      for (const id of await store.list()) {
        if (projectIndex.getSession(group.workspacePath, id)) continue;
        let title = `Sessão ${id.slice(0, 19)}`;
        try {
          const messages = await store.load(id);
          const first = messages.find((message) => message.role === "user") as
            | { role: "user"; content: string }
            | undefined;
          if (first?.content) {
            const compact = first.content.replace(/\s+/gu, " ").trim();
            title = compact.length > 80 ? `${compact.slice(0, 80)}…` : compact;
          }
        } catch {
          // Mantém o título por timestamp para sessão corrompida.
        }
        const path = join(group.workspacePath, ".codingpro", "sessions", `${id}.jsonl`);
        const stats = statSync(path);
        projectIndex.upsertSession(group.workspacePath, {
          createdAt: stats.birthtime.toISOString(),
          id,
          title,
          updatedAt: stats.mtime.toISOString(),
          usage: { ...ZERO_PERSISTED_USAGE },
        });
      }
    } catch {
      // Pastas removidas ou sem permissão continuam visíveis como indisponíveis.
    }
  }
}

/** Expande /goal em prompt de agente (/review e /plan já são tratados em handleLocalCommand). */
function expandirPromptAgente(prompt: string): string | undefined {
  const msg = prompt.trim();
  const lower = msg.toLowerCase();
  if (
    lower === "/goal" ||
    lower.startsWith("/goal ") ||
    lower === "/meta" ||
    lower.startsWith("/meta ")
  ) {
    const obj = msg.replace(/^\/(goal|meta)\s*/iu, "").trim();
    return obj.length > 0
      ? `Objetivo principal: ${obj}. Crie um plano com a tool 'task', quebrando em subtarefas do tipo explorer/worker. Use as tools para executar cada subtarefa e reporte progresso.`
      : "Defina um objetivo com: /goal <descricao>";
  }
  return undefined;
}

async function obterOuCriarSessao(cwd: string): Promise<ChatSession> {
  const normalized = resolvePath(cwd);
  if (activeSession !== null && activeSession.cwd === normalized) {
    return activeSession;
  }

  // troca de pasta → descarta sessão anterior
  rejectPendingPermissions("deny");
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
  if (activeSession !== null) {
    try {
      activeSession.mcp.fechar();
    } catch {
      // best-effort
    }
  }

  const workspace = await Workspace.create(normalized);
  const registry = new ToolRegistry();
  for (const tool of filtrarToolsDoRuntime(ALL_TOOLS)) {
    registry.register(tool);
  }

  // Hooks (pre/post-tool, stop) + MCP (servidores externos) + skills — paridade com a CLI.
  const [hooks, mcp, skills, tiposCustom] = await Promise.all([
    carregarHooks(normalized),
    iniciarServidoresMcp(normalized),
    carregarSkills(dirsSkills(normalized)),
    carregarTiposCustom(join(normalized, ".codingpro", "agents")),
  ]);
  for (const tool of mcp.tools) {
    registry.register(tool);
  }
  if (mcp.avisos.length > 0) {
    for (const aviso of mcp.avisos) {
      sendCoreEvent({ type: "agent-event", event: { type: "notice", text: aviso } });
    }
  }

  const permissionController = new PermissionController(
    { alwaysAllow: MEMORY_TOOL_NAMES, mode: "ask" },
    approver,
  );
  const gate = new ToolGate(
    registry,
    permissionController,
    hooks.length > 0 ? criarHookRunner(hooks) : undefined,
  );
  const provider = criarProvider();
  const chavePropria = obterApiKey();
  const providerModo: "chave-propria" | "conta" =
    chavePropria !== undefined && chavePropria.trim().length > 0
      ? "chave-propria"
      : obterCredenciaisConta() !== undefined
        ? "conta"
        : "conta"; // sem acesso: criarProvider já lançou; fallback tenta conta depois
  providerModoAtual = providerModo;
  const sessionStore = await SessionStore.create(join(normalized, ".codingpro", "sessions"));
  const checkpoints = await CheckpointStore.create(
    join(normalized, ".codingpro", "checkpoints"),
    workspace,
  );
  const readTracker = createReadTracker();
  const memoryGlobal = MemoryStore.create(join(homedir(), ".codingpro", "memory"));
  const memoryProjeto = MemoryStore.create(join(normalized, ".codingpro", "memory"));

  // SubagenteSpawner: fábrica de subagentes para a tool `task` e para /plan e /review —
  // inclui tipos customizados de `.codingpro/agents/*.md` (paridade com a CLI).
  let sessionRef: ChatSession | undefined;
  const spawner = criarSpawnerSubagentes({
    approver,
    custom: tiposCustom,
    criarProvider: (role) => {
      if (role === "fast") {
        try {
          return criarProvider("fast");
        } catch {
          return criarProvider();
        }
      }
      try {
        return criarProvider("main");
      } catch {
        return criarProvider();
      }
    },
    memory: { global: memoryGlobal, projeto: memoryProjeto },
    onEvent: (event) => {
      sendCoreEvent({ event, type: "subagent-event" });
      if (!sessionRef) return;
      if (event.type === "started") {
        sessionRef.usage.beginSubagent();
        sendUsage(sessionRef, true);
      } else if (event.type === "step" && event.usage) {
        const cost = estimateCost(event.usage, DEEPSEEK_MODEL_FLASH);
        sessionRef.usage.record(
          `subagent:${event.id}`,
          `${event.id}:step:${event.step}`,
          event.usage,
          cost.totalCostUsd,
        );
        sendUsage(sessionRef);
      }
    },
    provider,
    toolPool: filtrarToolsDoRuntime(SUBAGENT_TOOL_POOL),
    workspace,
  });

  const sess: ChatSession = {
    autoEffort: criarAutoEffortState(),
    cwd: normalized,
    gate,
    hooks,
    mcp,
    provider,
    providerModo,
    registry,
    sessionStore,
    checkpoints,
    readTracker,
    memoryGlobal,
    memoryProjeto,
    skills,
    skillsAtivas: new Set<string>(),
    subagentes: spawner,
    sessionId: newSessionId(),
    transcript: [],
    workspace,
    usage: new UsageLedger(),
    planoPassos: [],
  };
  sessionRef = sess;
  selectedWorkspacePath = normalized;
  activeSession = sess;
  return sess;
}

async function novaSessaoVazia(): Promise<ChatSession> {
  const cwd = selectedWorkspacePath;
  const normalized = resolvePath(cwd);
  const session = await obterOuCriarSessao(normalized);
  session.transcript = [];
  session.sessionId = newSessionId();
  session.usage = new UsageLedger();
  activeSession = session;
  session.readTracker; // mantém tracker
  sendCoreEvent({ type: "session-updated", messages: [] });
  return session;
}

function createWindow(): void {
  const preloadPath = join(__dirname, "../preload/index.cjs");
  const diagnosticHeadless = process.env.CODINGPRO_DIAGNOSTIC_HEADLESS === "1";
  if (!existsSync(preloadPath)) {
    console.error("[codingpro] preload ausente:", preloadPath);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 680,
    minHeight: 650,
    autoHideMenuBar: true,
    title: "CodingPro Desktop",
    backgroundColor: "#0b0e14",
    show: false,
    icon: join(__dirname, "../../assets/branding/codingpro-mark.png"),
    webPreferences: {
      // Preload DEVE ser CommonJS (.cjs). Com "type":"module", o .js ESM falha no
      // renderer com ERR_UNSUPPORTED_ESM_URL_SCHEME (protocol 'electron:') e a UI
      // sobe sem window.codingproAPI — app “abre mas não responde”.
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!diagnosticHeadless) {
      mainWindow?.show();
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    void mainWindow?.webContents
      .executeJavaScript(`({
        api: typeof window.codingproAPI,
        rootChildren: document.getElementById("root")?.childElementCount ?? 0,
        bodyText: document.body.innerText.slice(0, 120),
      })`)
      .then((diagnostic: { api: string; rootChildren: number; bodyText: string }) => {
        console.log(`[codingpro] renderer diagnostic: ${JSON.stringify(diagnostic)}`);
        if (diagnostic.api !== "object") {
          console.error(
            "[codingpro] window.codingproAPI ausente — preload não carregou (use dist/preload/index.cjs).",
          );
        }
        if (diagnostic.rootChildren === 0) {
          console.error("[codingpro] renderer carregou sem montar a interface React.");
        }
      })
      .catch((err: unknown) => {
        console.error("[codingpro] falha ao inspecionar preload:", err);
      })
      .finally(() => {
        if (diagnosticHeadless && !UPDATE_DIAGNOSTIC) {
          app.quit();
        }
      });
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error(`[codingpro] falha ao carregar UI: ${code} ${desc}`);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const log = level >= 3 ? console.error : console.log;
    log(`[codingpro:renderer:${level}] ${message}${sourceId ? ` (${sourceId}:${line})` : ""}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[codingpro] renderer encerrado: ${details.reason} (${details.exitCode})`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.CODINGPRO_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    rejectPendingPermissions("deny");
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
    mainWindow = null;
  });
}

function execCommand(
  command: string,
  options: ExecOptions,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = exec(
      command,
      { ...options, timeout: TERMINAL_TIMEOUT_MS, windowsHide: true },
      (error, stdout, stderr) => {
        const code = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
        resolve({
          exitCode: code,
          stderr: (stderr || (error && !stdout ? error.message : "") || "").toString(),
          stdout: (stdout || "").toString(),
        });
      },
    );
    child.on("error", (err) => {
      resolve({ exitCode: 1, stderr: err.message, stdout: "" });
    });
  });
}

/**
 * Branch git da pasta aberta. A barra de status mostrava "master" fixo no código, o que
 * mentia em qualquer projeto — sem repositório, devolvemos `undefined` e a UI omite o campo.
 */
async function branchDoWorkspace(cwd: string): Promise<string | undefined> {
  if (!existsSync(join(cwd, ".git"))) return undefined;
  const r = await execCommand("git rev-parse --abbrev-ref HEAD", { cwd });
  if (r.exitCode !== 0) return undefined;
  const nome = r.stdout.trim();
  return nome.length > 0 && nome !== "HEAD" ? nome : undefined;
}

/** Extrai um checklist best-effort da seção "## Passos" do plano, para o PlanTracker da UI. */
function extrairPassosPlano(
  texto: string,
): Array<{ id: string; label: string; status: "pending" }> {
  const linhas = texto.replaceAll("\r\n", "\n").split("\n");
  const inicio = linhas.findIndex((l) => /^##\s*Passos/iu.test(l.trim()));
  if (inicio === -1) return [];
  const passos: Array<{ id: string; label: string; status: "pending" }> = [];
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const linha = (linhas[i] ?? "").trim();
    if (/^##\s/u.test(linha)) break;
    const m = /^(?:\d+[.)]\s*|[-*]\s*(?:\[[ xX]\]\s*)?)(.+)$/u.exec(linha);
    if (m?.[1] && m[1].trim().length > 0) {
      passos.push({
        id: `plano-${passos.length}`,
        label: m[1].trim().slice(0, 120),
        status: "pending",
      });
    }
    if (passos.length >= 20) break;
  }
  return passos;
}

/** Emite um passo do plano para a UI (PlanTracker) e atualiza o estado da sessão. */
function emitirPassoPlano(session: ChatSession, passo: PassoPlanoUi): void {
  sendCoreEvent({ type: "plan-task", task: passo });
  const idx = session.planoPassos.findIndex((p) => p.id === passo.id);
  const copia = [...session.planoPassos];
  if (idx === -1) {
    copia.push(passo);
  } else {
    copia[idx] = passo;
  }
  session.planoPassos = copia;
}

/**
 * D7: marca o próximo passo pendente como running no início de um run do agente.
 * Heurística: cada turno do agente "toca" um passo do plano (o tracker anda junto).
 */
function marcarProximoPassoRunning(session: ChatSession): void {
  if (session.planoPassos.length === 0) return;
  const proximo = session.planoPassos.find((p) => p.status === "pending");
  if (proximo === undefined) return;
  emitirPassoPlano(session, { ...proximo, status: "running" });
}

/** D7: conclui o passo que estava running ao fim de um run com sucesso. */
function marcarPassoRunningConcluido(session: ChatSession): void {
  for (const p of session.planoPassos) {
    if (p.status === "running") {
      emitirPassoPlano(session, { ...p, status: "done" });
      return;
    }
  }
}

/** D7: falha o passo running (run falhou/cancelado) — volta a pending para nova tentativa. */
function marcarPassoRunningFalho(session: ChatSession): void {
  for (const p of session.planoPassos) {
    if (p.status === "running") {
      emitirPassoPlano(session, { ...p, status: "pending" });
      return;
    }
  }
}

/** Persiste o plano, ativa-o na sessão e emite os passos para o PlanTracker. */
async function salvarEIniciarPlano(
  session: ChatSession,
  objetivo: string,
  texto: string,
  respostas: RespostaPergunta[],
  linhasProgresso: string[],
): Promise<{ handled: true; reply: string }> {
  const resultado = await salvarPlanoEmDisco(session.workspace.root, objetivo, texto, respostas, {
    progresso: (t: string) => linhasProgresso.push(t.replace(/\n$/u, "")),
    saida: () => {
      // o texto do plano já é anexado abaixo — evita duplicar na resposta do chat
    },
  });
  if (resultado.plano !== undefined) {
    session.planoAtivo = resultado.plano;
    const passos = extrairPassosPlano(texto);
    session.planoPassos = [];
    for (const passo of passos) {
      emitirPassoPlano(session, passo);
    }
  }
  linhasProgresso.push("", texto);
  return { handled: true, reply: linhasProgresso.join("\n") };
}

/** Inicia (ou responde a Q&A pendente de) `/plan`: arquiteto → perguntas → plano em disco. */
async function iniciarComandoPlano(
  session: ChatSession,
  msg: string,
  signal?: AbortSignal,
): Promise<{ handled: true; reply: string }> {
  const arg = msg.replace(/^\/plan(o)?\s*/iu, "").trim();
  const argLower = arg.toLowerCase();
  if (argLower === "clear" || argLower === "limpar" || argLower === "none") {
    session.planoAtivo = undefined;
    session.planoPendente = undefined;
    session.planoPassos = [];
    return { handled: true, reply: "· plano ativo limpo" };
  }
  if (arg.length === 0) {
    return { handled: true, reply: "· uso: /plan <objetivo>  ·  /plan clear limpa o plano ativo" };
  }
  if (session.subagentes === undefined) {
    return { handled: true, reply: "· subagentes indisponíveis nesta sessão" };
  }

  const linhasProgresso = ["· arquiteto: verificando se precisa de decisões…"];
  const fase1 = await session.subagentes.executar("architect", promptFasePerguntas(arg), signal);
  const texto1 = fase1.texto.trim();
  const classe = classificarRespostaArquiteto(texto1);

  if (classe === "plano") {
    return salvarEIniciarPlano(session, arg, texto1, [], linhasProgresso);
  }

  const respostas: RespostaPergunta[] = [];
  if (classe === "perguntas") {
    const perguntas = parsePerguntas(texto1);
    if (perguntas.length > 0) {
      session.planoPendente = { objetivo: arg, perguntas, indice: 0, respostas: [] };
      const p = perguntas[0] as PerguntaPlano;
      linhasProgresso.push(
        `· ${perguntas.length} pergunta(s) — responda pelo número ou texto livre`,
        "",
        formatarPerguntaUi(p, perguntas.length),
      );
      return { handled: true, reply: linhasProgresso.join("\n") };
    }
    linhasProgresso.push(
      "· arquiteto pediu perguntas, mas o formato veio inválido — planejando direto…",
    );
  } else {
    linhasProgresso.push("· sem perguntas extras — montando o plano…");
  }

  linhasProgresso.push("· arquiteto redigindo o plano…");
  const fase2 = await session.subagentes.executar(
    "architect",
    promptFasePlano(arg, respostas),
    signal,
  );
  const planoTexto =
    fase2.texto.trim().length > 0 ? fase2.texto.trim() : "(o arquiteto não produziu plano)";
  return salvarEIniciarPlano(session, arg, planoTexto, respostas, linhasProgresso);
}

/** Trata a resposta do usuário a uma pergunta pendente do `/plan` em andamento. */
async function responderPerguntaPlano(
  session: ChatSession,
  resposta: string,
  signal?: AbortSignal,
): Promise<{ handled: true; reply: string }> {
  const pendente = session.planoPendente;
  if (pendente === undefined) {
    return { handled: true, reply: "" };
  }
  const perguntaAtual = pendente.perguntas[pendente.indice];
  if (perguntaAtual === undefined) {
    session.planoPendente = undefined;
    return { handled: true, reply: "· plano cancelado (estado inconsistente)" };
  }
  const { escolha, livre } = interpretarResposta(resposta, perguntaAtual);
  pendente.respostas.push({
    escolha,
    enunciado: perguntaAtual.enunciado,
    numero: perguntaAtual.numero,
    ...(livre ? { livre: true } : {}),
  });
  pendente.indice += 1;

  const linhasProgresso = [`· ✓ ${perguntaAtual.numero}: ${escolha}`];
  const proxima = pendente.perguntas[pendente.indice];
  if (proxima !== undefined) {
    linhasProgresso.push("", formatarPerguntaUi(proxima, pendente.perguntas.length));
    return { handled: true, reply: linhasProgresso.join("\n") };
  }

  const objetivo = pendente.objetivo;
  const respostas = pendente.respostas;
  session.planoPendente = undefined;
  if (session.subagentes === undefined) {
    return { handled: true, reply: "· subagentes indisponíveis nesta sessão" };
  }
  linhasProgresso.push("· arquiteto redigindo o plano…");
  const fase2 = await session.subagentes.executar(
    "architect",
    promptFasePlano(objetivo, respostas),
    signal,
  );
  const planoTexto =
    fase2.texto.trim().length > 0 ? fase2.texto.trim() : "(o arquiteto não produziu plano)";
  return salvarEIniciarPlano(session, objetivo, planoTexto, respostas, linhasProgresso);
}

/** `/review`: diff real (git) + subagente reviewer — paridade com o chat da CLI. */
async function executarReviewDesktop(
  session: ChatSession,
  msg: string,
  signal?: AbortSignal,
): Promise<{ handled: true; reply: string }> {
  const alvo = msg.replace(/^\/review\s*/iu, "").trim();
  const { diff, erro } = await obterDiff(
    session.workspace.root,
    alvo.length > 0 ? alvo : undefined,
  );
  if (erro !== undefined) {
    return { handled: true, reply: `· ${erro}` };
  }
  if (session.subagentes === undefined) {
    return { handled: true, reply: "· subagentes indisponíveis nesta sessão" };
  }
  const rel = await session.subagentes.executar("reviewer", promptRevisao(diff), signal);
  return { handled: true, reply: rel.texto.length > 0 ? rel.texto : "(sem achados)" };
}

async function handleLocalCommand(
  session: ChatSession,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ handled: true; reply: string } | { handled: false }> {
  const msg = prompt.trim();
  const lower = msg.toLowerCase();
  const partes = msg.split(/\s+/u);
  const cmd0 = (partes[0] ?? "").toLowerCase();

  // /plan em Q&A: qualquer mensagem enquanto pendente é tratada como resposta à pergunta atual.
  if (session.planoPendente !== undefined) {
    if (
      lower === "/plan clear" ||
      lower === "/plano limpar" ||
      lower === "/plan" ||
      lower === "/plano"
    ) {
      session.planoPendente = undefined;
      return { handled: true, reply: "· plano cancelado" };
    }
    return responderPerguntaPlano(session, msg, signal);
  }

  if (cmd0 === "/ajuda" || cmd0 === "/help") {
    return { handled: true, reply: textoAjudaComandos() };
  }
  if (cmd0 === "/pwd") {
    return {
      handled: true,
      reply: `· workspace: ${session.cwd}${ehMonorepoCodingPro(session.cwd) ? "\n· dica: monorepo CodingPro — use /abrir para o projeto real" : ""}`,
    };
  }
  if (cmd0 === "/limpar" || cmd0 === "/clear" || cmd0 === "/nova" || cmd0 === "/new") {
    session.transcript = [];
    session.sessionId = newSessionId();
    session.usage = new UsageLedger();
    return { handled: true, reply: "· histórico esquecido · sessão nova" };
  }
  if (cmd0 === "/custo" || cmd0 === "/cost" || cmd0 === "/gasto") {
    return { handled: true, reply: formatarCusto(session) };
  }
  if (cmd0 === "/compact" || cmd0 === "/compactar") {
    const antes = session.transcript.reduce((a, m) => a + estimateMessageTokens(m), 0);
    const base: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT_V1 },
      ...session.transcript,
    ];
    const alvo = Math.max(2_000, Math.floor(CONTEXT_BUDGET * 0.55));
    // C1: /compact preserva o contexto antigo como resumo estruturado em vez de truncar.
    const r = compactMessages(base, { maxTokens: alvo, resumirDescartados: true });
    session.transcript = r.messages[0]?.role === "system" ? r.messages.slice(1) : r.messages;
    const depois = session.transcript.reduce((a, m) => a + estimateMessageTokens(m), 0);
    return {
      handled: true,
      reply: `· compactado: ${antes.toLocaleString("pt-BR")} → ${depois.toLocaleString("pt-BR")} tok (−${r.dropped} msgs${r.resumo !== undefined ? ", com resumo do contexto antigo" : ""})`,
    };
  }
  if (cmd0 === "/desfazer" || cmd0 === "/undo") {
    const n = Number.parseInt(partes[1] ?? "1", 10);
    const q = Number.isFinite(n) && n > 0 ? n : 1;
    const r = await session.checkpoints.undo(q);
    if (r.passos === 0) return { handled: true, reply: "· nada a desfazer" };
    const nomes = r.checkpoints.map((c) => c.label).join(", ");
    return { handled: true, reply: `· desfeitos ${r.passos} passo(s): ${nomes}` };
  }
  if (cmd0 === "/refazer" || cmd0 === "/redo") {
    const n = Number.parseInt(partes[1] ?? "1", 10);
    const q = Number.isFinite(n) && n > 0 ? n : 1;
    const r = await session.checkpoints.redo(q);
    if (r.passos === 0) return { handled: true, reply: "· nada a refazer" };
    const nomes = r.checkpoints.map((c) => c.label).join(", ");
    return { handled: true, reply: `· refeitos ${r.passos} passo(s): ${nomes}` };
  }
  if (cmd0 === "/checkpoint" || cmd0 === "/checkpoints") {
    const lista = session.checkpoints.list();
    if (lista.length === 0) return { handled: true, reply: "· sem checkpoints ainda" };
    const linhas = lista
      .slice(-10)
      .map((c) => `  #${c.seq} ${c.label} (${c.files.length} arquivo(s))`)
      .join("\n");
    return { handled: true, reply: `checkpoints recentes:\n${linhas}` };
  }
  if (cmd0 === "/cancelar" || cmd0 === "/stop") {
    if (activeAbort) {
      activeAbort.abort();
      rejectPendingPermissions("deny");
      return { handled: true, reply: "· cancelamento solicitado" };
    }
    return { handled: true, reply: "· nada em execução" };
  }
  if (cmd0 === "/mapa" || cmd0 === "/map") {
    try {
      const mapa = await construirRepoMap(session.workspace, {
        cacheDir: join(session.cwd, ".codingpro"),
      });
      const extra = mapa.truncado
        ? `\n· mapa truncado (${mapa.totalArquivos} arquivos indexados)`
        : "";
      return { handled: true, reply: `${mapa.texto}${extra}` };
    } catch (e) {
      return {
        handled: true,
        reply: `· falha no mapa: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  if (cmd0 === "/index" || cmd0 === "/indexar") {
    if (!isNodeSqliteDisponivel()) {
      return {
        handled: true,
        reply:
          "· indexação vetorial indisponível neste Electron (Node 20 sem node:sqlite). Use a CLI CodingPro no Node ≥22.5 ou /mapa.",
      };
    }
    try {
      const result = await indexarRepositorio(session.workspace, {});
      return {
        handled: true,
        reply: `· índice: +${result.updated} · iguais ${result.unchanged} · removidos ${result.removed} · ${result.chunks} chunks · ${result.dbPath}`,
      };
    } catch (e) {
      return {
        handled: true,
        reply: `· falha ao indexar: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  if (cmd0 === "/init") {
    const force = (partes[1] ?? "").toLowerCase() === "force" || (partes[1] ?? "") === "--force";
    const alvo = session.workspace.resolve("CODINGPRO.md");
    if (existsSync(alvo) && !force) {
      return {
        handled: true,
        reply: "· CODINGPRO.md já existe. Use `/init force` para sobrescrever.",
      };
    }
    try {
      const info = await detectarProjeto(session.workspace);
      await writeFileWithin(session.workspace, alvo, gerarCodingproMd(info), WRITE_FILE_MAX_BYTES);
      return { handled: true, reply: `· CODINGPRO.md gerado (${resumoProjeto(info)})` };
    } catch (e) {
      return {
        handled: true,
        reply: `· falha no /init: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  if (cmd0 === "/lembrar" || cmd0 === "/remember") {
    const fato = msg.slice(cmd0.length).trim();
    if (fato.length === 0) return { handled: true, reply: "· uso: /lembrar <fato>" };
    try {
      const m = await session.memoryProjeto.remember(fato, "project");
      return {
        handled: true,
        reply: `· memorizado (projeto): ${m.name} — força ${m.strength}`,
      };
    } catch (e) {
      return {
        handled: true,
        reply: `· ${e instanceof Error ? e.message : "falha ao lembrar"}`,
      };
    }
  }
  if (cmd0 === "/memory") {
    const sub = (partes[1] ?? "list").toLowerCase();
    const alvo = partes[2];
    if (sub === "forget") {
      if (alvo === undefined) return { handled: true, reply: "· uso: /memory forget <slug>" };
      const ok =
        (await session.memoryProjeto.forget(alvo)) || (await session.memoryGlobal.forget(alvo));
      return { handled: true, reply: ok ? `· esquecido: ${alvo}` : `· não encontrei: ${alvo}` };
    }
    if (sub === "edit") {
      if (alvo === undefined) return { handled: true, reply: "· uso: /memory edit <slug>" };
      return {
        handled: true,
        reply: `· edite à mão: ${join(session.memoryProjeto.dir, `${alvo}.md`)} ou ${join(session.memoryGlobal.dir, `${alvo}.md`)}`,
      };
    }
    const [g, p] = await Promise.all([session.memoryGlobal.list(), session.memoryProjeto.list()]);
    if (g.length === 0 && p.length === 0) return { handled: true, reply: "· memória vazia" };
    const linhas = [
      ...p.map((m) => `· [projeto] ${m.name} (${m.type}, força ${m.strength}) — ${m.description}`),
      ...g.map((m) => `· [global] ${m.name} (${m.type}, força ${m.strength}) — ${m.description}`),
    ];
    return { handled: true, reply: linhas.join("\n") };
  }
  if (cmd0 === "/skills") {
    if (session.skills.length === 0) {
      return {
        handled: true,
        reply: "· nenhuma skill em .codingpro/skills (projeto ou global)",
      };
    }
    const linhas = session.skills.map(
      (s) => `  ${session.skillsAtivas.has(s.nome) ? "●" : "○"} ${s.nome} — ${s.descricao}`,
    );
    return { handled: true, reply: `skills:\n${linhas.join("\n")}` };
  }
  if (cmd0 === "/skill") {
    const nome = partes[1];
    if (nome === undefined) {
      return { handled: true, reply: "· uso: /skill <nome> — ou /skills para listar" };
    }
    if (!session.skills.some((s) => s.nome === nome)) {
      return { handled: true, reply: `· skill não encontrada: ${nome}` };
    }
    session.skillsAtivas.add(nome);
    return { handled: true, reply: `· skill ativada: ${nome}` };
  }
  if (cmd0 === "/plan" || cmd0 === "/plano") {
    return iniciarComandoPlano(session, msg, signal);
  }
  if (cmd0 === "/review") {
    return executarReviewDesktop(session, msg, signal);
  }
  if (cmd0 === "/doctor") {
    const sondas = await coletarSondas(session.cwd, homedir(), process.env);
    const { texto } = formatarRelatorioDoctor(montarDiagnosticos(sondas));
    return { handled: true, reply: texto.trim() };
  }
  if (cmd0 === "/subagentes" || cmd0 === "/agents") {
    const tipos = session.subagentes?.tiposDisponiveis ?? [];
    if (tipos.length === 0) {
      return { handled: true, reply: "· subagentes indisponíveis nesta sessão" };
    }
    const descs: Record<string, string> = {
      architect: "planeja tarefas grandes (Markdown)",
      debugger: "reproduz falha e isola causa",
      docs: "escreve README/JSDoc/changelog",
      explorer: "explora e busca (só leitura)",
      refactor: "refatora com rede de segurança",
      reviewer: "revisa código por severidade",
      security: "caça segredos/injeção/deps",
      tester: "escreve e roda testes",
      verifier: "verifica build/teste/lint",
      worker: "trabalho geral",
    };
    const linhas = tipos.map(
      (t) => `  ${t} — ${descs[t] ?? "tipo custom (.codingpro/agents)"}`,
    );
    return {
      handled: true,
      reply: `tipos de subagente (${tipos.length}):\n${linhas.join("\n")}\n\nUse a tool \`task\` (ou /goal) para orquestrar.`,
    };
  }
  if (cmd0 === "/executar" || cmd0 === "/execute") {
    // Com plano ativo: deixa o prompt chegar ao agente (o plano já está no system prompt).
    // Sem plano: responde local com instrução.
    return session.planoAtivo === undefined
      ? { handled: true, reply: "· não há plano ativo — crie com /plan <objetivo> primeiro" }
      : { handled: false };
  }
  if (cmd0 === "/sair" || cmd0 === "/exit") {
    return { handled: true, reply: "· no desktop feche a janela (Alt+F4) — não há /sair" };
  }
  if (cmd0 === "/tema" || cmd0 === "/theme") {
    return {
      handled: true,
      reply:
        "· temas: use o painel de Configurações (ícone na barra lateral) — aurora/solar/neon/mono, aplica na hora e fica salvo",
    };
  }
  if (cmd0 === "/pet") {
    return { handled: true, reply: "· pet/XP ainda não tem equivalente visual no Desktop" };
  }

  // /workspace sozinho = pwd
  if (lower === "/workspace") {
    return {
      handled: true,
      reply: `· workspace: ${session.cwd}`,
    };
  }

  return { handled: false };
}

/**
 * Troca de workspace antes da sessão — `/abrir` / `/workspace <path>`.
 * Retorna reply se tratou; undefined se não for comando de abrir.
 */
async function tentarAbrirWorkspace(
  prompt: string,
): Promise<{ reply: string; cwd: string } | undefined> {
  const msg = prompt.trim();
  const lower = msg.toLowerCase();

  // /workspace e /pwd sozinhos = mostrar path (handleLocalCommand)
  if (lower === "/workspace" || lower === "/pwd") return undefined;

  const isAbrir =
    lower === "/abrir" ||
    lower.startsWith("/abrir ") ||
    lower === "/open" ||
    lower.startsWith("/open ") ||
    lower.startsWith("/workspace ");
  if (!isAbrir) return undefined;

  const arg = msg
    .replace(/^\/(abrir|open|workspace)\s*/iu, "")
    .trim()
    .replace(/^["']|["']$/g, "");
  let target = arg;
  if (target.length === 0) {
    const chosen = await escolherPastaProjeto(pastaDownloads());
    if (!chosen) return { reply: "· abertura cancelada", cwd: selectedWorkspacePath };
    target = chosen;
  }
  const resolved = resolvePath(target);
  if (!existsSync(resolved)) {
    return {
      reply: `· pasta não encontrada: ${resolved}\n· tente /abrir sem argumentos para o diálogo, ou um caminho absoluto`,
      cwd: selectedWorkspacePath,
    };
  }
  const cwd = definirWorkspace(resolved);
  try {
    const ws = await Workspace.create(cwd);
    const info = await detectarProjeto(ws);
    return {
      cwd,
      reply: `· workspace aberto: ${cwd}\n· ${resumoProjeto(info)}\n· pode pedir: “liste a estrutura”, “explique o README”, etc. (escopo = esta pasta)`,
    };
  } catch {
    return {
      cwd,
      reply: `· workspace aberto: ${cwd}\n· (detecção de projeto falhou — ainda assim as tools usam esta raiz)`,
    };
  }
}

app.whenReady().then(() => {
  projectIndex = new ProjectIndexStore(projectIndexFile(), lastWorkspaceFile());
  // Último projeto do usuário > monorepo CodingPro (só se for dev do próprio app)
  const ultimo = carregarUltimoWorkspace();
  if (ultimo !== undefined) {
    selectedWorkspacePath = ultimo;
  } else {
    const guessRoot = resolvePath(join(__dirname, "..", "..", "..", ".."));
    if (existsSync(join(guessRoot, "pnpm-workspace.yaml"))) {
      selectedWorkspacePath = guessRoot;
    } else {
      selectedWorkspacePath = pastaDownloads();
    }
  }

  projectIndex.touchProject(selectedWorkspacePath);

  createWindow();
  configurarUpdater();

  ipcMain.handle("codingpro:get-workspace-info", async () => {
    let projectSummary: string | undefined;
    try {
      const ws = await Workspace.create(selectedWorkspacePath);
      projectSummary = resumoProjeto(await detectarProjeto(ws));
    } catch {
      projectSummary = undefined;
    }
    const branch = await branchDoWorkspace(selectedWorkspacePath);
    const projectName =
      selectedWorkspacePath.split(/[/\\]/u).filter(Boolean).at(-1) ?? selectedWorkspacePath;
    return {
      cwd: selectedWorkspacePath,
      platform: process.platform,
      running: runInFlight,
      acesso: obterEstadoAcesso(),
      hasApiKey: obterEstadoAcesso().modo !== "sem-acesso",
      isCodingProMonorepo: ehMonorepoCodingPro(selectedWorkspacePath),
      projectName,
      appVersion: app.getVersion(),
      skills: activeSession?.skills.length ?? 0,
      ...(branch !== undefined ? { branch } : {}),
      ...(projectSummary !== undefined ? { projectSummary } : {}),
    };
  });

  ipcMain.handle("codingpro:estado-acesso", async () => obterEstadoAcesso());

  /** Saldo de créditos observado no header do proxy Cloud (undefined até a 1ª chamada). */
  ipcMain.handle(
    "codingpro:saldo-conta",
    async (): Promise<SaldoContaUI> => ({
      saldoMicro: saldoContaMicro,
    }),
  );
  /**
   * Login pela própria janela do app: pede o código ao servidor, abre o navegador na
   * página de autorização e fica consultando até o usuário confirmar. Mesmo device flow
   * da CLI, e o token cai no mesmo `~/.codingpro/credenciais.json`.
   */
  ipcMain.handle("codingpro:conta-login", async (_, apiUrlBruta?: string) => {
    const apiUrl = (apiUrlBruta?.trim() || "https://codingpro-api.cursar.space").replace(
      /\/+$/,
      "",
    );
    const inicio = await fetch(`${apiUrl}/api/device/iniciar`, {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!inicio.ok) throw new Error("Não consegui iniciar o login. Tente de novo.");
    const dados = (await inicio.json()) as {
      codigoDispositivo: string;
      codigoUsuario: string;
      urlVerificacao: string;
      intervaloSegundos: number;
    };

    await shell.openExternal(dados.urlVerificacao).catch(() => {});
    return {
      codigoDispositivo: dados.codigoDispositivo,
      codigoUsuario: dados.codigoUsuario,
      intervaloSegundos: dados.intervaloSegundos,
      urlVerificacao: dados.urlVerificacao,
    };
  });

  ipcMain.handle(
    "codingpro:conta-consultar",
    async (_, apiUrlBruta: string, codigoDispositivo: string) => {
      const apiUrl = apiUrlBruta.replace(/\/+$/, "");
      const resposta = await fetch(`${apiUrl}/api/device/token`, {
        body: JSON.stringify({ codigoDispositivo }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (resposta.status === 410) return { estado: "expirado" as const };
      if (resposta.status === 202) return { estado: "pendente" as const };
      if (!resposta.ok) return { estado: "pendente" as const };

      const corpo = (await resposta.json()) as { token?: unknown };
      if (typeof corpo.token !== "string") return { estado: "pendente" as const };

      const dir = join(homedir(), ".codingpro");
      mkdirSync(dir, { mode: 0o700, recursive: true });
      writeFileSync(
        join(dir, "credenciais.json"),
        `${JSON.stringify({ apiUrl, criadoEm: new Date().toISOString(), token: corpo.token }, null, 2)}\n`,
        { mode: 0o600 },
      );
      return { estado: "pronto" as const };
    },
  );

  ipcMain.handle("codingpro:conta-logout", async () => {
    const caminho = join(homedir(), ".codingpro", "credenciais.json");
    if (!existsSync(caminho)) return false;
    rmSync(caminho, { force: true });
    saldoContaMicro = undefined;
    notificarSaldoConta();
    return true;
  });

  /** Login direto: email + senha → device flow interno → token salvo. Sem navegador. */
  ipcMain.handle("codingpro:conta-login-direto", async (_, email: string, senha: string) => {
    const API = "https://codingpro-api.cursar.space";
    // Passo 1: login
    const login = await fetch(`${API}/api/login`, {
      body: JSON.stringify({ email, senha }),
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "manual",
    });
    if (!login.ok) {
      const err = (await login.json().catch(() => ({}))) as { mensagem?: string };
      throw new Error(err.mensagem || "E-mail ou senha incorretos.");
    }
    const corpoLogin = (await login.json().catch(() => ({}))) as {
      usuario?: { status?: string };
    };
    const statusConta = corpoLogin.usuario?.status ?? "ativo";
    const cookies = login.headers.getSetCookie?.() ?? [];
    const sessao = cookies.find((c) => c.startsWith("cp_sessao="));
    if (!sessao) throw new Error("Sessão não estabelecida. Tente de novo.");
    const cookieHeader = sessao.split(";")[0] ?? "";

    // Passo 2: iniciar device flow
    const inicio = await fetch(`${API}/api/device/iniciar`, {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!inicio.ok) throw new Error("Não consegui iniciar o login do dispositivo.");
    const dev = (await inicio.json()) as {
      codigoDispositivo: string;
      codigoUsuario: string;
    };

    // Passo 3: aprovar o dispositivo (com o cookie de sessão)
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("cookie", cookieHeader);
    const aprovacao = await fetch(`${API}/api/device/aprovar`, {
      body: JSON.stringify({ codigoUsuario: dev.codigoUsuario }),
      headers,
      method: "POST",
    });
    if (!aprovacao.ok) {
      const err = (await aprovacao.json().catch(() => ({}))) as { mensagem?: string };
      throw new Error(err.mensagem || "Não consegui autorizar este dispositivo.");
    }

    // Passo 4: resgatar o token
    const tokenRes = await fetch(`${API}/api/device/token`, {
      body: JSON.stringify({ codigoDispositivo: dev.codigoDispositivo }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const corpo = (await tokenRes.json()) as { token?: string };
    if (typeof corpo.token !== "string") throw new Error("Token não encontrado.");

    // Salvar no mesmo arquivo da CLI
    const dir = join(homedir(), ".codingpro");
    mkdirSync(dir, { mode: 0o700, recursive: true });
    writeFileSync(
      join(dir, "credenciais.json"),
      `${JSON.stringify({ apiUrl: API, criadoEm: new Date().toISOString(), token: corpo.token }, null, 2)}\n`,
      { mode: 0o600 },
    );
    // Devolve o status da conta para o renderer avisar "aguardando aprovação"
    // dentro do app — o login nunca mais é barrado por conta pendente.
    return { status: statusConta };
  });

  /** Cadastro: cria conta pendente, sem créditos, e devolve a orientação ao usuário. */
  ipcMain.handle(
    "codingpro:conta-cadastrar",
    async (_, email: string, nome: string, senha: string) => {
      const API = "https://codingpro-api.cursar.space";
      const res = await fetch(`${API}/api/cadastro`, {
        body: JSON.stringify({ email, nome, senha, termosAceitos: true }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const corpo = (await res.json()) as { usuario?: { status: string }; mensagem?: string };
      if (!res.ok) throw new Error(corpo.mensagem || "Erro ao criar conta.");
      if (corpo.usuario?.status === "pendente") {
        return "Conta criada! Aguardando aprovação do administrador para liberar o uso e os créditos.";
      }
      return "Conta criada com sucesso!";
    },
  );

  ipcMain.handle("codingpro:choose-workspace-folder", async () => {
    if (runInFlight) return undefined;
    const chosen = await escolherPastaProjeto(
      ehMonorepoCodingPro(selectedWorkspacePath) ? pastaDownloads() : selectedWorkspacePath,
    );
    if (!chosen) return undefined;
    definirWorkspace(chosen);
    return chosen;
  });

  ipcMain.handle("codingpro:set-workspace", async (_, cwd: string) => {
    if (runInFlight) {
      return { success: false, error: "Pare a tarefa atual antes de trocar de projeto." };
    }
    if (typeof cwd !== "string" || cwd.trim() === "") {
      return { success: false, error: "Caminho inválido" };
    }
    if (!existsSync(cwd.trim())) {
      return { success: false, error: "Pasta não existe" };
    }
    const path = definirWorkspace(cwd.trim());
    return { success: true, cwd: path };
  });

  ipcMain.handle("codingpro:new-session", async () => {
    try {
      const session = await novaSessaoVazia();
      return { success: true, sessionId: session.sessionId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle("codingpro:get-session-cost", async () => {
    return snapshotCusto(activeSession);
  });

  ipcMain.handle("codingpro:update-state", async () => updateState);
  ipcMain.handle("codingpro:update-check", async () => verificarAtualizacao());
  ipcMain.handle("codingpro:update-download", async () => {
    if (updateState.mode === "portable") {
      await shell.openExternal(updateState.manualUrl ?? UPDATE_MANUAL_URL);
      return updateState;
    }
    if (updateState.mode !== "nsis" || updateState.status !== "available") {
      return updateState;
    }
    enviarEstadoUpdate({ error: undefined, progress: 0, status: "downloading" });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      enviarEstadoUpdate({ error: mensagemUpdateError(error), status: "error" });
    }
    return updateState;
  });
  ipcMain.handle("codingpro:update-install", async () => {
    if (updateState.mode !== "nsis" || updateState.status !== "downloaded") {
      return { success: false, error: "Nenhuma atualização pronta para instalar." };
    }
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { success: true };
  });

  ipcMain.handle("codingpro:list-slash-commands", async () => {
    return COMANDOS_CHAT.map((c) => ({
      nome: c.nome,
      aliases: [...c.aliases],
      descricao: c.descricao,
      aceitaArgs: c.aceitaArgs,
    }));
  });

  ipcMain.handle("codingpro:cancel-run", async () => {
    if (activeAbort && !activeAbort.signal.aborted) {
      appendDesktopDiagnostic(app.getPath("userData"), {
        event: "run-cancel-requested",
        ...(activeSession === null
          ? {}
          : {
              sessionId: activeSession.sessionId,
              workspace: activeSession.workspace.root,
            }),
      });
      activeAbort.abort();
    }
    rejectPendingPermissions("deny");
    // O `finally` da execução libera o gate. Liberar aqui permitiria um segundo run enquanto
    // provider, tools e subagentes do anterior ainda estão desfazendo o cancelamento.
    return { success: true };
  });

  ipcMain.on("codingpro:permission-response", (_, response: UiPermissionResponse) => {
    const resolver = pendingPermissions.get(response.requestId);
    if (!resolver) return;
    pendingPermissions.delete(response.requestId);
    const action = response.decision.action;
    const approval: Approval =
      action === "always" ? "approve-always" : action === "allow" ? "approve-once" : "deny";
    resolver(approval);
  });

  ipcMain.handle("codingpro:set-auto-approve", async (_, enabled: boolean) => {
    autoApprove = enabled;
    return { success: true, autoApprove };
  });

  ipcMain.handle("codingpro:get-auto-approve", async () => {
    return autoApprove;
  });

  ipcMain.handle("codingpro:set-modo-economico", async (_, enabled: boolean) => {
    modoEconomico = Boolean(enabled);
    return { success: true, modoEconomico };
  });

  ipcMain.handle("codingpro:get-modo-economico", async () => {
    return modoEconomico;
  });

  ipcMain.handle("codingpro:list-sessions", async () => {
    try {
      await sincronizarSessoesConhecidas();
      return (
        projectIndex?.groups(
          runInFlight && activeSession
            ? { sessionId: activeSession.sessionId, workspacePath: activeSession.cwd }
            : undefined,
        ) ?? []
      );
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "codingpro:load-session",
    async (_, target: { workspacePath: string; sessionId: string }) => {
      try {
        if (runInFlight) {
          return {
            success: false,
            error: "Pare a tarefa atual antes de trocar de projeto ou conversa.",
          };
        }
        if (
          typeof target?.workspacePath !== "string" ||
          typeof target?.sessionId !== "string" ||
          !existsSync(target.workspacePath)
        ) {
          return { success: false, error: "Projeto ou conversa indisponível." };
        }
        const workspacePath = resolvePath(target.workspacePath);
        const targetStore = await SessionStore.create(
          join(workspacePath, ".codingpro", "sessions"),
        );
        const messages = await targetStore.load(target.sessionId);
        const session = await obterOuCriarSessao(workspacePath);
        // remove system do transcript exibido/continuado
        const withoutSystem = messages[0]?.role === "system" ? messages.slice(1) : messages;
        session.transcript = [...withoutSystem];
        session.sessionId = target.sessionId;
        session.usage = new UsageLedger(
          projectIndex?.getSession(workspacePath, target.sessionId)?.usage,
        );
        definirWorkspace(workspacePath);
        sendCoreEvent({ type: "session-updated", messages: session.transcript });
        sendUsage(session);
        return { success: true, messages: session.transcript, cwd: workspacePath };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle(
    "codingpro:get-diff-preview",
    async (_, args: { targetFile: string; newContent: string }) => {
      try {
        const cwd = activeSession?.cwd ?? selectedWorkspacePath;
        const workspace = await Workspace.create(cwd);
        return await resolverPreviaDeEscrita(workspace, "write_file", {
          path: args.targetFile,
          content: args.newContent,
        });
      } catch {
        return undefined;
      }
    },
  );

  ipcMain.handle("codingpro:run-terminal-command", async (_, command: string) => {
    if (typeof command !== "string" || command.trim() === "") {
      return { exitCode: 1, stderr: "Comando vazio", stdout: "" };
    }
    // bloqueia sequências perigosas óbvias no terminal embutido
    if (/[\r\n]/.test(command)) {
      return { exitCode: 1, stderr: "Comando multilinha não permitido", stdout: "" };
    }
    const isWin = process.platform === "win32";
    const shellOption = isWin ? process.env.COMSPEC || "cmd.exe" : "/bin/sh";
    const cwd = activeSession?.cwd ?? selectedWorkspacePath;
    return execCommand(command, {
      cwd,
      shell: shellOption,
      env: {
        ...process.env,
        // não propaga a chave ao subprocesso do terminal do usuário? Mantemos PATH etc.
      },
      maxBuffer: 2 * 1024 * 1024,
    });
  });

  ipcMain.handle(
    "codingpro:send-message",
    async (_, args: { prompt: string; workspacePath?: string }) => {
      if (runInFlight) {
        return { success: false, error: "Já existe uma execução em andamento. Use /cancelar." };
      }

      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      if (prompt.length === 0) {
        return { success: false, error: "Mensagem vazia." };
      }

      runInFlight = true;
      // Garante que nenhum abort anterior contamine esta execução
      if (activeAbort) {
        try {
          activeAbort.abort();
        } catch {
          /* ok */
        }
      }
      const abort = new AbortController();
      activeAbort = abort;
      const runId = `run-${Date.now()}-${requestCounter++}`;
      _runStartMs = Date.now();
      _tokenCount = 0;
      _stepCount = 0;
      _thinkingMs = 0;

      try {
        // /abrir antes de criar sessão — troca a raiz como `cd` na CLI Linux
        const aberto = await tentarAbrirWorkspace(prompt);
        if (aberto !== undefined) {
          selectedWorkspacePath = aberto.cwd;
          const sessionOpen = await obterOuCriarSessao(aberto.cwd);
          sessionOpen.usage.beginUserTurn();
          sessionOpen.transcript.push(mensagemUsuario(prompt), mensagemAssistente(aberto.reply));
          try {
            await sessionOpen.sessionStore.save(sessionOpen.sessionId, sessionOpen.transcript);
            persistirIndiceSessao(sessionOpen);
          } catch {
            // best-effort
          }
          sendCoreEvent({ type: "session-updated", messages: sessionOpen.transcript });
          return {
            success: true,
            local: true,
            reply: aberto.reply,
            cwd: aberto.cwd,
            sessionId: sessionOpen.sessionId,
            cost: snapshotCusto(sessionOpen),
          };
        }

        const targetCwd2 =
          args.workspacePath && args.workspacePath.trim() !== ""
            ? args.workspacePath.trim()
            : selectedWorkspacePath;

        const session = await obterOuCriarSessao(targetCwd2);
        session.usage.beginUserTurn();
        sendUsage(session, true);

        // SANITIZA o transcript ANTES de cada execução, evitando invalid-request
        // causado por mensagens sujas de turnos anteriores no Windows
        try {
          session.transcript = sanitizeMessagesForProvider(session.transcript);
        } catch {
          // sanitização falhou — segue com o transcript original
        }

        // Comandos locais (não consomem LLM)
        const local = await handleLocalCommand(session, prompt, abort.signal);
        if (local.handled) {
          session.transcript.push(mensagemUsuario(prompt), mensagemAssistente(local.reply));
          try {
            await session.sessionStore.save(session.sessionId, session.transcript);
            persistirIndiceSessao(session);
          } catch {
            // persistência best-effort
          }
          sendCoreEvent({ type: "session-updated", messages: session.transcript });
          return {
            success: true,
            local: true,
            reply: local.reply,
            cwd: session.cwd,
            sessionId: session.sessionId,
            cost: snapshotCusto(session),
          };
        }

        const promptAgente = expandirPromptAgente(prompt) ?? prompt;
        session.transcript.push(mensagemUsuario(promptAgente));
        const usageRunId = runId;
        appendDesktopDiagnostic(app.getPath("userData"), {
          event: "run-started",
          runId,
          sessionId: session.sessionId,
          workspace: session.workspace.root,
        });
        session.checkpoints.begin(promptAgente.slice(0, 80));
        // D7: plano ativo → o passo pendente vira running (tracker anda junto com o run).
        marcarProximoPassoRunning(session);

        // Auto-compact: se contexto > 75% do orçamento, compacta
        const estContexto = snapshotCusto(session);
        if (estContexto && estContexto.contextTokens > CONTEXT_BUDGET * 0.75) {
          try {
            const before = estContexto.contextTokens;
            // C1: auto-compact preserva decisões/arquivos/pendências antigas como resumo
            // estruturado (determinístico, sem LLM) em vez de truncar e perder contexto.
            const compacted = compactMessages(session.transcript, {
              maxTokens: CONTEXT_BUDGET,
              resumirDescartados: true,
            });
            session.transcript = compacted.messages;
            const after = compacted.messages.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
            const saved = Math.max(0, before - after);
            if (compacted.dropped > 0 && saved > 0) {
              sendCoreEvent({
                event: {
                  key: "compaction",
                  text: `Histórico resumido: −${saved} tok${compacted.resumo !== undefined ? " (contexto antigo preservado como resumo)" : ""}`,
                  type: "notice",
                },
                type: "agent-event",
              });
            }
          } catch {
            // compactação falhou — segue sem
          }
        }

        const systemPrompt = await montarSystemPromptDesktop(session);

        // Auto-effort: estima contexto, decide Flash/Pro (paridade com o chat da CLI).
        const entradaEstimativa = [
          { content: systemPrompt, role: "system" as const },
          ...session.transcript,
        ];
        const tokensContexto = Math.round(JSON.stringify(entradaEstimativa).length / 2);
        prepararAutoEffort(
          session.autoEffort,
          tokensContexto,
          Array.from(session.registry.definitions(), (t) => t.name),
        );
        // Modo econômico (D5): força esforço fast/high e corta web_search.
        const papel = modoEconomico ? "fast" : resolverAutoEffort(session.autoEffort);
        const modeloNome = "DeepSeek V4 Flash";
        // `papel` vem do auto-effort: "auto" → raciocínio max, "fast" → high. Modelo é sempre Flash.
        let providerTurno: Provider = session.provider;
        if (session.provider.id === "deepseek" && papel === "fast") {
          // `criarProvider` já escolhe entre chave própria e conta cloud;
          // se nenhuma existir, mantém o provider do turno em vez de estourar.
          try {
            providerTurno = criarProvider("fast");
          } catch {
            providerTurno = session.provider;
          }
        }
        sendCoreEvent({ type: "model-info", modelName: modeloNome, effort: papel });

        const arquivosEfeito: string[] = [];
        let approximateOutputTokens = 0;
        let lastApproximateEmitMs = 0;
        const onAgentEvent = (agentEvent: AgentEvent): void => {
          if (agentEvent.type === "step" && agentEvent.usage) {
            _tokenCount =
              (agentEvent.usage.inputTokens || 0) + (agentEvent.usage.outputTokens || 0);
            _stepCount = agentEvent.step;
            const stepCost = estimateCost(agentEvent.usage, DEEPSEEK_MODEL_FLASH);
            session.usage.record(
              "main",
              `${usageRunId}:main:${agentEvent.step}`,
              agentEvent.usage,
              stepCost.totalCostUsd,
            );
            approximateOutputTokens = 0;
            sendUsage(session);
          }
          if (agentEvent.type === "reasoning-delta") {
            _thinkingMs += Math.round(agentEvent.text.length * 3);
          }
          if (agentEvent.type === "text-delta" || agentEvent.type === "reasoning-delta") {
            approximateOutputTokens += Math.max(1, Math.ceil(agentEvent.text.length / 4));
            const now = Date.now();
            if (now - lastApproximateEmitMs >= 250) {
              lastApproximateEmitMs = now;
              sendUsage(session, true, approximateOutputTokens);
            }
          }
          if (agentEvent.type === "tool-call") {
            const path = (agentEvent.call.input as { path?: string }).path;
            if (
              path !== undefined &&
              (agentEvent.call.name === "write_file" || agentEvent.call.name === "edit_file")
            ) {
              arquivosEfeito.push(path);
            }
          }
          if (
            agentEvent.type === "notice" &&
            agentEvent.key === "tool-call-recovery" &&
            agentEvent.attempt !== undefined
          ) {
            session.usage.record(
              "repair",
              `${usageRunId}:tool-call-recovery:${agentEvent.attempt}`,
              { inputTokens: 0, outputTokens: 0 },
              0,
            );
            sendUsage(session, true);
          }
          if (agentEvent.type === "notice" && agentEvent.key === "provider-retry") {
            appendDesktopDiagnostic(app.getPath("userData"), {
              event: "run-retry",
              message: agentEvent.text,
              runId,
              sessionId: session.sessionId,
              workspace: session.workspace.root,
            });
          }
          sendCoreEvent({ type: "agent-event", event: agentEvent });
        };

        const toolsTurno = modoEconomico
          ? session.registry.definitions().filter((tool) => tool.name !== "web_search")
          : session.registry.definitions();

        const agentResult = await runAgentComFallback(session, {
          context: {
            workspace: session.workspace,
            readTracker: session.readTracker,
            checkpoints: session.checkpoints,
            memory: { global: session.memoryGlobal, projeto: session.memoryProjeto },
            subagentes: session.subagentes!,
            signal: abort.signal,
          },
          gate: session.gate,
          messages: session.transcript,
          provider: providerTurno,
          signal: abort.signal,
          tools: toolsTurno,
          systemPrompt,
          contextBudget: CONTEXT_BUDGET,
          onEvent: onAgentEvent,
        });

        let msgs = agentResult.messages;
        session.transcript = msgs[0]?.role === "system" ? msgs.slice(1) : [...msgs];
        _stepCount = agentResult.steps;

        // Auto-effort: erro de tool no turno escala o próximo pra Pro.
        const houveErroDeTool = msgs.some(
          (m) => m.role === "tool" && m.result.type === "error-text",
        );
        atualizarAutoEffort(session.autoEffort, houveErroDeTool);

        // Qualidade: biome --write (auto-fix) + check; residual gera re-turno da IA.
        const qaEnv = lerOpcoesQualidadeEnv();
        let arquivosQa = [...arquivosEfeito];
        let resultadoQa = await corrigirQualidade(
          session.workspace.root,
          arquivosQa,
          {
            progresso: (t: string) =>
              sendCoreEvent({ type: "agent-event", event: { type: "notice", text: t.trim() } }),
          },
          { autoFix: qaEnv.autoFix },
        );

        let reparos = 0;
        while (
          !resultadoQa.limpo &&
          !resultadoQa.ignorado &&
          resultadoQa.diagnostico.length > 0 &&
          reparos < qaEnv.maxRepairTurns
        ) {
          reparos += 1;
          const promptReparo = promptReparoQualidade(resultadoQa.diagnostico, resultadoQa.arquivos);
          const systemReparo = await montarSystemPromptDesktop(session);
          const entradaReparo: ChatMessage[] = [
            { content: systemReparo, role: "system" },
            ...(msgs[0]?.role === "system" ? msgs.slice(1) : msgs),
            { content: promptReparo, role: "user" },
          ];
          const arquivosReparo: string[] = [];
          const repairResult = await runAgentComFallback(session, {
            context: {
              workspace: session.workspace,
              readTracker: session.readTracker,
              checkpoints: session.checkpoints,
              memory: { global: session.memoryGlobal, projeto: session.memoryProjeto },
              subagentes: session.subagentes!,
              signal: abort.signal,
            },
            gate: session.gate,
            messages: entradaReparo,
            provider: providerTurno,
            signal: abort.signal,
            tools: session.registry.definitions(),
            contextBudget: CONTEXT_BUDGET,
            onEvent: (agentEvent: AgentEvent) => {
              if (agentEvent.type === "step" && agentEvent.usage) {
                const source: UsageSource = "repair";
                const cost = estimateCost(agentEvent.usage, DEEPSEEK_MODEL_FLASH);
                session.usage.record(
                  source,
                  `${usageRunId}:repair:${reparos}:${agentEvent.step}`,
                  agentEvent.usage,
                  cost.totalCostUsd,
                );
                sendUsage(session);
              }
              if (agentEvent.type === "tool-call") {
                const path = (agentEvent.call.input as { path?: string }).path;
                if (
                  path !== undefined &&
                  (agentEvent.call.name === "write_file" || agentEvent.call.name === "edit_file")
                ) {
                  arquivosReparo.push(path);
                }
              }
              sendCoreEvent({ type: "agent-event", event: agentEvent });
            },
          });
          msgs = repairResult.messages;
          session.transcript = msgs[0]?.role === "system" ? msgs.slice(1) : [...msgs];
          arquivosQa = [...arquivosQa, ...arquivosReparo];
          resultadoQa = await corrigirQualidade(
            session.workspace.root,
            arquivosQa,
            {
              progresso: (t: string) =>
                sendCoreEvent({ type: "agent-event", event: { type: "notice", text: t.trim() } }),
            },
            { autoFix: qaEnv.autoFix },
          );
        }

        const checkpoint = await session.checkpoints.commit();
        if (checkpoint !== undefined) {
          sendCoreEvent({
            type: "agent-event",
            event: {
              type: "text-delta",
              text: `\n\n_checkpoint #${checkpoint.seq} salvo — /desfazer reverte_`,
            },
          });
        }

        try {
          await session.sessionStore.save(session.sessionId, session.transcript);
          persistirIndiceSessao(session);
        } catch {
          // best-effort
        }

        sendCoreEvent({
          type: "session-updated",
          messages: session.transcript,
        });
        sendUsage(session);
        // D7: run concluído com sucesso → passo running vira done.
        marcarPassoRunningConcluido(session);
        appendDesktopDiagnostic(app.getPath("userData"), {
          durationMs: Date.now() - _runStartMs,
          event: "run-completed",
          runId,
          sessionId: session.sessionId,
          workspace: session.workspace.root,
        });

        return {
          success: true,
          sessionId: session.sessionId,
          cost: snapshotCusto(session),
        };
      } catch (err: unknown) {
        console.error(
          "[codingpro] agent error:",
          err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        );
        const isAbort =
          (err instanceof Error && err.name === "AbortError") ||
          (typeof DOMException !== "undefined" &&
            err instanceof DOMException &&
            err.name === "AbortError");
        const msg = isAbort
          ? "Execução cancelada."
          : err !== null &&
              typeof err === "object" &&
              "safeMessage" in err &&
              typeof (err as { safeMessage: unknown }).safeMessage === "string"
            ? (err as { safeMessage: string }).safeMessage
            : err instanceof Error
              ? err.message
              : String(err);
        appendDesktopDiagnostic(app.getPath("userData"), {
          code: isAbort ? "CANCELLED" : "AGENT_ERROR",
          durationMs: Date.now() - _runStartMs,
          event: "run-failed",
          message: msg,
          runId,
          ...(activeSession === null
            ? {}
            : {
                sessionId: activeSession.sessionId,
                workspace: activeSession.workspace.root,
              }),
        });
        // D7: run falhou/cancelou → passo running volta a pending (nova tentativa no próximo run).
        if (activeSession !== null) {
          marcarPassoRunningFalho(activeSession);
        }

        // reverte checkpoint (rollback no erro)
        try {
          await activeSession?.checkpoints.commit();
        } catch {
          // ignore
        }

        // limpa transcript sujo para o próximo turno não herdar invalid-request
        if (activeSession !== null) {
          activeSession.transcript = sanitizeMessagesForProvider(activeSession.transcript);
          persistirIndiceSessao(activeSession);
          sendUsage(activeSession);
        }

        rejectPendingPermissions("deny");
        sendCoreEvent({
          type: "error",
          code: isAbort ? "CANCELLED" : "AGENT_ERROR",
          message: msg,
        });
        return { success: false, error: msg };
      } finally {
        runInFlight = false;
        if (activeAbort === abort) {
          activeAbort = null;
        }
      }
    },
  );
});

app.on("window-all-closed", () => {
  rejectPendingPermissions("deny");
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
