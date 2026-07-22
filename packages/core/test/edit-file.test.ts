import { readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReadTracker, type ToolContext } from "../src/tool.js";
import {
  aplicarEdicoes,
  contarOcorrencias,
  EDIT_FILE_MAX_BLOCKS,
  editFileTool,
  linhaMaisProxima,
  parseEditBlocks,
} from "../src/tools/edit-file.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("edit_file", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    const workspace = await Workspace.create(root);
    // Contexto com o arquivo já "lido" para satisfazer a guarda de leitura por padrão.
    const readTracker = createReadTracker();
    readTracker.markRead("a.ts");
    context = { readTracker, workspace };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("aplica um bloco search/replace único", async () => {
    await writeFile(join(root, "a.ts"), "const x = 1;\nconst y = 2;\n");
    const result = await editFileTool.execute(
      { edits: [{ replace: "const x = 42;", search: "const x = 1;" }], path: "a.ts" },
      context,
    );
    expect(result.type).toBe("text");
    expect(await readFile(join(root, "a.ts"), "utf8")).toBe("const x = 42;\nconst y = 2;\n");
  });

  it("aplica múltiplos blocos de forma atômica e em ordem", async () => {
    await writeFile(join(root, "a.ts"), "alpha\nbeta\ngama\n");
    await editFileTool.execute(
      {
        edits: [
          { replace: "ALPHA", search: "alpha" },
          { replace: "GAMA", search: "gama" },
        ],
        path: "a.ts",
      },
      context,
    );
    expect(await readFile(join(root, "a.ts"), "utf8")).toBe("ALPHA\nbeta\nGAMA\n");
  });

  it("um bloco pode editar texto produzido por um anterior", async () => {
    await writeFile(join(root, "a.ts"), "um\n");
    await editFileTool.execute(
      {
        edits: [
          { replace: "dois", search: "um" },
          { replace: "tres", search: "dois" },
        ],
        path: "a.ts",
      },
      context,
    );
    expect(await readFile(join(root, "a.ts"), "utf8")).toBe("tres\n");
  });

  it("não interpreta $ do replace (substituição literal)", async () => {
    await writeFile(join(root, "a.ts"), "valor: TOKEN\n");
    await editFileTool.execute(
      { edits: [{ replace: "$1 e $& literais", search: "TOKEN" }], path: "a.ts" },
      context,
    );
    expect(await readFile(join(root, "a.ts"), "utf8")).toBe("valor: $1 e $& literais\n");
  });

  it("devolve erro estruturado quando o trecho não é encontrado", async () => {
    await writeFile(join(root, "a.ts"), "const total = 10;\n");
    const result = await editFileTool.execute(
      { edits: [{ replace: "x", search: "const totl = 10;" }], path: "a.ts" },
      context,
    );
    expect(result).toMatchObject({ type: "error-text" });
    expect((result as { value: string }).value).toContain("não encontrei o trecho");
    // Não deve ter escrito nada.
    expect(await readFile(join(root, "a.ts"), "utf8")).toBe("const total = 10;\n");
  });

  it("devolve erro quando o trecho é ambíguo (mais de uma ocorrência)", async () => {
    await writeFile(join(root, "a.ts"), "x\nx\n");
    const result = await editFileTool.execute(
      { edits: [{ replace: "y", search: "x" }], path: "a.ts" },
      context,
    );
    expect(result).toMatchObject({ type: "error-text" });
    expect((result as { value: string }).value).toContain("2 vezes");
  });

  it("é atômico: se um bloco falha, nenhum é aplicado", async () => {
    await writeFile(join(root, "a.ts"), "primeira\nsegunda\n");
    const result = await editFileTool.execute(
      {
        edits: [
          { replace: "PRIMEIRA", search: "primeira" },
          { replace: "x", search: "inexistente" },
        ],
        path: "a.ts",
      },
      context,
    );
    expect(result.type).toBe("error-text");
    expect(await readFile(join(root, "a.ts"), "utf8")).toBe("primeira\nsegunda\n");
  });

  it("bloqueia edição de arquivo não lido na sessão", async () => {
    await writeFile(join(root, "b.ts"), "conteúdo\n");
    const result = await editFileTool.execute(
      { edits: [{ replace: "novo", search: "conteúdo" }], path: "b.ts" },
      context,
    );
    expect(result).toMatchObject({ type: "error-text" });
    expect((result as { value: string }).value).toContain("antes de editar");
  });

  it("relata quando não houve mudança", async () => {
    await writeFile(join(root, "a.ts"), "igual\n");
    const result = await editFileTool.execute(
      { edits: [{ replace: "igual", search: "igual" }], path: "a.ts" },
      context,
    );
    expect(result).toMatchObject({ type: "text" });
    expect((result as { value: string }).value).toContain("Nenhuma mudança");
  });

  it("propaga not-found quando o arquivo não existe", async () => {
    // A guarda de leitura passa (marcado), mas a leitura falha e o erro sobe à fronteira do registry.
    context.readTracker?.markRead("some.ts");
    await expect(
      editFileTool.execute({ edits: [{ replace: "x", search: "y" }], path: "some.ts" }, context),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("bloqueia symlink no destino", async () => {
    await writeFile(join(root, "alvo.ts"), "x\n");
    await symlink(join(root, "alvo.ts"), join(root, "link.ts"));
    context.readTracker?.markRead("link.ts");
    await expect(
      editFileTool.execute({ edits: [{ replace: "y", search: "x" }], path: "link.ts" }, context),
    ).rejects.toMatchObject({ code: "path-escape" });
  });
});

describe("parseEditBlocks", () => {
  it("aceita blocos válidos", () => {
    expect(parseEditBlocks([{ replace: "b", search: "a" }])).toEqual([
      { replace: "b", search: "a" },
    ]);
  });

  it("recusa lista vazia", () => {
    expect(() => parseEditBlocks([])).toThrow(/ao menos um bloco/);
  });

  it("recusa não-array", () => {
    expect(() => parseEditBlocks("nope")).toThrow(/ao menos um bloco/);
  });

  it("recusa blocos demais", () => {
    const muitos = Array.from({ length: EDIT_FILE_MAX_BLOCKS + 1 }, () => ({
      replace: "b",
      search: "a",
    }));
    expect(() => parseEditBlocks(muitos)).toThrow(/No máximo/);
  });

  it("recusa search/replace que não são texto", () => {
    expect(() => parseEditBlocks([{ replace: "b", search: 1 }])).toThrow(/precisam ser texto/);
  });

  it("recusa search vazio", () => {
    expect(() => parseEditBlocks([{ replace: "b", search: "" }])).toThrow(/não pode ser vazio/);
  });
});

describe("contarOcorrencias", () => {
  it("conta ocorrências literais", () => {
    expect(contarOcorrencias("a.b.c", ".")).toBe(2);
    expect(contarOcorrencias("abc", "x")).toBe(0);
  });

  it("retorna 0 para agulha vazia", () => {
    expect(contarOcorrencias("abc", "")).toBe(0);
  });
});

describe("linhaMaisProxima", () => {
  it("acha a linha com maior prefixo comum", () => {
    const conteudo = "const total = 10;\nconst nome = 'x';\n";
    expect(linhaMaisProxima(conteudo, "const totl = 10;")).toBe("const total = 10;");
  });

  it("retorna undefined quando nada é parecido", () => {
    expect(linhaMaisProxima("xyz\n", "abc")).toBeUndefined();
  });

  it("retorna undefined para trecho vazio", () => {
    expect(linhaMaisProxima("abc\n", "")).toBeUndefined();
  });
});

describe("aplicarEdicoes", () => {
  it("devolve texto no caminho feliz", () => {
    const r = aplicarEdicoes("a", [{ replace: "b", search: "a" }], "f.ts");
    expect(r).toEqual({ texto: "b" });
  });

  it("devolve erro no match falho", () => {
    const r = aplicarEdicoes("a", [{ replace: "b", search: "z" }], "f.ts");
    expect("erro" in r).toBe(true);
  });
});
