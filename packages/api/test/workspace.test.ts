import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dirUsuario, raizWorkspace } from "../src/workspace.js";

let raizTemp = "";
const raizAnterior = process.env.CODINGPRO_WORKSPACE_ROOT;

beforeEach(async () => {
  raizTemp = await mkdtemp(join(tmpdir(), "codingpro-workspace-"));
  process.env.CODINGPRO_WORKSPACE_ROOT = raizTemp;
});

afterEach(async () => {
  if (raizAnterior === undefined) delete process.env.CODINGPRO_WORKSPACE_ROOT;
  else process.env.CODINGPRO_WORKSPACE_ROOT = raizAnterior;
  await rm(raizTemp, { force: true, recursive: true });
});

describe("workspace", () => {
  it("raizWorkspace respeita CODINGPRO_WORKSPACE_ROOT", () => {
    expect(raizWorkspace()).toBe(raizTemp);
  });

  it("raizWorkspace ignora variável vazia", () => {
    process.env.CODINGPRO_WORKSPACE_ROOT = "   ";
    expect(raizWorkspace()).not.toBe("   ");
  });

  it("dirUsuario cria pastas padrão do usuário", async () => {
    const dir = dirUsuario(42);
    expect(dir).toBe(join(raizTemp, "42"));
    const pastas = await readdir(dir);
    expect(pastas.sort()).toEqual([".memory", "Documents", "Downloads", "Projects"]);
  });
});
