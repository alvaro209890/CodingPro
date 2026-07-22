import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Provider, ProviderEvent, ToolCall } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AgenteHeadlessIo, executarAgenteHeadless } from "../src/agent-runtime.js";

type Assistant = Extract<ProviderEvent, { type: "finish" }>["message"];

function finish(message: Assistant): ProviderEvent {
  return {
    message,
    reason: message.toolCalls === undefined ? "stop" : "tool-calls",
    type: "finish",
  };
}

function scripted(turns: readonly (readonly ProviderEvent[])[], model = "fake"): Provider {
  let index = 0;
  return {
    capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
    id: "fake",
    model,
    async *stream(_request, options) {
      options?.signal?.throwIfAborted();
      const turn = turns[index];
      index += 1;
      if (turn === undefined) {
        throw new Error("roteiro sem turno");
      }
      for (const event of turn) {
        yield event;
      }
    },
  };
}

describe("executarAgenteHeadless", () => {
  let cwd: string;
  let saida: string;
  let progresso: string;
  let io: AgenteHeadlessIo;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "codingpro-cli-"));
    saida = "";
    progresso = "";
    io = {
      progresso: (texto) => {
        progresso += texto;
      },
      saida: (texto) => {
        saida += texto;
      },
    };
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  it("transmite a resposta de texto para stdout com quebra final", async () => {
    const provider = scripted([
      [{ text: "Olá!", type: "text-delta" }, finish({ content: "Olá!", role: "assistant" })],
    ]);
    await executarAgenteHeadless({ cwd, prompt: "oi", provider }, io);
    expect(saida).toBe("Olá!\n");
    expect(progresso).toBe("");
  });

  it("executa ferramenta de leitura e reporta progresso no stderr", async () => {
    await writeFile(join(cwd, "a.txt"), "conteúdo");
    const call: ToolCall = { id: "c1", input: { path: "a.txt" }, name: "read_file" };
    const provider = scripted([
      [{ call, type: "tool-call" }, finish({ content: "", role: "assistant", toolCalls: [call] })],
      [
        { text: "o arquivo tem conteúdo", type: "text-delta" },
        finish({ content: "o arquivo tem conteúdo", role: "assistant" }),
      ],
    ]);
    await executarAgenteHeadless({ cwd, prompt: "leia a.txt", provider }, io);
    expect(saida).toContain("o arquivo tem conteúdo");
    expect(progresso).toContain("· Lendo a.txt");
    expect(progresso).toContain("✓");
  });

  it("imprime o custo quando o modelo tem tabela de preço", async () => {
    const provider = scripted(
      [
        [
          {
            message: { content: "ok", role: "assistant" },
            reason: "stop",
            type: "finish",
            usage: { inputTokens: 1_000, outputTokens: 100 },
          },
        ],
      ],
      "deepseek-v4-pro",
    );
    await executarAgenteHeadless({ cwd, prompt: "oi", provider }, io);
    expect(progresso).toContain("Custo:");
  });

  it("aborta antes de rodar quando o sinal já está abortado", async () => {
    const provider = scripted([[finish({ content: "x", role: "assistant" })]]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      executarAgenteHeadless({ cwd, prompt: "oi", provider, signal: controller.signal }, io),
    ).rejects.toThrow();
  });
});
