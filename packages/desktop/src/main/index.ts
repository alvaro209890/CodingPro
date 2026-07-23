import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import {
  ALL_TOOLS,
  type AgentEvent,
  type CoreUiEvent,
  decidePermission,
  PermissionController,
  type PermissionDecision,
  type PermissionRequest,
  runAgent,
  ToolGate,
  ToolRegistry,
  UiPermissionEvent,
  UiPermissionResponse,
  Workspace,
} from "@codingpro/core";
import { createProvider, type ChatMessage } from "@codingpro/llm";

let mainWindow: BrowserWindow | null = null;
const pendingPermissions = new Map<string, (decision: PermissionDecision) => void>();

function sendCoreEvent(event: CoreUiEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("codingpro:core-event", event);
  }
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
    mainWindow.loadFile(join(__dirname, "../index.html"));
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

  ipcMain.on("codingpro:permission-response", (_, response: UiPermissionResponse) => {
    const resolver = pendingPermissions.get(response.requestId);
    if (resolver) {
      pendingPermissions.delete(response.requestId);
      resolver(response.decision);
    }
  });

  ipcMain.handle("codingpro:send-message", async (_, args: { prompt: string; workspacePath?: string }) => {
    try {
      const targetCwd = args.workspacePath && args.workspacePath.trim() !== "" ? args.workspacePath : process.cwd();
      const workspace = await Workspace.create(targetCwd);
      const registry = new ToolRegistry();
      for (const tool of ALL_TOOLS) {
        registry.register(tool);
      }

      const permissionController = new PermissionController({ mode: "ask" });
      const approver = {
        async askPermission(request: PermissionRequest): Promise<PermissionDecision> {
          return new Promise<PermissionDecision>((resolve) => {
            pendingPermissions.set(request.id, resolve);
            sendCoreEvent({
              type: "permission-request",
              request,
            });
          });
        },
      };

      const gate = new ToolGate({
        approver,
        permissionController,
        registry,
      });

      const provider = createProvider({
        provider: "deepseek",
        apiKey: process.env.DEEPSEEK_API_KEY ?? "dummy-dev-key",
      });

      const userMessage: ChatMessage = {
        role: "user",
        content: args.prompt,
      };

      const messages: ChatMessage[] = [userMessage];

      const agentResult = await runAgent({
        context: { workspace },
        gate,
        messages,
        provider,
        tools: registry.listDefinitions(),
        onEvent: (agentEvent: AgentEvent) => {
          sendCoreEvent({
            type: "agent-event",
            event: agentEvent,
          });
        },
      });

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
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
