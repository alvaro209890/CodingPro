import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { obterDiff, promptRevisao } from "../src/review-runtime.js";

const exec = promisify(execFile);

describe("review-runtime", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "codingpro-review-"));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it("erro quando não é repositório git", async () => {
    const r = await obterDiff(dir);
    expect(r.diff).toBe("");
    expect(r.erro).toContain("git");
  });

  it("pega o diff não commitado de um repo git", async () => {
    await exec("git", ["init"], { cwd: dir });
    await exec("git", ["config", "user.email", "t@t"], { cwd: dir });
    await exec("git", ["config", "user.name", "t"], { cwd: dir });
    await writeFile(join(dir, "a.txt"), "linha1\n");
    await exec("git", ["add", "a.txt"], { cwd: dir });
    await exec("git", ["commit", "-m", "inicial"], { cwd: dir });
    await writeFile(join(dir, "a.txt"), "linha1\nlinha2\n");
    const r = await obterDiff(dir);
    expect(r.erro).toBeUndefined();
    expect(r.diff).toContain("linha2");
  });

  it("sem mudanças → erro informativo", async () => {
    await exec("git", ["init"], { cwd: dir });
    const r = await obterDiff(dir);
    expect(r.erro).toBe("nenhuma mudança para revisar");
  });

  it("alvo inexistente vira erro informativo", async () => {
    await exec("git", ["init"], { cwd: dir });
    await exec("git", ["config", "user.email", "t@t"], { cwd: dir });
    await exec("git", ["config", "user.name", "t"], { cwd: dir });
    await writeFile(join(dir, "a.txt"), "x\n");
    await exec("git", ["add", "a.txt"], { cwd: dir });
    await exec("git", ["commit", "-m", "c"], { cwd: dir });
    const r = await obterDiff(dir, "branch-que-nao-existe");
    expect(r.erro).toContain("alvo inválido");
  });

  it("aceita um alvo válido (HEAD)", async () => {
    await exec("git", ["init"], { cwd: dir });
    await exec("git", ["config", "user.email", "t@t"], { cwd: dir });
    await exec("git", ["config", "user.name", "t"], { cwd: dir });
    await writeFile(join(dir, "a.txt"), "x\n");
    await exec("git", ["add", "a.txt"], { cwd: dir });
    await exec("git", ["commit", "-m", "c"], { cwd: dir });
    await writeFile(join(dir, "a.txt"), "x\ny\n");
    const r = await obterDiff(dir, "HEAD");
    expect(r.diff).toContain("+y");
  });

  it("promptRevisao embrulha o diff pedindo severidade", () => {
    const p = promptRevisao("- foo\n+ bar");
    expect(p).toContain("severidade");
    expect(p).toContain("```diff");
    expect(p).toContain("+ bar");
  });
});
