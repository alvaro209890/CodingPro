import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carregarAtribuicao } from "../src/attribution-runtime.js";

describe("carregarAtribuicao", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-attr-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("lê o modo do settings do projeto (vence global)", async () => {
    const proj = join(root, "proj");
    const home = join(root, "home");
    await mkdir(join(proj, ".codingpro"), { recursive: true });
    await mkdir(join(home, ".codingpro"), { recursive: true });
    await writeFile(
      join(home, ".codingpro", "settings.json"),
      JSON.stringify({ attribution: "trailer" }),
      "utf8",
    );
    await writeFile(
      join(proj, ".codingpro", "settings.json"),
      JSON.stringify({ attribution: "none" }),
      "utf8",
    );
    expect(await carregarAtribuicao(proj, home)).toBe("none");
  });

  it("cai para o global quando o projeto não define, e valida valor inválido", async () => {
    const proj = join(root, "proj");
    const home = join(root, "home");
    await mkdir(join(proj, ".codingpro"), { recursive: true });
    await mkdir(join(home, ".codingpro"), { recursive: true });
    // Projeto sem campo attribution → tenta o global.
    await writeFile(
      join(proj, ".codingpro", "settings.json"),
      JSON.stringify({ provider: "x" }),
      "utf8",
    );
    await writeFile(
      join(home, ".codingpro", "settings.json"),
      JSON.stringify({ attribution: "trailer" }),
      "utf8",
    );
    expect(await carregarAtribuicao(proj, home)).toBe("trailer");
  });

  it("valor inválido cai para o padrão full", async () => {
    const proj = join(root, "proj");
    await mkdir(join(proj, ".codingpro"), { recursive: true });
    await writeFile(
      join(proj, ".codingpro", "settings.json"),
      JSON.stringify({ attribution: "xpto" }),
      "utf8",
    );
    expect(await carregarAtribuicao(proj, join(root, "home"))).toBe("full");
  });

  it("padrão full quando ausente", async () => {
    expect(await carregarAtribuicao(join(root, "vazio"), join(root, "home"))).toBe("full");
  });
});
