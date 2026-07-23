import { app, BrowserWindow, ipcMain } from "electron";
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
import { DeepSeekProvider, type ChatMessage } from "@codingpro/llm";

let mainWindow: BrowserWindow | null = null;
let requestCounter = 0;
const pendingPermissions = new Map<string, (approval: Approval) => void>();

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

  ipcMain.handle(
    "codingpro:send-message",
    async (_, args: { prompt: string; workspacePath?: string }) => {
      try {
        const targetCwd =
          args.workspacePath && args.workspacePath.trim() !== ""
            ? args.workspacePath
            : process.cwd();
        const workspace = await Workspace.create(targetCwd);
        const registry = new ToolRegistry();
        for (const tool of ALL_TOOLS) {
          registry.register(tool);
        }

        const approver: Approver = {
          async request(request: PermissionRequest, _context: ToolContext): Promise<Approval> {
            const requestId = `perm-${++requestCounter}`;
            return new Promise<Approval>((resolve) => {
              pendingPermissions.set(requestId, resolve);
              sendCoreEvent({
                type: "permission-request",
                request,
              });
            });
          },
        };

        const permissionController = new PermissionController({ mode: "ask" }, approver);
        const gate = new ToolGate(registry, permissionController);

        const provider = new DeepSeekProvider({
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
          tools: registry.definitions(),
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
    },
  );
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
