import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { READ_FILE_MAX_BYTES, readFileTool } from "../src/tools/read-file.js";
import type { ToolContext } from "../src/tool.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("read_file", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("lê o conteúdo utf-8 de um arquivo", async () => {
    await writeFile(join(root, "nota.txt"), "linha ção");
    const result = await readFileTool.execute({ path: "nota.txt" }, context);
    expect(result).toEqual({ type: "text", value: "linha ção" });
  });

  it("lê arquivo vazio sem erro", async () => {
    await writeFile(join(root, "vazio.txt"), "");
    const result = await readFileTool.execute({ path: "vazio.txt" }, context);
    expect(result).toEqual({ type: "text", value: "" });
  });

  it("aceita arquivo no limite e recusa um byte acima", async () => {
    await writeFile(join(root, "limite.bin"), Buffer.alloc(READ_FILE_MAX_BYTES, 65));
    const ok = await readFileTool.execute({ path: "limite.bin" }, context);
    expect(ok.type).toBe("text");

    await writeFile(join(root, "acima.bin"), Buffer.alloc(READ_FILE_MAX_BYTES + 1, 65));
    await expect(readFileTool.execute({ path: "acima.bin" }, context)).rejects.toMatchObject({
      code: "too-large",
    });
  });

  it("recusa diretório e caminho inexistente", async () => {
    await mkdir(join(root, "dir"));
    await expect(readFileTool.execute({ path: "dir" }, context)).rejects.toMatchObject({
      code: "not-a-file",
    });
    await expect(readFileTool.execute({ path: "sumiu.txt" }, context)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("bloqueia leitura via symlink (não segue o link)", async () => {
    const outside = await makeTmpRoot();
    try {
      await writeFile(join(outside, "segredo.txt"), "secreto");
      await symlink(join(outside, "segredo.txt"), join(root, "link.txt"));
      await expect(readFileTool.execute({ path: "link.txt" }, context)).rejects.toMatchObject({
        code: "path-escape",
      });
    } finally {
      await cleanup(outside);
    }
  });

  it("bloqueia escape léxico por caminho relativo", async () => {
    await expect(readFileTool.execute({ path: "../fora.txt" }, context)).rejects.toMatchObject({
      code: "path-escape",
    });
  });
});
