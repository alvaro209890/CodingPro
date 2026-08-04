import type { CoreUiEvent, UiPermissionResponse } from "@codingpro/core";
import { contextBridge, ipcRenderer } from "electron";
import type { SaldoContaUI } from "../shared/saldo-conta.js";
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
  obterSaldoConta: () => {
    return ipcRenderer.invoke("codingpro:saldo-conta") as Promise<SaldoContaUI>;
  },
  onSaldoConta: (callback: (saldo: SaldoContaUI) => void) => {
    const handler = (_: unknown, saldo: SaldoContaUI) => callback(saldo);
    ipcRenderer.on("codingpro:saldo-event", handler);
    return () => {
      ipcRenderer.removeListener("codingpro:saldo-event", handler);
    };
  },
  contaLogin: (apiUrl?: string) => {
    return ipcRenderer.invoke("codingpro:conta-login", apiUrl);
  },
  contaLoginDireto: (email: string, senha: string) => {
    return ipcRenderer.invoke("codingpro:conta-login-direto", email, senha) as Promise<{
      status: string;
    }>;
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
  loadSession: (target) => {
    return ipcRenderer.invoke("codingpro:load-session", target);
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
  getUpdateState: () => {
    return ipcRenderer.invoke("codingpro:update-state");
  },
  checkForUpdates: () => {
    return ipcRenderer.invoke("codingpro:update-check");
  },
  downloadUpdate: () => {
    return ipcRenderer.invoke("codingpro:update-download");
  },
  installUpdate: () => {
    return ipcRenderer.invoke("codingpro:update-install");
  },
  onUpdateEvent: (callback) => {
    const handler = (_: unknown, state: Parameters<typeof callback>[0]) => callback(state);
    ipcRenderer.on("codingpro:update-event", handler);
    return () => ipcRenderer.removeListener("codingpro:update-event", handler);
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
  setModoEconomico: (enabled: boolean) => {
    return ipcRenderer.invoke("codingpro:set-modo-economico", enabled);
  },
  getModoEconomico: () => {
    return ipcRenderer.invoke("codingpro:get-modo-economico");
  },
};

contextBridge.exposeInMainWorld("codingproAPI", api);
