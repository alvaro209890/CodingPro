import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Workspace } from "@codingpro/core";
import type { Provider, ProviderEvent } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carregarTiposCustom, criarSpawnerSubagentes } from "../src/subagent-runtime.js";

function echoProvider(): Provider {
  return {
    capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
    id: "fake",
    model: "fake",
    async *stream(request): AsyncGenerator<ProviderEvent> {
      const u = [...request.messages].reverse().find((m) => m.role === "user");
      const c = u?.role === "user" ? `ok:${u.content}` : "ok";
      yield { text: c, type: "text-delta" };
      yield { message: { content: c, role: "assistant" }, reason: "stop", type: "finish" };
    },
  };
}

describe("subagent-runtime", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-sub-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("carrega tipos custom de .codingpro/agents e ignora inválidos", async () => {
    const dir = join(root, "agents");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "tester.md"),
      "---\nrole: fast\ntools: read_file\n---\nVocê testa.",
      "utf8",
    );
    await writeFile(join(dir, "quebrado.md"), "sem frontmatter", "utf8");
    const tipos = await carregarTiposCustom(dir);
    expect(Object.keys(tipos)).toEqual(["tester"]);
    expect(tipos.tester?.role).toBe("fast");
  });

  it("diretório ausente devolve nenhum tipo custom", async () => {
    expect(await carregarTiposCustom(join(root, "nao-existe"))).toEqual({});
  });

  it("o spawner expõe os tipos padrão + custom e executa um subagente", async () => {
    const workspace = await Workspace.create(root);
    const spawner = criarSpawnerSubagentes({
      custom: {
        tester: { descricao: "t", nome: "tester", role: "fast", systemPrompt: "P", tools: [] },
      },
      provider: echoProvider(),
      workspace,
    });
    expect(spawner.tiposDisponiveis).toContain("architect");
    expect(spawner.tiposDisponiveis).toContain("tester");
    const rel = await spawner.executar("explorer", "olhe o projeto");
    expect(rel.texto).toBe("ok:olhe o projeto");
    await expect(spawner.executar("inexistente", "x")).rejects.toThrow();
  });
});
