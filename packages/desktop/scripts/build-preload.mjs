/**
 * Gera dist/preload/index.cjs (CommonJS).
 * Electron 34 + package "type":"module" não carrega preload ESM
 * (ERR_UNSUPPORTED_ESM_URL_SCHEME protocol 'electron:').
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outfile = join(__dirname, "..", "dist", "preload", "index.cjs");

const source = `"use strict";
/**
 * Preload CJS — gerado por scripts/build-preload.mjs
 * NÃO editar à mão; fonte: src/preload/index.ts
 */
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  sendMessage: (prompt, workspacePath) => {
    return ipcRenderer.invoke("codingpro:send-message", { prompt, workspacePath });
  },
  respondPermission: (response) => {
    ipcRenderer.send("codingpro:permission-response", response);
  },
  onCoreEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
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
  setWorkspace: (cwd) => {
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
  loadSession: (sessionId) => {
    return ipcRenderer.invoke("codingpro:load-session", sessionId);
  },
  getDiffPreview: (targetFile, newContent) => {
    return ipcRenderer.invoke("codingpro:get-diff-preview", { targetFile, newContent });
  },
  runTerminalCommand: (command) => {
    return ipcRenderer.invoke("codingpro:run-terminal-command", command);
  },
};

contextBridge.exposeInMainWorld("codingproAPI", api);
`;

mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, source, "utf8");
console.log("[build-preload] ok →", outfile);
