import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import {
  ALL_TOOLS,
  type AgentEvent,
  type Approval,
  type Approver,
  type CoreUiEvent,
  PermissionController,
  type PermissionRequest,
  runAgent,
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

/** Único aprovador do processo main: correlaciona a solicitação por `requestId` até a UI responder. */
const approver: Approver = {
  async request(request: PermissionRequest, _context: ToolContext): Promise<Approval> {
    const requestId = `perm-${++requestCounter}`;
    return new Promise<Approval>((resolve) => {
      pendingPermissions.set(requestId, resolve);
      sendCoreEvent({ type: "permission-request", request, requestId });
    });
  },
};

/**
 * Sessão de chat ativa: um workspace/gate/histórico por diretório de projeto. Reaproveitada
 * entre turnos (como o chat da CLI) para que o histórico da conversa e o "sempre permitir"
 * de uma tool durem a sessão inteira, não só uma mensagem.
 */
interface ChatSession {
  readonly cwd: string;
  readonly gate: ToolGate;
  readonly provider: Provider;
  readonly registry: ToolRegistry;
  transcript: ChatMessage[];
  readonly workspace: Workspace;
}

let activeSession: ChatSession | null = null;

function criarProvider(): Provider {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error(
      "Defina a variável de ambiente DEEPSEEK_API_KEY antes de abrir o CodingPro Desktop.",
    );
  }
  return new DeepSeekProvider({ apiKey });
}

async function getOrCreateSession(cwd: string): Promise<ChatSession> {
  if (activeSession && activeSession.cwd === cwd) {
    return activeSession;
  }
  const provider = criarProvider();
  const workspace = await Workspace.create(cwd);
  const registry = new ToolRegistry();
  for (const tool of ALL_TOOLS) {
    registry.register(tool);
  }
  const permissionController = new PermissionController({ mode: "ask" }, approver);
  const gate = new ToolGate(registry, permissionController);
  activeSession = { cwd, gate, provider, registry, transcript: [], workspace };
  return activeSession;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "CodingPro Desktop",
    backgroundColor: "#0d1117",
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
    if (!mainWindow) {
      return undefined;
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Selecionar pasta do projeto",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return undefined;
    }
    return result.filePaths[0];
  });

  ipcMain.on("codingpro:permission-response", (_, response: UiPermissionResponse) => {
    const resolver = pendingPermissions.get(response.requestId);
    if (resolver) {
      pendingPermissions.delete(response.requestId);
      const action = response.decision.action;
      const approval: Approval =
        action === "always" ? "approve-always" : action === "allow" ? "approve-once" : "deny";
      resolver(approval);
    }
  });

  ipcMain.handle(
    "codingpro:send-message",
    async (_, args: { prompt: string; workspacePath?: string }) => {
      try {
        const targetCwd =
          args.workspacePath && args.workspacePath.trim() !== ""
            ? args.workspacePath
            : process.cwd();
        const session = await getOrCreateSession(targetCwd);

        const userMessage: ChatMessage = { role: "user", content: args.prompt };
        const inputMessages: ChatMessage[] = [...session.transcript, userMessage];

        const agentResult = await runAgent({
          context: { workspace: session.workspace },
          gate: session.gate,
          messages: inputMessages,
          provider: session.provider,
          tools: session.registry.definitions(),
          onEvent: (agentEvent: AgentEvent) => {
            sendCoreEvent({
              type: "agent-event",
              event: agentEvent,
            });
          },
        });

        // Histórico persistido sem o system prompt (o `runAgent` refaz um a cada turno).
        const msgs = agentResult.messages;
        session.transcript = msgs[0]?.role === "system" ? msgs.slice(1) : [...msgs];

        sendCoreEvent({
          type: "session-updated",
          messages: agentResult.messages,
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
