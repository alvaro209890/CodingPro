import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { WRITE_FILE_MAX_BYTES, writeFileTool } from "../src/tools/write-file.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("write_file", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("cria um arquivo novo em diretório existente", async () => {
    const result = await writeFileTool.execute({ content: "olá ção", path: "novo.txt" }, context);
    expect(result.type).toBe("text");
    expect(await readFile(join(root, "novo.txt"), "utf8")).toBe("olá ção");
  });

  it("captura no checkpoint antes de escrever quando há recorder", async () => {
    const capturado: string[] = [];
    const checkpoints = {
      capture: async (p: string) => {
        capturado.push(p);
      },
    };
    await writeFileTool.execute(
      { content: "x longo", path: "cp.txt" },
      { ...context, checkpoints },
    );
    expect(capturado).toEqual(["cp.txt"]);
  });

  it("sobrescreve arquivo existente", async () => {
    await writeFile(join(root, "a.txt"), "antigo conteúdo longo");
    await writeFileTool.execute({ content: "novo", path: "a.txt" }, context);
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("novo");
  });

  it("recusa conteúdo que não é texto", async () => {
    await expect(
      writeFileTool.execute({ content: 123, path: "x.txt" }, context),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("recusa conteúdo grande demais", async () => {
    const big = "a".repeat(WRITE_FILE_MAX_BYTES + 1);
    await expect(
      writeFileTool.execute({ content: big, path: "grande.txt" }, context),
    ).rejects.toMatchObject({ code: "too-large" });
  });

  it("recusa quando o diretório-pai não existe", async () => {
    await expect(
      writeFileTool.execute({ content: "x", path: "sem/pai.txt" }, context),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("recusa quando o destino é um diretório", async () => {
    await mkdir(join(root, "dir"));
    await expect(
      writeFileTool.execute({ content: "x", path: "dir" }, context),
    ).rejects.toMatchObject({ code: "not-a-file" });
  });

  it("recusa quando o destino é um symlink", async () => {
    await writeFile(join(root, "alvo.txt"), "x");
    try {
      await symlink(join(root, "alvo.txt"), join(root, "link.txt"));
    } catch {
      return; // No Windows sem Privilégio de Desenvolvedor, symlink lança EPERM
    }
    await expect(
      writeFileTool.execute({ content: "y", path: "link.txt" }, context),
    ).rejects.toMatchObject({ code: "path-escape" });
  });

  it("bloqueia escrita quando o diretório-pai é symlink que escapa", async () => {
    const outside = await makeTmpRoot();
    try {
      await symlink(outside, join(root, "linkdir"));
      await expect(
        writeFileTool.execute({ content: "x", path: "linkdir/arquivo.txt" }, context),
      ).rejects.toMatchObject({ code: "path-escape" });
    } finally {
      await cleanup(outside);
    }
  });

  it("bloqueia escape léxico", async () => {
    await expect(
      writeFileTool.execute({ content: "x", path: "../fora.txt" }, context),
    ).rejects.toMatchObject({ code: "path-escape" });
  });
});
