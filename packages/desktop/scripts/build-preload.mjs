/**
 * Gera dist/preload/index.cjs (CommonJS).
 * Electron 34 + package "type":"module" não carrega preload ESM
 * (ERR_UNSUPPORTED_ESM_URL_SCHEME protocol 'electron:').
 *
 * Fonte canônica das APIs: src/preload/index.ts — manter em sincronia.
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
  estadoAcesso: () => {
    return ipcRenderer.invoke("codingpro:estado-acesso");
  },
  obterSaldoConta: () => {
    return ipcRenderer.invoke("codingpro:saldo-conta");
  },
  onSaldoConta: (callback) => {
    const handler = (_event, saldo) => callback(saldo);
    ipcRenderer.on("codingpro:saldo-event", handler);
    return () => {
      ipcRenderer.removeListener("codingpro:saldo-event", handler);
    };
  },
  contaLogin: (apiUrl) => {
    return ipcRenderer.invoke("codingpro:conta-login", apiUrl);
  },
  contaLoginDireto: (email, senha) => {
    return ipcRenderer.invoke("codingpro:conta-login-direto", email, senha);
  },
  contaCadastrar: (email, nome, senha) => {
    return ipcRenderer.invoke("codingpro:conta-cadastrar", email, nome, senha);
  },
  contaConsultar: (apiUrl, codigoDispositivo) => {
    return ipcRenderer.invoke("codingpro:conta-consultar", apiUrl, codigoDispositivo);
  },
  contaLogout: () => {
    return ipcRenderer.invoke("codingpro:conta-logout");
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
  loadSession: (target) => {
    return ipcRenderer.invoke("codingpro:load-session", target);
  },
  getDiffPreview: (targetFile, newContent) => {
    return ipcRenderer.invoke("codingpro:get-diff-preview", { targetFile, newContent });
  },
  runTerminalCommand: (command) => {
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
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("codingpro:update-event", handler);
    return () => ipcRenderer.removeListener("codingpro:update-event", handler);
  },
  getSlashCommands: () => {
    return ipcRenderer.invoke("codingpro:list-slash-commands");
  },
  setAutoApprove: (enabled) => {
    return ipcRenderer.invoke("codingpro:set-auto-approve", enabled);
  },
  getAutoApprove: () => {
    return ipcRenderer.invoke("codingpro:get-auto-approve");
  },
};

contextBridge.exposeInMainWorld("codingproAPI", api);
`;

mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, source, "utf8");
console.log("[build-preload] ok →", outfile);
