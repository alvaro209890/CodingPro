import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("contrato do preload empacotado", () => {
  it("mantem todas as operacoes publicas no gerador CommonJS", async () => {
    const [typedPreload, cjsGenerator] = await Promise.all([
      readFile(join(desktopRoot, "src", "preload", "index.ts"), "utf8"),
      readFile(join(desktopRoot, "scripts", "build-preload.mjs"), "utf8"),
    ]);

    const operations = [
      "sendMessage",
      "respondPermission",
      "onCoreEvent",
      "getWorkspaceInfo",
      "estadoAcesso",
      "contaLogin",
      "contaLoginDireto",
      "contaCadastrar",
      "contaConsultar",
      "contaLogout",
      "chooseWorkspaceFolder",
      "setWorkspace",
      "newSession",
      "cancelRun",
      "listSessions",
      "loadSession",
      "getDiffPreview",
      "runTerminalCommand",
      "getSessionCost",
      "getUpdateState",
      "checkForUpdates",
      "downloadUpdate",
      "installUpdate",
      "onUpdateEvent",
      "getSlashCommands",
      "setAutoApprove",
      "getAutoApprove",
    ];

    for (const operation of operations) {
      expect(typedPreload, `preload tipado sem ${operation}`).toContain(`${operation}:`);
      expect(cjsGenerator, `gerador CJS sem ${operation}`).toContain(`${operation}:`);
    }
  });
});
