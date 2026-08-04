import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const desktopRoot = join(import.meta.dirname, "..");

describe("cancelamento do runtime desktop", () => {
  it("liga o AbortController ao agente principal, tools e reparos", async () => {
    const source = await readFile(join(desktopRoot, "src", "main", "index.ts"), "utf8");
    expect(source.match(/signal: abort\.signal/gu)).toHaveLength(4);
    const cancelHandler = source.match(
      /ipcMain\.handle\("codingpro:cancel-run"[\s\S]*?return \{ success: true \};\s*\}\);/u,
    )?.[0];
    expect(cancelHandler).toContain("activeAbort.abort()");
    expect(cancelHandler).not.toContain("runInFlight = false");
  });
});
