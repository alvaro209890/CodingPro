import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadReplayProvider,
  ProviderError,
  ReplayProvider,
  type ChatRequest,
  type ProviderEvent,
  type ReplayTurn,
} from "../src/index.js";

const request: ChatRequest = { messages: [{ content: "olá", role: "user" }] };
const events: ProviderEvent[] = [
  { text: "pensando", type: "reasoning-delta" },
  { text: "Olá!", type: "text-delta" },
  {
    message: { content: "Olá!", reasoning: "pensando", role: "assistant" },
    reason: "stop",
    type: "finish",
    usage: { cacheReadInputTokens: 1, inputTokens: 2, outputTokens: 3, reasoningTokens: 1 },
  },
];

async function collect(provider: ReplayProvider, chatRequest = request): Promise<ProviderEvent[]> {
  const result: ProviderEvent[] = [];
  for await (const event of provider.stream(chatRequest)) {
    result.push(event);
  }
  return result;
}

describe("ReplayProvider", () => {
  it("reproduz eventos na ordem e expõe capabilities conservadoras", async () => {
    const provider = new ReplayProvider([{ events, request }]);

    await expect(collect(provider)).resolves.toEqual(events);
    expect(provider.id).toBe("replay");
    expect(provider.model).toBe("fixture");
    expect(provider.capabilities).toEqual({
      cacheUsage: false,
      reasoning: "toggle",
      streaming: true,
      tools: false,
    });
  });

  it("falha fechado em divergência sem consumir o turno", async () => {
    const provider = new ReplayProvider([{ events, request }]);

    await expect(
      collect(provider, { messages: [{ content: "diferente", role: "user" }] }),
    ).rejects.toMatchObject({ code: "replay-mismatch" });
    await expect(collect(provider)).resolves.toEqual(events);
  });

  it("rejeita chamada além dos turnos gravados", async () => {
    const provider = new ReplayProvider([{ events, request }]);
    await collect(provider);

    await expect(collect(provider)).rejects.toMatchObject({ code: "replay-exhausted" });
  });

  it("rejeita fixture em memória sem finish terminal", () => {
    expect(
      () => new ReplayProvider([{ events: [{ text: "incompleto", type: "text-delta" }], request }]),
    ).toThrowError(ProviderError);
    expect(
      () => new ReplayProvider([{ events: [events[2], events[1]], request } as ReplayTurn]),
    ).toThrowError(ProviderError);
  });

  it("respeita cancelamento antes e durante o stream", async () => {
    const before = new AbortController();
    before.abort();
    const providerBefore = new ReplayProvider([{ events, request }]);
    await expect(async () => {
      for await (const _event of providerBefore.stream(request, { signal: before.signal })) {
        // não deve produzir eventos
      }
    }).rejects.toMatchObject({ name: "AbortError" });

    const during = new AbortController();
    const iterator = new ReplayProvider([{ events, request }])
      .stream(request, {
        signal: during.signal,
      })
      [Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: events[0] });
    during.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("loadReplayProvider", () => {
  it("carrega JSONL com linhas vazias e CRLF", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-replay-á-"));
    const path = join(directory, "fixture com espaço.jsonl");
    try {
      await writeFile(path, `\r\n${JSON.stringify({ events, request })}\r\n`, "utf8");
      const provider = await loadReplayProvider(path);

      await expect(collect(provider)).resolves.toEqual(events);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it.each([
    { content: "{inválido", message: "linha 1" },
    { content: JSON.stringify({ events: [], request }), message: "linha 1" },
    {
      content: JSON.stringify({
        events: [
          {
            message: { content: "", role: "assistant" },
            reason: "stop",
            type: "finish",
            usage: { inputTokens: -1, outputTokens: 0 },
          },
        ],
        request,
      }),
      message: "linha 1",
    },
    { content: "\n\r\n", message: "vazia" },
  ])("rejeita fixture inválida: $message", async ({ content, message }) => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-replay-invalid-"));
    const path = join(directory, "fixture.jsonl");
    try {
      await writeFile(path, content, "utf8");

      await expect(loadReplayProvider(path)).rejects.toMatchObject({
        code: "invalid-fixture",
        safeMessage: expect.stringContaining(message),
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("sanitiza erro de arquivo ausente", async () => {
    await expect(loadReplayProvider("/caminho/que/não/existe.jsonl")).rejects.toMatchObject({
      code: "invalid-fixture",
      safeMessage: "Não foi possível ler a fixture de replay.",
    });
  });

  it("respeita cancelamento antes de ler o arquivo", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      loadReplayProvider("/fixture/que/não-será-lida", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejeita fixture que não seja arquivo regular", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-replay-directory-"));
    try {
      await expect(loadReplayProvider(directory)).rejects.toMatchObject({
        code: "invalid-fixture",
        safeMessage: "A fixture de replay não é um arquivo regular.",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
