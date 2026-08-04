import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { gitDiffTool } from "../src/tools/git-diff.js";
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

async function commitArquivo(root: string, rel: string, conteudo: string): Promise<void> {
  await writeFile(join(root, rel), conteudo);
  await execFileAsync("git", ["add", rel], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: root });
}

describe("git_diff", () => {
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
    const out = await gitDiffTool.execute({}, context);
    expect(out.type).toBe("error-text");
    expect((out as { value: string }).value).toContain("não é um repositório git");
  });

  it("sem mudanças devolve mensagem amigável", async () => {
    await initGit(root);
    const out = texto(await gitDiffTool.execute({}, context));
    expect(out).toContain("nenhuma mudança");
  });

  it("com stat=true mostra resumo --stat", async () => {
    await initGit(root);
    await commitArquivo(root, "a.txt", "conteudo\n");
    await writeFile(join(root, "a.txt"), "alterado\n");
    const out = texto(await gitDiffTool.execute({ stat: true }, context));
    expect(out).toMatch(/a\.txt|não staged/i);
  });

  it("com stat=false mostra patch", async () => {
    await initGit(root);
    await commitArquivo(root, "b.txt", "linha\n");
    await writeFile(join(root, "b.txt"), "alterada\n");
    const out = texto(await gitDiffTool.execute({ stat: false }, context));
    expect(out).toMatch(/\+\+\+|b\.txt|alterada/);
  });
});
