import { mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoreError } from "../src/errors.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("Workspace", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await makeTmpRoot();
    workspace = await Workspace.create(root);
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("canonicaliza a raiz e resolve caminhos aninhados dentro dela", async () => {
    await mkdir(join(root, "sub"), { recursive: true });
    const resolved = workspace.resolve("sub/arquivo.txt");
    expect(resolved.startsWith(workspace.root)).toBe(true);
    expect(workspace.toRelative(resolved)).toBe(join("sub", "arquivo.txt"));
    expect(workspace.toRelative(workspace.root)).toBe(".");
  });

  it("recusa raiz inexistente e raiz inválida", async () => {
    await expect(Workspace.create(join(root, "nao-existe"))).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(Workspace.create("")).rejects.toMatchObject({ code: "invalid-input" });
  });

  it.each([
    ["", "invalid-input"],
    ["a\0b", "invalid-input"],
    ["a\nb", "invalid-input"],
    ["a\rb", "invalid-input"],
    [`${"x".repeat(5000)}`, "invalid-input"],
    ["/etc/passwd", "path-escape"],
    ["~/segredo", "path-escape"],
    ["../fora", "path-escape"],
    ["sub/../../fora", "path-escape"],
  ])("rejeita o caminho inseguro %j como %s", (input, code) => {
    try {
      workspace.resolve(input);
      throw new Error("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(CoreError);
      expect((error as CoreError).code).toBe(code);
      expect((error as CoreError).safeMessage).not.toContain(tmpdir());
    }
  });

  it("rejeita input que não é string", () => {
    expect(() => workspace.resolve(42 as unknown as string)).toThrow(CoreError);
  });

  it("bloqueia symlink que aponta para fora da raiz via realpath", async () => {
    const outside = await makeTmpRoot();
    try {
      await writeFile(join(outside, "segredo.txt"), "conteúdo");
      await symlink(join(outside, "segredo.txt"), join(root, "link"));
      const lexical = workspace.resolve("link");
      await expect(workspace.realpathInside(lexical)).rejects.toMatchObject({
        code: "path-escape",
      });
    } finally {
      await cleanup(outside);
    }
  });

  it("realpathInside falha fechado quando o alvo não existe", async () => {
    const lexical = workspace.resolve("fantasma.txt");
    await expect(workspace.realpathInside(lexical)).rejects.toMatchObject({ code: "not-found" });
  });
});
