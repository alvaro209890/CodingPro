import { ProviderError, type Provider, type ProviderEvent } from "@codingpro/llm";
import { describe, expect, it } from "vitest";
import { executarPromptHeadless } from "../src/headless.js";

function providerFrom(events: readonly ProviderEvent[]): Provider {
  return {
    capabilities: { cacheUsage: false, reasoning: "none", streaming: true, tools: false },
    id: "fake",
    model: "fake",
    async *stream() {
      yield* events;
    },
  };
}

describe("executarPromptHeadless", () => {
  it("escreve deltas ao vivo, oculta reasoning e adiciona uma newline", async () => {
    let release: (() => void) | undefined;
    let firstDeltaReceived: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstDelta = new Promise<void>((resolve) => {
      firstDeltaReceived = resolve;
    });
    const provider: Provider = {
      capabilities: { cacheUsage: false, reasoning: "none", streaming: true, tools: false },
      id: "controlled",
      model: "controlled",
      async *stream() {
        yield { text: "segredo do raciocínio", type: "reasoning-delta" };
        yield { text: "Olá", type: "text-delta" };
        await barrier;
        yield { text: "!", type: "text-delta" };
        yield {
          message: { content: "Olá!", role: "assistant" },
          reason: "stop",
          type: "finish",
        };
      },
    };
    const output: string[] = [];

    const execution = executarPromptHeadless("olá", provider, (text) => {
      output.push(text);
      firstDeltaReceived?.();
    });
    await firstDelta;
    expect(output.join("")).toBe("Olá");
    release?.();
    await execution;

    expect(output.join("")).toBe("Olá!\n");
    expect(output.join("")).not.toContain("raciocínio");
  });

  it("não duplica newline existente", async () => {
    const output: string[] = [];
    await executarPromptHeadless(
      "olá",
      providerFrom([
        { text: "Olá!\n", type: "text-delta" },
        {
          message: { content: "Olá!\n", role: "assistant" },
          reason: "stop",
          type: "finish",
        },
      ]),
      (text) => output.push(text),
    );

    expect(output.join("")).toBe("Olá!\n");
  });

  it.each([
    {
      events: [{ text: "sem finish", type: "text-delta" }] satisfies ProviderEvent[],
      message: "sem finalizar",
    },
    {
      events: [
        { text: "parcial", type: "text-delta" },
        {
          message: { content: "diferente", role: "assistant" },
          reason: "stop",
          type: "finish",
        },
      ] satisfies ProviderEvent[],
      message: "inconsistente",
    },
    {
      events: [
        { message: { content: "", role: "assistant" }, reason: "stop", type: "finish" },
        { text: "depois", type: "text-delta" },
      ] satisfies ProviderEvent[],
      message: "após finalizar",
    },
  ])("rejeita protocolo inválido: $message", async ({ events, message }) => {
    await expect(
      executarPromptHeadless("olá", providerFrom(events), () => {}),
    ).rejects.toMatchObject({
      code: "invalid-response",
      safeMessage: expect.stringContaining(message),
    });
  });

  it("mantém saída parcial e propaga falha tipada", async () => {
    const failure = new ProviderError("invalid-response", "falha segura");
    const provider: Provider = {
      ...providerFrom([]),
      async *stream() {
        yield { text: "parcial", type: "text-delta" };
        throw failure;
      },
    };
    const output: string[] = [];

    await expect(executarPromptHeadless("olá", provider, (text) => output.push(text))).rejects.toBe(
      failure,
    );
    expect(output.join("")).toBe("parcial");
  });
});
