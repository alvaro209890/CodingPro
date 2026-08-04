import type { CoreUiEvent, UiPermissionResponse } from "@codingpro/core";
import { contextBridge, ipcRenderer } from "electron";
import type { CodingProDesktopAPI } from "../types/electron.js";

const api: CodingProDesktopAPI = {
  sendMessage: (prompt: string, workspacePath?: string) => {
    return ipcRenderer.invoke("codingpro:send-message", { prompt, workspacePath });
  },
  respondPermission: (response: UiPermissionResponse) => {
    ipcRenderer.send("codingpro:permission-response", response);
  },
  onCoreEvent: (callback: (event: CoreUiEvent) => void) => {
    const handler = (_: unknown, event: CoreUiEvent) => callback(event);
    ipcRenderer.on("codingpro:core-event", handler);
    return () => {
      ipcRenderer.removeListener("codingpro:core-event", handler);
    };
  },
  getWorkspaceInfo: () => {
    return ipcRenderer.invoke("codingpro:get-workspace-info");
  },
  /** Conta do CodingPro Cloud — mesmo device flow e mesmo arquivo da CLI. */
  estadoAcesso: () => {
    return ipcRenderer.invoke("codingpro:estado-acesso");
  },
  contaLogin: (apiUrl?: string) => {
    return ipcRenderer.invoke("codingpro:conta-login", apiUrl);
  },
  contaLoginDireto: (email: string, senha: string) => {
    return ipcRenderer.invoke(
      "codingpro:conta-login-direto",
      email,
      senha,
    ) as Promise<{ status: string }>;
  },
  contaCadastrar: (email: string, nome: string, senha: string) => {
    return ipcRenderer.invoke("codingpro:conta-cadastrar", email, nome, senha);
  },
  contaConsultar: (apiUrl: string, codigoDispositivo: string) => {
    return ipcRenderer.invoke("codingpro:conta-consultar", apiUrl, codigoDispositivo);
  },
  contaLogout: () => {
    return ipcRenderer.invoke("codingpro:conta-logout");
  },
  chooseWorkspaceFolder: () => {
    return ipcRenderer.invoke("codingpro:choose-workspace-folder");
  },
  setWorkspace: (cwd: string) => {
    return ipcRenderer.invoke("codingpro:set-workspace", cwd);
  },
  newSession: () => {
    return ipcRenderer.invoke("codingpro:new-session");
  },
  cancelRun: () => {
    return ipcRenderer.invoke("codingpro:cancel-run");
  },
  listSessions: () => {
    return ipcRenderer.invoke("codingpro:list-sessions");
  },
  loadSession: (sessionId: string) => {
    return ipcRenderer.invoke("codingpro:load-session", sessionId);
  },
  getDiffPreview: (targetFile: string, newContent: string) => {
    return ipcRenderer.invoke("codingpro:get-diff-preview", { targetFile, newContent });
  },
  runTerminalCommand: (command: string) => {
    return ipcRenderer.invoke("codingpro:run-terminal-command", command);
  },
  getSessionCost: () => {
    return ipcRenderer.invoke("codingpro:get-session-cost");
  },
  getSlashCommands: () => {
    return ipcRenderer.invoke("codingpro:list-slash-commands");
  },
  setAutoApprove: (enabled: boolean) => {
    return ipcRenderer.invoke("codingpro:set-auto-approve", enabled);
  },
  getAutoApprove: () => {
    return ipcRenderer.invoke("codingpro:get-auto-approve");
  },
};

contextBridge.exposeInMainWorld("codingproAPI", api);
