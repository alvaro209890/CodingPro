import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { gitStatusTool } from "../src/tools/git-status.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

const execFileAsync = promisify(execFile);

function texto(result: { type: string; value?: unknown }): string {
  if (result.type === "error-text") {
    return result.value as string;
  }
  expect(result.type).toBe("text");
  return result.value as string;
}

async function initGit(root: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: root });
}

describe("git_status", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("fora de repositório git devolve error-text", async () => {
    const out = await gitStatusTool.execute({}, context);
    expect(out.type).toBe("error-text");
    expect((out as { value: string }).value).toContain("não é um repositório git");
  });

  it("reporta working tree limpo", async () => {
    await initGit(root);
    const out = texto(await gitStatusTool.execute({}, context));
    expect(out).toContain("working tree limpo");
  });

  it("mostra arquivos modificados", async () => {
    await initGit(root);
    await writeFile(join(root, "novo.txt"), "oi\n");
    const out = texto(await gitStatusTool.execute({}, context));
    expect(out).toContain("novo.txt");
    expect(out).toMatch(/^## /m);
  });
});
