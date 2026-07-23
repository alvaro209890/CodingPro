import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolResult } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { repoMapTool } from "../src/tools/repo-map.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

function texto(result: ToolResult): string {
  expect(result.type).toBe("text");
  return (result as { value: string }).value;
}

describe("repoMapTool", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("é uma tool de leitura", () => {
    expect(repoMapTool.sideEffect).toBe("read");
    expect(repoMapTool.definition.name).toBe("repo_map");
  });

  it("devolve texto com as assinaturas do projeto", async () => {
    await writeFile(join(root, "a.ts"), "export function alfa() {}");
    const result = await repoMapTool.execute({}, context);
    expect(texto(result)).toContain("fn alfa");
  });

  it("aceita foco e maxTokens sem quebrar", async () => {
    await writeFile(join(root, "a.ts"), "export function alfa() {}");
    await writeFile(join(root, "b.ts"), "export function beta() {}");
    const result = await repoMapTool.execute({ foco: ["b.ts"], maxTokens: 500 }, context);
    expect(texto(result)).toContain("beta");
  });

  it("ignora foco vazio ou de tipo inesperado", async () => {
    await writeFile(join(root, "a.ts"), "export function alfa() {}");
    expect(texto(await repoMapTool.execute({ foco: [] }, context))).toContain("fn alfa");
    expect(texto(await repoMapTool.execute({ foco: "nao-lista" }, context))).toContain("fn alfa");
  });

  it("acrescenta rodapé quando o mapa é truncado", async () => {
    for (let i = 0; i < 30; i += 1) {
      await writeFile(join(root, `f${i}.ts`), `export function funcaoDeNomeBemLongo${i}() {}`);
    }
    const result = await repoMapTool.execute({ maxTokens: 15 }, context);
    expect(texto(result)).toContain("mapa truncado");
  });
});
