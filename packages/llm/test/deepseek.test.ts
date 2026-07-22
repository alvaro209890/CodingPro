import { describe, expect, it, vi } from "vitest";
import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  DeepSeekProvider,
  type DeepSeekProviderOptions,
  type ProviderError,
  type ProviderEvent,
} from "../src/index.js";

type FetchFunction = NonNullable<DeepSeekProviderOptions["fetch"]>;

const request = {
  messages: [
    { content: "Responda em pt-BR.", role: "system" as const },
    { content: "anterior", reasoning: "pensei antes", role: "assistant" as const },
    { content: "olá", role: "user" as const },
  ],
};

function sseResponse(chunks: readonly unknown[]): Response {
  const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { headers: { "content-type": "text/event-stream" }, status: 200 });
}

function streamChunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
  usage: Record<string, unknown> | null = null,
) {
  return {
    choices: [{ delta, finish_reason: finishReason, index: 0 }],
    created: 1,
    id: "fixture",
    model: DEEPSEEK_MODEL,
    usage,
  };
}

function happyResponse(): Response {
  return sseResponse([
    streamChunk({ reasoning_content: "pensando " }),
    streamChunk({ reasoning_content: "com cuidado" }),
    streamChunk({ content: "Olá, " }),
    streamChunk({ content: "mundo!" }),
    streamChunk({}, "stop"),
    {
      choices: [],
      created: 1,
      id: "fixture",
      model: DEEPSEEK_MODEL,
      usage: {
        completion_tokens: 9,
        completion_tokens_details: { reasoning_tokens: 4 },
        prompt_cache_hit_tokens: 12,
        prompt_cache_miss_tokens: 5,
        prompt_tokens: 17,
        total_tokens: 26,
      },
    },
  ]);
}

function fragmentedSseResponse(): Response {
  const chunks = [
    streamChunk({ content: "Olá" }),
    streamChunk({}, "stop"),
    { choices: [], usage: { completion_tokens: 2, prompt_tokens: 1 } },
  ];
  const encoded = new TextEncoder().encode(
    `: ping\r\n${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join("")}data: [DONE]\r\n\r\n`,
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < encoded.length; index += 3) {
        controller.enqueue(encoded.slice(index, index + 3));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
}

async function collect(provider: DeepSeekProvider, signal?: AbortSignal): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of provider.stream(
    request,
    signal === undefined ? undefined : { signal },
  )) {
    events.push(event);
  }
  return events;
}

describe("DeepSeekProvider", () => {
  it("mapeia request, reasoning, texto, finish e uso de cache sem rede externa", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedHeaders: Headers | undefined;
    let capturedRedirect: RequestRedirect | undefined;
    const fetchMock: FetchFunction = async (input, init) => {
      expect(input.toString()).toBe(`${DEEPSEEK_BASE_URL}/chat/completions`);
      expect(init?.method).toBe("POST");
      capturedHeaders = new Headers(init?.headers);
      capturedRedirect = init?.redirect;
      capturedBody = JSON.parse(String(init?.body));
      return happyResponse();
    };
    const provider = new DeepSeekProvider({ apiKey: "chave-sintetica", fetch: fetchMock });

    const events = await collect(provider);

    expect(provider.id).toBe("deepseek");
    expect(provider.model).toBe(DEEPSEEK_MODEL);
    expect(provider.capabilities).toEqual({
      cacheUsage: true,
      reasoning: "effort",
      streaming: true,
      tools: false,
    });
    expect(capturedHeaders?.get("authorization")).toBe("Bearer chave-sintetica");
    expect(capturedRedirect).toBe("error");
    expect(capturedBody).toMatchObject({
      messages: [
        { content: "Responda em pt-BR.", role: "system" },
        { content: "anterior", reasoning_content: "pensei antes", role: "assistant" },
        { content: "olá", role: "user" },
      ],
      model: DEEPSEEK_MODEL,
      reasoning_effort: "high",
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: "enabled" },
    });
    expect(capturedBody).not.toHaveProperty("budget_tokens");
    expect(capturedBody).not.toHaveProperty("tools");
    expect(events).toEqual([
      { text: "pensando ", type: "reasoning-delta" },
      { text: "com cuidado", type: "reasoning-delta" },
      { text: "Olá, ", type: "text-delta" },
      { text: "mundo!", type: "text-delta" },
      {
        message: {
          content: "Olá, mundo!",
          reasoning: "pensando com cuidado",
          role: "assistant",
        },
        reason: "stop",
        type: "finish",
        usage: {
          cacheReadInputTokens: 12,
          inputTokens: 17,
          outputTokens: 9,
          reasoningTokens: 4,
        },
      },
    ]);
  });

  it("desliga thinking sem enviar effort", async () => {
    let body: Record<string, unknown> | undefined;
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return happyResponse();
      },
      thinking: false,
    });

    await collect(provider);

    expect(body).toMatchObject({ thinking: { type: "disabled" } });
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("aceita SSE CRLF, keepalive, UTF-8 e JSON fragmentados entre chunks", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () => fragmentedSseResponse(),
    });

    const events = await collect(provider);

    expect(events).toContainEqual({ text: "Olá", type: "text-delta" });
    expect(events.at(-1)).toMatchObject({
      message: { content: "Olá", role: "assistant" },
      reason: "stop",
      type: "finish",
    });
  });

  it.each([
    { options: { apiKey: "" }, message: "chave" },
    { options: { apiKey: "chave\nmaliciosa" }, message: "chave" },
    { options: { apiKey: "ok", maxOutputTokens: 0 }, message: "maxOutputTokens" },
    { options: { apiKey: "ok", chunkTimeoutMs: 1.5 }, message: "chunkTimeoutMs" },
  ] satisfies Array<{ options: DeepSeekProviderOptions; message: string }>)(
    "rejeita configuração inválida: $message",
    ({ options, message }) => {
      expect(() => new DeepSeekProvider(options)).toThrowError(
        expect.objectContaining({
          code: "not-configured",
          safeMessage: expect.stringContaining(message),
        }),
      );
    },
  );

  it.each([
    { retryable: false, safeMessage: "rejeitou", status: 400 },
    { retryable: false, safeMessage: "autenticação", status: 401 },
    { retryable: false, safeMessage: "saldo", status: 402 },
    { retryable: true, safeMessage: "limitou", status: 429 },
    { retryable: true, safeMessage: "indisponível", status: 503 },
  ])("sanitiza HTTP $status sem retry implícito", async ({ retryable, safeMessage, status }) => {
    const canary = "segredo-http-nao-pode-vazar";
    let requests = 0;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = new DeepSeekProvider({
      apiKey: `chave-${canary}`,
      fetch: async () => {
        requests += 1;
        return Response.json(
          { error: { code: "fixture", message: canary, type: "fixture" } },
          { status },
        );
      },
    });

    let failure: unknown;
    try {
      await collect(provider);
    } catch (error) {
      failure = error;
    } finally {
      consoleSpy.mockRestore();
    }

    expect(requests).toBe(1);
    expect(failure).toMatchObject({
      code: "provider-failed",
      retryable,
      safeMessage: expect.stringContaining(safeMessage),
    });
    expect(String((failure as ProviderError).safeMessage)).not.toContain(canary);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("respeita AbortSignal antes e durante a chamada", async () => {
    let requests = 0;
    const fetchMock: FetchFunction = async (_input, init) => {
      requests += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    };
    const provider = new DeepSeekProvider({ apiKey: "chave-sintetica", fetch: fetchMock });
    const before = new AbortController();
    before.abort();
    await expect(collect(provider, before.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(requests).toBe(0);

    const during = new AbortController();
    const execution = collect(provider, during.signal);
    await vi.waitFor(() => expect(requests).toBe(1));
    during.abort();
    await expect(execution).rejects.toMatchObject({ name: "AbortError" });
  });

  it("classifica timeout total como falha transitória e segura", async () => {
    const canary = "segredo-timeout-nao-pode-vazar";
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      chunkTimeoutMs: 1_000,
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException(canary, "TimeoutError")),
            { once: true },
          );
        }),
      totalTimeoutMs: 10,
    });

    await expect(collect(provider)).rejects.toMatchObject({
      code: "provider-failed",
      retryable: true,
      safeMessage: expect.not.stringContaining(canary),
    });
  });

  it("classifica stall entre chunks como falha transitória", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      chunkTimeoutMs: 10,
      fetch: async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify(streamChunk({ content: "parcial" }))}\n\n`,
                ),
              );
              init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), {
                once: true,
              });
            },
          }),
          {
            headers: { "content-type": "text/event-stream" },
          },
        ),
      totalTimeoutMs: 1_000,
    });

    await expect(collect(provider)).rejects.toMatchObject({
      code: "provider-failed",
      retryable: true,
      safeMessage: expect.stringContaining("tempo limite"),
    });
  });

  it("rejeita SSE malformado sem vazar o conteúdo", async () => {
    const canary = "segredo-sse-nao-pode-vazar";
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        new Response(`data: {"${canary}":\n\ndata: [DONE]\n\n`, {
          headers: { "content-type": "text/event-stream" },
        }),
    });

    await expect(collect(provider)).rejects.toMatchObject({
      code: "provider-failed",
      safeMessage: expect.not.stringContaining(canary),
    });
  });

  it("sanitiza falha de transporte e a marca como transitória", async () => {
    const canary = "segredo-transporte-nao-pode-vazar";
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () => {
        throw new TypeError(canary);
      },
    });

    await expect(collect(provider)).rejects.toMatchObject({
      code: "provider-failed",
      retryable: true,
      safeMessage: expect.not.stringContaining(canary),
    });
  });

  it("omite usage realmente ausente e mapeia finish desconhecido", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () => sseResponse([streamChunk({ content: "ok" }), streamChunk({}, "novo")]),
    });

    const events = await collect(provider);

    expect(events.at(-1)).toEqual({
      message: { content: "ok", role: "assistant" },
      reason: "unknown",
      type: "finish",
    });
  });

  it("rejeita uso inválido e indisponibilidade terminal", async () => {
    const invalidUsage = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({ content: "parcial" }),
          streamChunk({}, "stop"),
          {
            choices: [],
            usage: { completion_tokens: 1, prompt_cache_hit_tokens: 8, prompt_tokens: 4 },
          },
        ]),
    });
    await expect(collect(invalidUsage)).rejects.toMatchObject({ code: "invalid-response" });

    const negativeUsage = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({}, "stop"),
          { choices: [], usage: { completion_tokens: 1, prompt_tokens: -1 } },
        ]),
    });
    await expect(collect(negativeUsage)).rejects.toMatchObject({ code: "invalid-response" });

    const excessiveReasoning = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({}, "stop"),
          {
            choices: [],
            usage: {
              completion_tokens: 1,
              completion_tokens_details: { reasoning_tokens: 2 },
              prompt_tokens: 1,
            },
          },
        ]),
    });
    await expect(collect(excessiveReasoning)).rejects.toMatchObject({
      code: "invalid-response",
    });

    const unavailable = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () => sseResponse([streamChunk({}, "insufficient_system_resource")]),
    });
    await expect(collect(unavailable)).rejects.toMatchObject({
      code: "provider-failed",
      retryable: true,
    });
  });

  it("falha fechado diante de tool call inesperada", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({
            tool_calls: [
              {
                function: { arguments: "{}", name: "perigosa" },
                id: "call-1",
                index: 0,
              },
            ],
          }),
          streamChunk({}, "tool_calls"),
        ]),
    });

    await expect(collect(provider)).rejects.toMatchObject({ code: "invalid-response" });
  });
});
