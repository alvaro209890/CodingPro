import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { comandoPermitido, runCommandTool } from "../src/tools/run-command.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

function texto(result: { type: string; value?: unknown }): string {
  if (result.type === "error-text") {
    return result.value as string;
  }
  expect(result.type).toBe("text");
  return result.value as string;
}

describe("run_command", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  describe("comandoPermitido", () => {
    it("aceita prefixos allowlisted", () => {
      expect(comandoPermitido("git log --oneline -5")).toBe(true);
      expect(comandoPermitido("node -v")).toBe(true);
      expect(comandoPermitido("echo oi")).toBe(true);
      expect(comandoPermitido("cat arquivo.txt")).toBe(true);
    });

    it("rejeita comandos fora da lista", () => {
      expect(comandoPermitido("rm -rf /")).toBe(false);
      expect(comandoPermitido("git push")).toBe(false);
    });
  });

  it("executa comando permitido", async () => {
    const out = texto(await runCommandTool.execute({ command: "echo oi" }, context));
    expect(out).toContain("[código 0]");
    expect(out).toContain("oi");
  });

  it("rejeita comando não permitido com mensagem em português", async () => {
    const out = await runCommandTool.execute({ command: "git push origin main" }, context);
    expect(out.type).toBe("error-text");
    expect((out as { value: string }).value).toContain("bash");
  });

  it("trunca saída enorme com head+tail", async () => {
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(join(root, "big.txt"), "a".repeat(50_000));
    const cmd = process.platform === "win32" ? "type big.txt" : "cat big.txt";
    const out = texto(await runCommandTool.execute({ command: cmd }, context));
    expect(out).toContain("truncado:");
    expect(out.length).toBeLessThan(20_000);
  });
});
