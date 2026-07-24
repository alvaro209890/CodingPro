import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReadTracker, type ToolContext } from "../src/tool.js";
import { READ_FILE_MAX_BYTES, readFileTool } from "../src/tools/read-file.js";
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

  it("marca o arquivo como lido no rastreador da sessão", async () => {
    const readTracker = createReadTracker();
    await writeFile(join(root, "lido.txt"), "conteúdo");
    await readFileTool.execute({ path: "lido.txt" }, { ...context, readTracker });
    expect(readTracker.wasRead("lido.txt")).toBe(true);
    expect(readTracker.wasRead("outro.txt")).toBe(false);
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

  it("lê uma janela por offset/limit (base 1) com cabeçalho", async () => {
    await writeFile(join(root, "muitas.txt"), "l1\nl2\nl3\nl4\nl5");
    const r = await readFileTool.execute({ limit: 2, offset: 2, path: "muitas.txt" }, context);
    expect(r).toEqual({ type: "text", value: "# linhas 2–3 de 5\nl2\nl3" });
  });

  it("offset sem limit vai até o fim; valores inválidos são ignorados", async () => {
    await writeFile(join(root, "j.txt"), "a\nb\nc\nd");
    const soOffset = await readFileTool.execute({ offset: 3, path: "j.txt" }, context);
    expect(soOffset).toEqual({ type: "text", value: "# linhas 3–4 de 4\nc\nd" });
    // offset/limit não-positivos ou não-inteiros são ignorados → lê tudo
    const ignora = await readFileTool.execute({ limit: -5, offset: 0, path: "j.txt" }, context);
    expect(ignora).toEqual({ type: "text", value: "a\nb\nc\nd" });
  });

  it("offset além do fim retorna janela vazia com cabeçalho coerente", async () => {
    await writeFile(join(root, "curto.txt"), "x\ny");
    const r = await readFileTool.execute({ offset: 10, path: "curto.txt" }, context);
    expect(r).toEqual({ type: "text", value: "# linhas 3–2 de 2\n" });
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
