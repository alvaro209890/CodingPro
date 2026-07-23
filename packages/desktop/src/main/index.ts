import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ALL_TOOLS,
  type AgentEvent,
  type Approval,
  type Approver,
  type CoreUiEvent,
  PermissionController,
  type PermissionRequest,
  resolverPreviaDeEscrita,
  runAgent,
  SessionStore,
  ToolGate,
  type ToolContext,
  ToolRegistry,
  type UiPermissionResponse,
  Workspace,
} from "@codingpro/core";
import { DeepSeekProvider, type ChatMessage, type Provider } from "@codingpro/llm";

let mainWindow: BrowserWindow | null = null;
let requestCounter = 0;
const pendingPermissions = new Map<string, (approval: Approval) => void>();

function sendCoreEvent(event: CoreUiEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("codingpro:core-event", event);
  }
}

const approver: Approver = {
  async request(request: PermissionRequest, _context: ToolContext): Promise<Approval> {
    const requestId = `perm-${++requestCounter}`;
    return new Promise<Approval>((resolve) => {
      pendingPermissions.set(requestId, resolve);
      sendCoreEvent({ type: "permission-request", request, requestId });
    });
  },
};

interface ChatSession {
  readonly cwd: string;
  readonly gate: ToolGate;
  readonly provider: Provider;
  readonly registry: ToolRegistry;
  transcript: ChatMessage[];
  readonly workspace: Workspace;
  readonly sessionStore: SessionStore;
}

let activeSession: ChatSession | null = null;

function obterApiKey(): string | undefined {
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim().length > 0) {
    return process.env.DEEPSEEK_API_KEY.trim();
  }

  const envPaths = [
    join(homedir(), ".hermes", ".env"),
    join(homedir(), ".codingpro", ".env"),
    join(process.cwd(), ".env"),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, "utf8");
        const match = content.match(/^DEEPSEEK_API_KEY=(.+)$/m);
        if (match && match[1]) {
          return match[1].trim().replace(/^["']|["']$/g, "");
        }
      } catch {
        // Ignora erro
      }
    }
  }

  return undefined;
}

function criarProvider(): Provider {
  const apiKey = obterApiKey();
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error(
      "Variável de ambiente DEEPSEEK_API_KEY não encontrada em ~/.hermes/.env ou ambiente.",
    );
  }
  return new DeepSeekProvider({ apiKey });
}

async function obterOuCriarSessao(cwd: string): Promise<ChatSession> {
  if (activeSession !== null && activeSession.cwd === cwd) {
    return activeSession;
  }

  const workspace = await Workspace.create(cwd);
  const registry = new ToolRegistry();
  for (const tool of ALL_TOOLS) {
    registry.register(tool);
  }

  const permissionController = new PermissionController({ mode: "ask" }, approver);
  const gate = new ToolGate(registry, permissionController);
  const provider = criarProvider();
  const sessionStore = await SessionStore.create(join(cwd, ".codingpro", "sessions"));

  activeSession = {
    cwd,
    gate,
    provider,
    registry,
    sessionStore,
    transcript: [],
    workspace,
  };
  return activeSession;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    title: "CodingPro Desktop",
    backgroundColor: "#0b0e14",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle("codingpro:get-workspace-info", async () => {
    return {
      cwd: process.cwd(),
      platform: process.platform,
    };
  });

  ipcMain.handle("codingpro:choose-workspace-folder", async () => {
    if (mainWindow === null) return undefined;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Selecionar Pasta do Projeto",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return undefined;
    }
    const chosen = result.filePaths[0];
    activeSession = null;
    return chosen;
  });

  ipcMain.on("codingpro:permission-response", (_, response: UiPermissionResponse) => {
    const resolver = pendingPermissions.get(response.requestId);
    if (resolver) {
      pendingPermissions.delete(response.requestId);
      const action = response.decision.action;
      const approval: Approval =
        action === "always"
          ? "approve-always"
          : action === "allow"
            ? "approve-once"
            : "deny";
      resolver(approval);
    }
  });

  ipcMain.handle("codingpro:list-sessions", async () => {
    try {
      const cwd = activeSession?.cwd ?? process.cwd();
      const store = await SessionStore.create(join(cwd, ".codingpro", "sessions"));
      const ids = await store.list();
      return ids.map((id: string) => ({
        id,
        preview: `Sessão ${id.slice(0, 8)}`,
        updatedAt: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  });

  ipcMain.handle("codingpro:load-session", async (_, sessionId: string) => {
    try {
      const cwd = activeSession?.cwd ?? process.cwd();
      const store = await SessionStore.create(join(cwd, ".codingpro", "sessions"));
      const messages = await store.load(sessionId);
      return { success: true, messages };
    } catch (err: unknown) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("codingpro:get-diff-preview", async (_, args: { targetFile: string; newContent: string }) => {
    try {
      const cwd = activeSession?.cwd ?? process.cwd();
      const workspace = await Workspace.create(cwd);
      return await resolverPreviaDeEscrita(
        workspace,
        "write_file",
        { path: args.targetFile, content: args.newContent },
      );
    } catch {
      return undefined;
    }
  });

  ipcMain.handle("codingpro:run-terminal-command", async (_, command: string) => {
    return new Promise((resolve) => {
      const isWin = process.platform === "win32";
      const shellOption = isWin ? process.env.COMSPEC || "cmd.exe" : "/bin/sh";
      const cwd = activeSession?.cwd ?? process.cwd();

      exec(command, { cwd, shell: shellOption }, (error, stdout, stderr) => {
        resolve({
          exitCode: error ? error.code ?? 1 : 0,
          stderr: stderr || (error ? error.message : ""),
          stdout: stdout || "",
        });
      });
    });
  });

  ipcMain.handle(
    "codingpro:send-message",
    async (_, args: { prompt: string; workspacePath?: string }) => {
      try {
        const targetCwd =
          args.workspacePath && args.workspacePath.trim() !== ""
            ? args.workspacePath
            : process.cwd();

        const session = await obterOuCriarSessao(targetCwd);
        const userMessage: ChatMessage = {
          role: "user",
          content: args.prompt,
        };

        session.transcript.push(userMessage);

        const agentResult = await runAgent({
          context: { workspace: session.workspace },
          gate: session.gate,
          messages: session.transcript,
          provider: session.provider,
          tools: session.registry.definitions(),
          onEvent: (agentEvent: AgentEvent) => {
            sendCoreEvent({
              type: "agent-event",
              event: agentEvent,
            });
          },
        });

        session.transcript = [...agentResult.messages];

        sendCoreEvent({
          type: "session-updated",
          messages: session.transcript,
        });

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendCoreEvent({
          type: "error",
          code: "AGENT_ERROR",
          message: msg,
        });
        return { success: false, error: msg };
      }
    },
  );
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
