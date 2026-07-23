import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { codeSearchTool } from "../src/tools/code-search.js";
import { Workspace } from "../src/workspace.js";

describe("code_search tool", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-cst-"));
    await mkdir(join(root, "lib"), { recursive: true });
    await writeFile(
      join(root, "lib", "login.ts"),
      "export function loginWithPassword(user: string, pass: string) {\n  return user + pass;\n}\n",
      "utf8",
    );
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("indexa na 1ª busca e encontra trecho", async () => {
    const r = await codeSearchTool.execute({ query: "login password", topK: 3 }, context);
    expect(r.type).toBe("text");
    const texto = (r as { type: "text"; value: string }).value;
    expect(texto.toLowerCase()).toMatch(/login|password/u);
  });

  it("reindex true e topK numérico", async () => {
    const r = await codeSearchTool.execute(
      { query: "loginWithPassword", reindex: true, topK: 2 },
      context,
    );
    expect((r as { value: string }).value.length).toBeGreaterThan(5);
  });

  it("query vazia pede query", async () => {
    const r = await codeSearchTool.execute({ query: "  " }, context);
    expect((r as { value: string }).value).toMatch(/query/iu);
  });

  it("topK inválido usa padrão", async () => {
    const r = await codeSearchTool.execute({ query: "login", topK: Number.NaN }, context);
    expect(r.type).toBe("text");
  });
});
