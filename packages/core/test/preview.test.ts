import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatarPreviaDeEscrita, resolverPreviaDeEscrita } from "../src/preview.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("resolverPreviaDeEscrita", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await makeTmpRoot();
    workspace = await Workspace.create(root);
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("prévia de write_file sobre arquivo existente", async () => {
    await writeFile(join(root, "a.txt"), "velho");
    const previa = await resolverPreviaDeEscrita(workspace, "write_file", {
      content: "novo",
      path: "a.txt",
    });
    expect(previa).toEqual({ antes: "velho", depois: "novo", path: "a.txt" });
  });

  it("prévia de write_file sobre arquivo novo usa antes vazio", async () => {
    const previa = await resolverPreviaDeEscrita(workspace, "write_file", {
      content: "conteúdo",
      path: "novo.txt",
    });
    expect(previa?.antes).toBe("");
    expect(previa?.depois).toBe("conteúdo");
  });

  it("prévia de edit_file aplica os blocos", async () => {
    await writeFile(join(root, "a.ts"), "const x = 1;\n");
    const previa = await resolverPreviaDeEscrita(workspace, "edit_file", {
      edits: [{ replace: "const x = 2;", search: "const x = 1;" }],
      path: "a.ts",
    });
    expect(previa?.depois).toBe("const x = 2;\n");
  });

  it("devolve undefined quando o edit não casa", async () => {
    await writeFile(join(root, "a.ts"), "outra coisa\n");
    const previa = await resolverPreviaDeEscrita(workspace, "edit_file", {
      edits: [{ replace: "x", search: "não existe" }],
      path: "a.ts",
    });
    expect(previa).toBeUndefined();
  });

  it("devolve undefined para input inválido ou tool sem prévia", async () => {
    expect(await resolverPreviaDeEscrita(workspace, "write_file", { path: 3 })).toBeUndefined();
    expect(
      await resolverPreviaDeEscrita(workspace, "write_file", { content: "x" }),
    ).toBeUndefined();
    expect(await resolverPreviaDeEscrita(workspace, "bash", { command: "ls" })).toBeUndefined();
  });

  it("devolve undefined em caminho que escapa (não vaza erro)", async () => {
    expect(
      await resolverPreviaDeEscrita(workspace, "write_file", { content: "x", path: "../fora" }),
    ).toBeUndefined();
  });
});

describe("formatarPreviaDeEscrita", () => {
  it("mostra cabeçalho com caminho e diff", () => {
    const bloco = formatarPreviaDeEscrita({ antes: "a\nb", depois: "a\nX", path: "f.txt" });
    expect(bloco).toContain("── f.txt ──");
    expect(bloco).toContain("- b");
    expect(bloco).toContain("+ X");
  });

  it("devolve undefined quando nada muda", () => {
    expect(
      formatarPreviaDeEscrita({ antes: "igual", depois: "igual", path: "f.txt" }),
    ).toBeUndefined();
  });

  it("resume quando o arquivo é grande demais", () => {
    const grande = Array.from({ length: 2500 }, (_, i) => `l${i}`).join("\n");
    const bloco = formatarPreviaDeEscrita({
      antes: grande,
      depois: `${grande}\nmais`,
      path: "big",
    });
    expect(bloco).toContain("prévia omitida");
  });
});
