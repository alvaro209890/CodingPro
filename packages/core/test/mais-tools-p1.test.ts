import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReadTracker } from "../src/tool.js";
import { editSymbolTool } from "../src/tools/edit-symbol.js";
import { findReferencesTool } from "../src/tools/find-references.js";
import { hostPermitido, httpRequestTool } from "../src/tools/http-request.js";
import { readFilesTool } from "../src/tools/read-files.js";
import { todoListTool } from "../src/tools/todo-list.js";
import { Workspace } from "../src/workspace.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codingpro-tools-p1-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

describe("read_files", () => {
  it("lê vários arquivos e marca o tracker", async () => {
    await writeFile(join(root, "a.ts"), " consola = 1;\n");
    await writeFile(join(root, "b.ts"), "export const b = 2;\n");
    const workspace = await Workspace.create(root);
    const readTracker = createReadTracker();
    const result = await readFilesTool.execute(
      { paths: ["a.ts", "b.ts"] },
      { readTracker, workspace },
    );
    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.value).toContain("a.ts");
      expect(result.value).toContain("b.ts");
    }
    expect(readTracker.wasRead("a.ts")).toBe(true);
    expect(readTracker.wasRead("b.ts")).toBe(true);
  });
});

describe("find_references", () => {
  it("encontra ocorrências do símbolo", async () => {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "uso.ts"), "foo();\nconst x = foo;\n");
    const workspace = await Workspace.create(root);
    const result = await findReferencesTool.execute({ symbol: "foo" }, { workspace });
    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.value).toMatch(/uso\.ts:1:/);
      expect(result.value).toMatch(/uso\.ts:2:/);
    }
  });
});

describe("edit_symbol", () => {
  it("substitui função pelo nome após leitura", async () => {
    const codigo = [
      "export function soma(a: number, b: number) {",
      "  return a + b;",
      "}",
      "",
      "export function outra() { return 0; }",
      "",
    ].join("\n");
    await writeFile(join(root, "math.ts"), codigo);
    const workspace = await Workspace.create(root);
    const readTracker = createReadTracker();
    readTracker.markRead("math.ts");
    const result = await editSymbolTool.execute(
      {
        newBody: "export function soma(a: number, b: number) {\n  return a + b + 1;\n}",
        path: "math.ts",
        symbol: "soma",
      },
      { readTracker, workspace },
    );
    expect(result.type).toBe("text");
    const { readFile } = await import("node:fs/promises");
    const texto = await readFile(join(root, "math.ts"), "utf8");
    expect(texto).toContain("a + b + 1");
    expect(texto).toContain("function outra");
  });
});

describe("todo_list", () => {
  it("adiciona e lista itens", async () => {
    const workspace = await Workspace.create(root);
    const add = await todoListTool.execute({ action: "add", text: "Rodar testes" }, { workspace });
    expect(add.type).toBe("text");
    const list = await todoListTool.execute({ action: "list" }, { workspace });
    expect(list.type).toBe("text");
    if (list.type === "text") {
      expect(list.value).toContain("Rodar testes");
    }
  });
});

describe("http_request allowlist", () => {
  it("rejeita host fora da lista", async () => {
    expect(hostPermitido("evil.example.com")).toBe(false);
    expect(hostPermitido("api.github.com")).toBe(true);
    const workspace = await Workspace.create(root);
    const result = await httpRequestTool.execute(
      { url: "https://evil.example.com/x" },
      { workspace },
    );
    expect(result.type).toBe("error-text");
  });
});
