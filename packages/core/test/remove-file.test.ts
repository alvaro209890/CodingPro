import { existsSync } from "node:fs";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeFileWithin } from "../src/fs-safe.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("removeFileWithin", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await makeTmpRoot();
    workspace = await Workspace.create(root);
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("remove um arquivo existente", async () => {
    await writeFile(join(root, "a.txt"), "x");
    await removeFileWithin(workspace, join(root, "a.txt"));
    expect(existsSync(join(root, "a.txt"))).toBe(false);
  });

  it("é idempotente quando o arquivo não existe", async () => {
    await expect(removeFileWithin(workspace, join(root, "sumiu.txt"))).resolves.toBeUndefined();
  });

  it("é idempotente quando o diretório-pai não existe", async () => {
    await expect(
      removeFileWithin(workspace, join(root, "sem", "pai.txt")),
    ).resolves.toBeUndefined();
  });

  it("remove o próprio symlink sem seguir o alvo", async () => {
    const outside = await makeTmpRoot();
    try {
      await writeFile(join(outside, "alvo.txt"), "segredo");
      await symlink(join(outside, "alvo.txt"), join(root, "link.txt"));
      await removeFileWithin(workspace, join(root, "link.txt"));
      expect(existsSync(join(root, "link.txt"))).toBe(false);
      // O alvo fora do workspace permanece intacto.
      expect(existsSync(join(outside, "alvo.txt"))).toBe(true);
    } finally {
      await cleanup(outside);
    }
  });
});
