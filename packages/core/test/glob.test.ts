import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { globParaRegex, globTool } from "../src/tools/glob.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

interface GlobValue {
  readonly files: readonly string[];
  readonly pattern: string;
  readonly truncated: boolean;
}

function value(result: { type: string; value?: unknown }): GlobValue {
  expect(result.type).toBe("json");
  return result.value as GlobValue;
}

describe("globParaRegex", () => {
  it("converte glob simples para regex ancorada em caminhos com barra", () => {
    const ts = globParaRegex("src/**/*.ts");
    expect(ts.test("src/index.ts")).toBe(true);
    expect(ts.test("src/lib/util.ts")).toBe(true);
    expect(ts.test("src/lib/util.tsx")).toBe(false);
    expect(ts.test("out/src/lib/util.ts")).toBe(false);

    const oneChar = globParaRegex("docs/?.md");
    expect(oneChar.test("docs/a.md")).toBe(true);
    expect(oneChar.test("docs/ab.md")).toBe(false);
  });
});

describe("glob", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("busca arquivos por padrão relativo à raiz e ignora diretórios ruidosos", async () => {
    await mkdir(join(root, "src", "lib"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export {};\n");
    await writeFile(join(root, "src", "lib", "util.ts"), "export {};\n");
    await writeFile(join(root, "src", "lib", "view.tsx"), "export default null;\n");
    await writeFile(join(root, "node_modules", "pkg", "ignored.ts"), "ignored\n");

    const result = value(await globTool.execute({ pattern: "**/*.ts" }, context));

    expect(result).toEqual({
      files: ["src/index.ts", "src/lib/util.ts"],
      pattern: "**/*.ts",
      truncated: false,
    });
  });

  it("aceita subpasta de partida sem permitir escapar do workspace", async () => {
    await mkdir(join(root, "app", "routes"), { recursive: true });
    await mkdir(join(root, "other"), { recursive: true });
    await writeFile(join(root, "app", "routes", "home.ts"), "export {};\n");
    await writeFile(join(root, "other", "skip.ts"), "export {};\n");

    const result = value(await globTool.execute({ path: "app", pattern: "app/**/*.ts" }, context));

    expect(result.files).toEqual(["app/routes/home.ts"]);
    await expect(globTool.execute({ path: "../fora", pattern: "**/*" }, context)).rejects.toThrow();
  });
});
