import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Provider, ProviderEvent } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENTE_EXPLORER, AGENTE_WORKER } from "../src/agent-types.js";
import { executarSubagente, orquestrarSubagentes } from "../src/subagent.js";
import { grepTool } from "../src/tools/grep.js";
import { listDirTool } from "../src/tools/list-dir.js";
import { readFileTool } from "../src/tools/read-file.js";
import { repoMapTool } from "../src/tools/repo-map.js";
import { writeFileTool } from "../src/tools/write-file.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

/** Provider que ecoa o último conteúdo do usuário — determinístico sob paralelismo. */
function echoProvider(): { provider: Provider; systems: string[] } {
  const systems: string[] = [];
  return {
    provider: {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(request): AsyncGenerator<ProviderEvent> {
        const sys = request.messages.find((m) => m.role === "system");
        if (sys?.role === "system") {
          systems.push(sys.content);
        }
        const ultimoUser = [...request.messages].reverse().find((m) => m.role === "user");
        const conteudo = ultimoUser?.role === "user" ? `ok:${ultimoUser.content}` : "ok";
        yield { text: conteudo, type: "text-delta" };
        yield { message: { content: conteudo, role: "assistant" }, reason: "stop", type: "finish" };
      },
    },
    systems,
  };
}

/** Provider que pede um `write_file` no 1º turno e encerra no 2º. */
function escritorProvider(): { provider: Provider } {
  let turno = 0;
  return {
    provider: {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(): AsyncGenerator<ProviderEvent> {
        turno += 1;
        if (turno === 1) {
          yield {
            message: {
              content: "",
              role: "assistant",
              toolCalls: [
                {
                  id: "c1",
                  input: { content: "oi", path: "novo.txt" },
                  name: "write_file",
                },
              ],
            },
            reason: "tool-calls",
            type: "finish",
          };
          return;
        }
        yield { text: "pronto", type: "text-delta" };
        yield { message: { content: "pronto", role: "assistant" }, reason: "stop", type: "finish" };
      },
    },
  };
}

const POOL = [readFileTool, listDirTool, grepTool, repoMapTool, writeFileTool];

describe("executarSubagente", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await makeTmpRoot();
    workspace = await Workspace.create(root);
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("roda com o system prompt do tipo e devolve o relatório", async () => {
    const { provider, systems } = echoProvider();
    const rel = await executarSubagente({
      context: { workspace },
      prompt: "ache o arquivo X",
      provider,
      tipo: AGENTE_EXPLORER,
      toolPool: POOL,
    });
    expect(rel.tipo).toBe("explorer");
    expect(rel.texto).toBe("ok:ache o arquivo X");
    expect(rel.interrompido).toBe(false);
    expect(systems[0]).toContain("subagente explorador");
  });

  it("restringe as tools às do tipo (worker inclui edit_file; explorer não)", () => {
    expect(AGENTE_WORKER.tools).toContain("edit_file");
    expect(AGENTE_EXPLORER.tools).not.toContain("edit_file");
  });

  it("interrupção por signal já abortado vira relatório parcial", async () => {
    const { provider } = echoProvider();
    const rel = await executarSubagente({
      context: { workspace },
      prompt: "algo",
      provider,
      signal: AbortSignal.abort(),
      tipo: AGENTE_EXPLORER,
      toolPool: POOL,
    });
    expect(rel.interrompido).toBe(true);
    await expect(readFile(join(root, "algo.txt"), "utf8")).rejects.toThrow();
  });

  it("timeout interrompe um provider que trava", async () => {
    const hanging: Provider = {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(_request, options): AsyncGenerator<ProviderEvent> {
        await new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(options.signal?.reason ?? new Error("abortado")),
          );
        });
        yield { message: { content: "x", role: "assistant" }, reason: "stop", type: "finish" };
      },
    };
    const rel = await executarSubagente({
      context: { workspace },
      prompt: "trava",
      provider: hanging,
      timeoutMs: 20,
      tipo: AGENTE_EXPLORER,
      toolPool: POOL,
    });
    expect(rel.interrompido).toBe(true);
    expect(rel.motivo).toBe("timeout");
    // O relatório precisa dizer que estourou o tempo: antes voltava vazio e parecia
    // que o subagente simplesmente não tinha funcionado.
    expect(rel.texto).toContain("tempo esgotado");
  });

  it("falha do provider vira relatório com a causa, sem derrubar o chamador", async () => {
    const quebrado: Provider = {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      // biome-ignore lint/correctness/useYield: provider que só falha
      async *stream(): AsyncGenerator<ProviderEvent> {
        throw new Error("saldo insuficiente");
      },
    };
    const rel = await executarSubagente({
      context: { workspace },
      prompt: "algo",
      provider: quebrado,
      tipo: AGENTE_EXPLORER,
      toolPool: POOL,
    });
    expect(rel.motivo).toBe("erro");
    expect(rel.texto).toContain("saldo insuficiente");
  });

  it("sem aprovador, o worker não consegue escrever (fail-closed)", async () => {
    const { provider } = escritorProvider();
    const rel = await executarSubagente({
      context: { workspace },
      prompt: "cria o arquivo",
      provider,
      tipo: AGENTE_WORKER,
      toolPool: POOL,
    });
    expect(rel.interrompido).toBe(false);
    await expect(readFile(join(root, "novo.txt"), "utf8")).rejects.toThrow();
  });

  it("com aprovador do runtime pai, o worker escreve de verdade", async () => {
    const { provider } = escritorProvider();
    const rel = await executarSubagente({
      approver: {
        async request() {
          return "approve-once" as const;
        },
      },
      context: { workspace },
      prompt: "cria o arquivo",
      provider,
      tipo: AGENTE_WORKER,
      toolPool: POOL,
    });
    expect(rel.interrompido).toBe(false);
    await expect(readFile(join(root, "novo.txt"), "utf8")).resolves.toBe("oi");
  });

  it("cancelamento pelo signal-pai durante a execução vira parcial", async () => {
    const controller = new AbortController();
    const hanging: Provider = {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(_request, options): AsyncGenerator<ProviderEvent> {
        await new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(options.signal?.reason ?? new Error("abortado")),
          );
        });
        yield { message: { content: "x", role: "assistant" }, reason: "stop", type: "finish" };
      },
    };
    setTimeout(() => controller.abort(new Error("cancelado")), 15);
    const rel = await executarSubagente({
      context: { workspace },
      prompt: "trava",
      provider: hanging,
      signal: controller.signal,
      tipo: AGENTE_EXPLORER,
      toolPool: POOL,
    });
    expect(rel.interrompido).toBe(true);
  });
});

describe("orquestrarSubagentes", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await makeTmpRoot();
    workspace = await Workspace.create(root);
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("roda várias tarefas em paralelo preservando a ordem de entrada", async () => {
    const { provider } = echoProvider();
    const relatorios = await orquestrarSubagentes(
      [
        { prompt: "t1", tipo: AGENTE_EXPLORER },
        { prompt: "t2", tipo: AGENTE_EXPLORER },
        { prompt: "t3", tipo: AGENTE_EXPLORER },
      ],
      { context: { workspace }, provider, toolPool: POOL },
      2,
    );
    expect(relatorios.map((r) => r.texto)).toEqual(["ok:t1", "ok:t2", "ok:t3"]);
  });
});
