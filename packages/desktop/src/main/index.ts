import { type ExecOptions, exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AgentEvent,
  ALL_TOOLS,
  type Approval,
  type Approver,
  CheckpointStore,
  type CoreUiEvent,
  createReadTracker,
  isNodeSqliteDisponivel,
  MEMORY_TOOL_NAMES,
  MemoryStore,
  newSessionId,
  PermissionController,
  type PermissionRequest,
  type PreviaEscrita,
  type ReadTracker,
  resolverPreviaDeEscrita,
  runAgent,
  SessionStore,
  SYSTEM_PROMPT_V1,
  type ToolContext,
  ToolGate,
  ToolRegistry,
  type UiPermissionResponse,
  Workspace,
} from "@codingpro/core";
import {
  type ChatMessage,
  type CostBreakdown,
  DeepSeekProvider,
  type Provider,
} from "@codingpro/llm";
import { app, BrowserWindow, dialog, ipcMain } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TERMINAL_TIMEOUT_MS = 60_000;
const AJUDA_DESKTOP = [
  "Comandos do CodingPro Desktop:",
  "  /ajuda       — esta lista",
  "  /limpar      — limpa o histórico da conversa atual",
  "  /custo       — custo acumulado da sessão",
  "  /desfazer    — desfaz o último checkpoint de escrita",
  "  /refazer     — refaz um checkpoint desfeito",
  "  /checkpoint  — lista checkpoints",
  "  /cancelar    — cancela a execução em andamento",
  "  Ctrl+K       — paleta de comandos",
].join("\n");

let mainWindow: BrowserWindow | null = null;
let requestCounter = 0;
const pendingPermissions = new Map<string, (approval: Approval) => void>();

/** Pasta de trabalho escolhida na UI (independe do process.cwd do Electron). */
let selectedWorkspacePath: string = process.cwd();
let runInFlight = false;
let activeAbort: AbortController | null = null;

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

interface SessionCost {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  turns: number;
}

interface ChatSession {
  readonly cwd: string;
  readonly gate: ToolGate;
  readonly provider: Provider;
  readonly registry: ToolRegistry;
  readonly workspace: Workspace;
  readonly sessionStore: SessionStore;
  readonly checkpoints: CheckpointStore;
  readonly readTracker: ReadTracker;
  readonly memoryGlobal: MemoryStore;
  readonly memoryProjeto: MemoryStore;
  sessionId: string;
  transcript: ChatMessage[];
  cost: SessionCost;
}

let activeSession: ChatSession | null = null;

function obterApiKey(): string | undefined {
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

function criarProvider(): Provider {
  const apiKey = obterApiKey();
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error(
      "DEEPSEEK_API_KEY não encontrada. Coloque em .codingpro/.env, variável de ambiente, ou ~/.config/codingpro/deepseek.env",
    );
  }
  return new DeepSeekProvider({ apiKey });
}

function mensagemAssistente(content: string): ChatMessage {
  return { role: "assistant", content };
}

function mensagemUsuario(content: string): ChatMessage {
  return { role: "user", content };
}

function formatarCusto(cost: SessionCost): string {
  if (cost.turns === 0) {
    return "· sem custo ainda nesta sessão";
  }
  return `sessão: US$ ${cost.totalCostUsd.toFixed(6)} · in ${cost.inputTokens} · out ${cost.outputTokens} · turnos ${cost.turns}`;
}

function acumularCusto(session: ChatSession, cost: CostBreakdown | undefined): void {
  if (cost === undefined) return;
  session.cost.turns += 1;
  session.cost.inputTokens += cost.inputTokens;
  session.cost.outputTokens += cost.outputTokens;
  session.cost.totalCostUsd += cost.totalCostUsd;
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

  const workspace = await Workspace.create(normalized);
  const registry = new ToolRegistry();
  const sqliteOk = isNodeSqliteDisponivel();
  for (const tool of ALL_TOOLS) {
    // Electron 34 (Node 20) não tem node:sqlite — omite code_search nesse runtime.
    if (!sqliteOk && tool.definition.name === "code_search") {
      continue;
    }
    registry.register(tool);
  }

  const permissionController = new PermissionController(
    { alwaysAllow: MEMORY_TOOL_NAMES, mode: "ask" },
    approver,
  );
  const gate = new ToolGate(registry, permissionController);
  const provider = criarProvider();
  const sessionStore = await SessionStore.create(join(normalized, ".codingpro", "sessions"));
  const checkpoints = await CheckpointStore.create(
    join(normalized, ".codingpro", "checkpoints"),
    workspace,
  );
  const readTracker = createReadTracker();
  const memoryGlobal = MemoryStore.create(join(homedir(), ".codingpro", "memory"));
  const memoryProjeto = MemoryStore.create(join(normalized, ".codingpro", "memory"));

  activeSession = {
    cwd: normalized,
    gate,
    provider,
    registry,
    sessionStore,
    checkpoints,
    readTracker,
    memoryGlobal,
    memoryProjeto,
    sessionId: newSessionId(),
    transcript: [],
    workspace,
    cost: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0, turns: 0 },
  };
  selectedWorkspacePath = normalized;
  return activeSession;
}

async function novaSessaoVazia(): Promise<ChatSession> {
  const session = await obterOuCriarSessao(selectedWorkspacePath);
  session.transcript = [];
  session.sessionId = newSessionId();
  session.cost = { inputTokens: 0, outputTokens: 0, totalCostUsd: 0, turns: 0 };
  session.readTracker; // mantém tracker (leituras ainda valem para edit)
  sendCoreEvent({ type: "session-updated", messages: [] });
  return session;
}

function createWindow(): void {
  const preloadPath = join(__dirname, "../preload/index.cjs");
  if (!existsSync(preloadPath)) {
    console.error("[codingpro] preload ausente:", preloadPath);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    title: "CodingPro Desktop",
    backgroundColor: "#0b0e14",
    show: false,
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
    mainWindow?.show();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    void mainWindow?.webContents
      .executeJavaScript("typeof window.codingproAPI")
      .then((t) => {
        console.log(`[codingpro] preload API: ${String(t)}`);
        if (t !== "object") {
          console.error(
            "[codingpro] window.codingproAPI ausente — preload não carregou (use dist/preload/index.cjs).",
          );
        }
      })
      .catch((err: unknown) => {
        console.error("[codingpro] falha ao inspecionar preload:", err);
      });
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error(`[codingpro] falha ao carregar UI: ${code} ${desc}`);
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

async function handleLocalCommand(
  session: ChatSession,
  prompt: string,
): Promise<{ handled: true; reply: string } | { handled: false }> {
  const msg = prompt.trim();
  const lower = msg.toLowerCase();

  if (lower === "/ajuda" || lower === "/help") {
    return { handled: true, reply: AJUDA_DESKTOP };
  }
  if (lower === "/limpar" || lower === "/clear") {
    session.transcript = [];
    session.sessionId = newSessionId();
    return { handled: true, reply: "· histórico esquecido" };
  }
  if (lower === "/custo" || lower === "/cost") {
    return { handled: true, reply: formatarCusto(session.cost) };
  }
  if (
    lower === "/desfazer" ||
    lower === "/undo" ||
    lower.startsWith("/desfazer ") ||
    lower.startsWith("/undo ")
  ) {
    const n = Number.parseInt(msg.split(/\s+/u)[1] ?? "1", 10);
    const q = Number.isFinite(n) && n > 0 ? n : 1;
    const r = await session.checkpoints.undo(q);
    if (r.passos === 0) {
      return { handled: true, reply: "· nada a desfazer" };
    }
    const nomes = r.checkpoints.map((c) => c.label).join(", ");
    return { handled: true, reply: `· desfeitos ${r.passos} passo(s): ${nomes}` };
  }
  if (
    lower === "/refazer" ||
    lower === "/redo" ||
    lower.startsWith("/refazer ") ||
    lower.startsWith("/redo ")
  ) {
    const n = Number.parseInt(msg.split(/\s+/u)[1] ?? "1", 10);
    const q = Number.isFinite(n) && n > 0 ? n : 1;
    const r = await session.checkpoints.redo(q);
    if (r.passos === 0) {
      return { handled: true, reply: "· nada a refazer" };
    }
    const nomes = r.checkpoints.map((c) => c.label).join(", ");
    return { handled: true, reply: `· refeitos ${r.passos} passo(s): ${nomes}` };
  }
  if (lower === "/checkpoint" || lower === "/checkpoints") {
    const lista = session.checkpoints.list();
    if (lista.length === 0) {
      return { handled: true, reply: "· sem checkpoints ainda" };
    }
    const linhas = lista
      .slice(-10)
      .map((c) => `  #${c.seq} ${c.label} (${c.files.length} arquivo(s))`)
      .join("\n");
    return { handled: true, reply: `checkpoints recentes:\n${linhas}` };
  }
  if (lower === "/cancelar" || lower === "/stop") {
    if (activeAbort) {
      activeAbort.abort();
      rejectPendingPermissions("deny");
      return { handled: true, reply: "· cancelamento solicitado" };
    }
    return { handled: true, reply: "· nada em execução" };
  }
  return { handled: false };
}

app.whenReady().then(() => {
  // Preferir pasta do monorepo quando o app sobe de packages/desktop
  const guessRoot = resolvePath(join(__dirname, "..", "..", "..", ".."));
  if (existsSync(join(guessRoot, "pnpm-workspace.yaml"))) {
    selectedWorkspacePath = guessRoot;
  }

  createWindow();

  ipcMain.handle("codingpro:get-workspace-info", async () => {
    return {
      cwd: selectedWorkspacePath,
      platform: process.platform,
      running: runInFlight,
      hasApiKey: obterApiKey() !== undefined,
    };
  });

  ipcMain.handle("codingpro:choose-workspace-folder", async () => {
    if (mainWindow === null) return undefined;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Selecionar Pasta do Projeto",
      defaultPath: selectedWorkspacePath,
    });
    if (result.canceled || result.filePaths.length === 0) {
      return undefined;
    }
    const chosen = result.filePaths[0];
    if (!chosen) return undefined;
    selectedWorkspacePath = chosen;
    activeSession = null;
    return chosen;
  });

  ipcMain.handle("codingpro:set-workspace", async (_, cwd: string) => {
    if (typeof cwd !== "string" || cwd.trim() === "") {
      return { success: false, error: "Caminho inválido" };
    }
    selectedWorkspacePath = resolvePath(cwd.trim());
    activeSession = null;
    return { success: true, cwd: selectedWorkspacePath };
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

  ipcMain.handle("codingpro:cancel-run", async () => {
    if (activeAbort) {
      activeAbort.abort();
    }
    rejectPendingPermissions("deny");
    runInFlight = false;
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

  ipcMain.handle("codingpro:list-sessions", async () => {
    try {
      const cwd = activeSession?.cwd ?? selectedWorkspacePath;
      const store = await SessionStore.create(join(cwd, ".codingpro", "sessions"));
      const ids = await store.list();
      // mais recentes primeiro
      const ordered = [...ids].reverse();
      return ordered.map((id: string) => ({
        id,
        preview: `Sessão ${id.slice(0, 19)}`,
        updatedAt: id.slice(0, 19).replace("T", " "),
      }));
    } catch {
      return [];
    }
  });

  ipcMain.handle("codingpro:load-session", async (_, sessionId: string) => {
    try {
      const session = await obterOuCriarSessao(selectedWorkspacePath);
      const messages = await session.sessionStore.load(sessionId);
      // remove system do transcript exibido/continuado
      const withoutSystem = messages[0]?.role === "system" ? messages.slice(1) : messages;
      session.transcript = [...withoutSystem];
      session.sessionId = sessionId;
      sendCoreEvent({ type: "session-updated", messages: session.transcript });
      return { success: true, messages: session.transcript };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

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
      const abort = new AbortController();
      activeAbort = abort;

      try {
        const targetCwd =
          args.workspacePath && args.workspacePath.trim() !== ""
            ? args.workspacePath.trim()
            : selectedWorkspacePath;

        const session = await obterOuCriarSessao(targetCwd);

        // Comandos locais (não consomem LLM)
        const local = await handleLocalCommand(session, prompt);
        if (local.handled) {
          session.transcript.push(mensagemUsuario(prompt), mensagemAssistente(local.reply));
          try {
            await session.sessionStore.save(session.sessionId, session.transcript);
          } catch {
            // persistência best-effort
          }
          sendCoreEvent({ type: "session-updated", messages: session.transcript });
          return { success: true, local: true, reply: local.reply };
        }

        session.transcript.push(mensagemUsuario(prompt));
        session.checkpoints.begin(prompt.slice(0, 80));

        const agentResult = await runAgent({
          context: {
            workspace: session.workspace,
            readTracker: session.readTracker,
            checkpoints: session.checkpoints,
            memory: { global: session.memoryGlobal, projeto: session.memoryProjeto },
            signal: abort.signal,
          },
          gate: session.gate,
          messages: session.transcript,
          provider: session.provider,
          tools: session.registry.definitions(),
          systemPrompt: SYSTEM_PROMPT_V1,
          signal: abort.signal,
          onEvent: (agentEvent: AgentEvent) => {
            sendCoreEvent({
              type: "agent-event",
              event: agentEvent,
            });
          },
        });

        const msgs = agentResult.messages;
        session.transcript = msgs[0]?.role === "system" ? msgs.slice(1) : [...msgs];
        acumularCusto(session, agentResult.cost);

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
        } catch {
          // best-effort
        }

        sendCoreEvent({
          type: "session-updated",
          messages: session.transcript,
        });

        return {
          success: true,
          sessionId: session.sessionId,
          cost: session.cost,
        };
      } catch (err: unknown) {
        const isAbort =
          (err instanceof Error && err.name === "AbortError") ||
          (typeof DOMException !== "undefined" &&
            err instanceof DOMException &&
            err.name === "AbortError");
        const msg = isAbort
          ? "Execução cancelada."
          : err instanceof Error
            ? err.message
            : String(err);

        // reverte begin de checkpoint se o turno falhou no meio
        try {
          await activeSession?.checkpoints.commit();
        } catch {
          // ignore
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
