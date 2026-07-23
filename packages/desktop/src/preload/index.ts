import { contextBridge, ipcRenderer } from "electron";
import type { CoreUiEvent, UiPermissionResponse } from "@codingpro/core";
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
  chooseWorkspaceFolder: () => {
    return ipcRenderer.invoke("codingpro:choose-workspace-folder");
  },
};

contextBridge.exposeInMainWorld("codingproAPI", api);
