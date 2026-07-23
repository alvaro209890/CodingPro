import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarMemoriaSessao, dirMemoriaGlobalPadrao } from "../src/memory-runtime.js";

describe("criarMemoriaSessao", () => {
  let cwd: string;
  let globalDir: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "codingpro-mem-rt-"));
    globalDir = join(cwd, "g");
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  it("o diretório global padrão fica sob ~/.codingpro/memory", () => {
    expect(dirMemoriaGlobalPadrao("/lar")).toBe(join("/lar", ".codingpro", "memory"));
    expect(dirMemoriaGlobalPadrao()).toBe(join(homedir(), ".codingpro", "memory"));
  });

  it("promptDoTurno anexa índices e memórias relevantes ao base", async () => {
    const mem = criarMemoriaSessao(cwd, globalDir);
    await mem.projeto.remember("O deploy no Render é manual", "project", "deploy-render");
    const semRelevancia = await mem.promptDoTurno("BASE", "assunto totalmente diferente xyz");
    expect(semRelevancia).toContain("BASE");
    expect(semRelevancia).toContain("deploy-render"); // índice sempre entra
    const comRelevancia = await mem.promptDoTurno("BASE", "como é o deploy no render?");
    expect(comRelevancia).toContain("O deploy no Render é manual"); // corpo recuperado
  });

  it("promptDoTurno devolve o base intacto quando não há memória", async () => {
    const mem = criarMemoriaSessao(cwd, globalDir);
    expect(await mem.promptDoTurno("BASE", "qualquer coisa")).toBe("BASE");
  });
});
