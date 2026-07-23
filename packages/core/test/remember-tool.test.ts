import { join } from "node:path";
import type { ToolResult } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/memory-store.js";
import type { MemoryScope, ToolContext } from "../src/tool.js";
import { rememberTool } from "../src/tools/remember.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

function texto(result: ToolResult): string {
  return (result as { value: string }).value;
}

describe("rememberTool", () => {
  let root: string;
  let scope: MemoryScope;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    scope = {
      global: MemoryStore.create(join(root, "global")),
      projeto: MemoryStore.create(join(root, "projeto")),
    };
    context = { memory: scope, workspace: {} as ToolContext["workspace"] };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("é um efeito de escrita", () => {
    expect(rememberTool.sideEffect).toBe("write");
    expect(rememberTool.definition.name).toBe("remember");
  });

  it("grava no projeto por padrão", async () => {
    const r = await rememberTool.execute({ fato: "Usa pnpm", tipo: "project" }, context);
    expect(texto(r)).toContain("projeto");
    expect(await scope.projeto?.list()).toHaveLength(1);
    expect(await scope.global.list()).toHaveLength(0);
  });

  it("grava no global quando escopo=global", async () => {
    await rememberTool.execute({ escopo: "global", fato: "Prefere pt-BR", tipo: "user" }, context);
    expect(await scope.global.list()).toHaveLength(1);
    expect(await scope.projeto?.list()).toHaveLength(0);
  });

  it("recusa segredo com erro estruturado", async () => {
    const r = await rememberTool.execute(
      { fato: "sk_live_abcdefghij0123456789", tipo: "reference" },
      context,
    );
    expect(r.type).toBe("error-text");
  });

  it("erro quando não há memória no contexto", async () => {
    const semMemoria: ToolContext = { workspace: {} as ToolContext["workspace"] };
    const r = await rememberTool.execute({ fato: "x", tipo: "user" }, semMemoria);
    expect(r.type).toBe("error-text");
  });
});
