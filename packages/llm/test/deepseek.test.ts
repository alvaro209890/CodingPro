import { describe, expect, it, vi } from "vitest";
import {
  type ChatRequest,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  DEEPSEEK_MODEL_FLASH,
  DEEPSEEK_MODEL_PRO,
  DEEPSEEK_MODELS,
  DeepSeekProvider,
  type DeepSeekProviderOptions,
  type ProviderError,
  type ProviderEvent,
  type Tool,
} from "../src/index.js";

type FetchFunction = NonNullable<DeepSeekProviderOptions["fetch"]>;

const request = {
  messages: [
    { content: "Responda em pt-BR.", role: "system" as const },
    { content: "anterior", reasoning: "pensei antes", role: "assistant" as const },
    { content: "olá", role: "user" as const },
  ],
};

const somar: Tool = {
  description: "Soma dois números inteiros.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      a: { type: "integer" },
      b: { type: "integer" },
    },
    required: ["a", "b"],
    type: "object",
  },
  name: "somar",
};
const subtrair: Tool = { ...somar, description: "Subtrai dois inteiros.", name: "subtrair" };
const TOOL_ARGUMENT_CANARY = "segredo-argumento";

function sseResponse(chunks: readonly unknown[]): Response {
  const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { headers: { "content-type": "text/event-stream" }, status: 200 });
}

function streamChunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
  usage: Record<string, unknown> | null = null,
  model = DEEPSEEK_MODEL,
) {
  return {
    choices: [{ delta, finish_reason: finishReason, index: 0 }],
    created: 1,
    id: "fixture",
    model,
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

async function collect(
  provider: DeepSeekProvider,
  signal?: AbortSignal,
  chatRequest: ChatRequest = request,
): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of provider.stream(
    chatRequest,
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
      tools: true,
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
      reasoning_effort: "max",
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
    {
      options: { apiKey: "ok", model: "deepseek-inventado" as never },
      message: "modelo",
    },
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

  it.each([
    {
      codigo: "conta_nao_aprovada",
      mensagem: "Sua conta ainda não foi aprovada pelo administrador.",
      status: 403,
    },
    {
      codigo: "creditos_esgotados",
      mensagem: "Seus créditos acabaram. Aguarde o administrador liberar mais.",
      status: 402,
    },
  ])("mostra o bloqueio do CodingPro Cloud: $codigo", async ({ codigo, mensagem, status }) => {
    const provider = new DeepSeekProvider({
      apiKey: "cp_token-sintetico",
      baseUrl: "https://codingpro-api.cursar.space/v1",
      fetch: async () => Response.json({ erro: codigo, mensagem }, { status }),
    });

    await expect(collect(provider)).rejects.toMatchObject({
      code: "provider-failed",
      retryable: false,
      safeMessage: mensagem,
    });
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

  it("cancela durante argumentos fragmentados sem publicar tool call", async () => {
    let bodyStarted = false;
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify(
                    streamChunk({
                      tool_calls: [
                        {
                          function: { arguments: '{"a":', name: "somar" },
                          id: "call_cancelada",
                          index: 0,
                        },
                      ],
                    }),
                  )}\n\n`,
                ),
              );
              bodyStarted = true;
              init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), {
                once: true,
              });
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const controller = new AbortController();
    const observed: ProviderEvent[] = [];
    const execution = (async () => {
      for await (const event of provider.stream(
        { messages: [{ content: "some", role: "user" }], tools: [somar] },
        { signal: controller.signal },
      )) {
        observed.push(event);
      }
    })();
    await vi.waitFor(() => expect(bodyStarted).toBe(true));
    controller.abort();

    await expect(execution).rejects.toMatchObject({ name: "AbortError" });
    expect(observed).not.toContainEqual(expect.objectContaining({ type: "tool-call" }));
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

  it("falha fechado diante de tool call não declarada", async () => {
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

    await expect(collect(provider)).rejects.toMatchObject({ code: "invalid-tool-call" });
  });

  it.each(DEEPSEEK_MODELS)(
    "preserva reasoning e tool call no ciclo multi-turno de %s",
    async (model) => {
      const bodies: Record<string, unknown>[] = [];
      let call = 0;
      const provider = new DeepSeekProvider({
        apiKey: "chave-sintetica",
        fetch: async (_input, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          call += 1;
          if (call === 1) {
            return sseResponse([
              streamChunk({ reasoning_content: "razão " }, null, null, model),
              streamChunk({ reasoning_content: "preservada" }, null, null, model),
              streamChunk(
                {
                  tool_calls: [
                    {
                      function: { arguments: '{"a":', name: "somar" },
                      id: "call_soma_1",
                      index: 0,
                      type: "function",
                    },
                  ],
                },
                null,
                null,
                model,
              ),
              streamChunk(
                { tool_calls: [{ function: { arguments: '19,"b":23}' }, index: 0 }] },
                null,
                null,
                model,
              ),
              streamChunk({}, "tool_calls", null, model),
              {
                choices: [],
                model,
                usage: { completion_tokens: 8, prompt_tokens: 10 },
              },
            ]);
          }
          return sseResponse([
            streamChunk({ reasoning_content: "resultado conferido" }, null, null, model),
            streamChunk({ content: "42" }, null, null, model),
            streamChunk({}, "stop", null, model),
            {
              choices: [],
              model,
              usage: { completion_tokens: 4, prompt_tokens: 20 },
            },
          ]);
        },
        model,
      });
      const prompt = { content: "Some 19 e 23 usando a ferramenta.", role: "user" as const };
      const firstRequest: ChatRequest = {
        messages: [prompt],
        tools: [somar],
      };

      const firstEvents = await collect(provider, undefined, firstRequest);
      const firstFinish = firstEvents.at(-1);
      expect(firstEvents).toContainEqual({
        call: { id: "call_soma_1", input: { a: 19, b: 23 }, name: "somar" },
        type: "tool-call",
      });
      expect(firstFinish).toMatchObject({
        message: {
          content: "",
          reasoning: "razão preservada",
          role: "assistant",
          toolCalls: [{ id: "call_soma_1", input: { a: 19, b: 23 }, name: "somar" }],
        },
        reason: "tool-calls",
        type: "finish",
      });
      if (firstFinish?.type !== "finish") {
        throw new Error("Fixture sem finish.");
      }

      const secondEvents = await collect(provider, undefined, {
        messages: [
          prompt,
          firstFinish.message,
          {
            result: { type: "json", value: { resultado: 42 } },
            role: "tool",
            toolCallId: "call_soma_1",
            toolName: "somar",
          },
        ],
        toolChoice: "none",
        tools: [somar],
      });

      expect(secondEvents.at(-1)).toMatchObject({
        message: { content: "42", reasoning: "resultado conferido", role: "assistant" },
        reason: "stop",
        type: "finish",
      });
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toMatchObject({
        messages: [{ content: prompt.content, role: "user" }],
        model,
        tools: [
          {
            function: {
              description: somar.description,
              name: "somar",
              parameters: somar.inputSchema,
            },
            type: "function",
          },
        ],
      });
      expect(bodies[0]).toMatchObject({ tool_choice: "auto" });
      expect(bodies[1]).toMatchObject({
        messages: [
          { content: prompt.content, role: "user" },
          {
            content: null,
            reasoning_content: "razão preservada",
            role: "assistant",
            tool_calls: [
              {
                function: { arguments: '{"a":19,"b":23}', name: "somar" },
                id: "call_soma_1",
                type: "function",
              },
            ],
          },
          { content: '{"resultado":42}', role: "tool", tool_call_id: "call_soma_1" },
        ],
        model,
        tool_choice: "none",
      });
    },
  );

  it.each([
    {
      delta: {
        tool_calls: [
          {
            function: {
              arguments: `{"a":19,"b":23,"extra":"${TOOL_ARGUMENT_CANARY}"}`,
              name: "somar",
            },
            id: "call_extra",
            index: 0,
          },
        ],
      },
      label: "argumento fora do schema",
    },
    {
      delta: {
        tool_calls: [
          {
            function: { arguments: '{"a":"não-número","b":23}', name: "somar" },
            id: "call_tipo",
            index: 0,
          },
        ],
      },
      label: "tipo incompatível",
    },
    {
      delta: {
        tool_calls: [
          {
            function: { arguments: "{incompleto", name: "somar" },
            id: "call_json",
            index: 0,
          },
        ],
      },
      label: "JSON malformado",
    },
  ])("rejeita $label sem expor argumentos", async ({ delta }) => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () => sseResponse([streamChunk(delta), streamChunk({}, "tool_calls")]),
    });

    await expect(
      collect(provider, undefined, {
        messages: [{ content: "use a tool", role: "user" }],
        tools: [somar],
      }),
    ).rejects.toMatchObject({
      code: "invalid-tool-call",
      safeMessage: expect.not.stringContaining(TOOL_ARGUMENT_CANARY),
    });
  });

  it("rejeita IDs duplicados em chamadas paralelas", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({
            tool_calls: [
              {
                function: { arguments: '{"a":1,"b":2}', name: "somar" },
                id: "call_repetida",
                index: 0,
              },
              {
                function: { arguments: '{"a":3,"b":4}', name: "somar" },
                id: "call_repetida",
                index: 1,
              },
            ],
          }),
          streamChunk({}, "tool_calls"),
        ]),
    });

    await expect(
      collect(provider, undefined, {
        messages: [{ content: "duas somas", role: "user" }],
        tools: [somar],
      }),
    ).rejects.toMatchObject({ code: "invalid-tool-call" });
  });

  it("não publica tool call quando o finish terminal é inconsistente", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({
            tool_calls: [
              {
                function: { arguments: '{"a":1,"b":2}', name: "somar" },
                id: "call_sem_finish",
                index: 0,
              },
            ],
          }),
          streamChunk({}, "stop"),
        ]),
    });
    const observed: ProviderEvent[] = [];
    let failure: unknown;

    try {
      for await (const event of provider.stream({
        messages: [{ content: "some", role: "user" }],
        tools: [somar],
      })) {
        observed.push(event);
      }
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ code: "invalid-response" });
    expect(observed).not.toContainEqual(expect.objectContaining({ type: "tool-call" }));
  });

  it("isola o finish de mutações feitas no evento de tool call", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({
            tool_calls: [
              {
                function: { arguments: '{"a":19,"b":23}', name: "somar" },
                id: "call_isolada",
                index: 0,
              },
            ],
          }),
          streamChunk({}, "tool_calls"),
        ]),
    });
    const iterator = provider
      .stream({ messages: [{ content: "some", role: "user" }], tools: [somar] })
      [Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({ type: "tool-call" });
    if (first.value?.type !== "tool-call") {
      throw new Error("Fixture sem tool call.");
    }
    (first.value.call as { name: string }).name = "alterada";
    (first.value.call.input as { a: number }).a = 999;

    const finish = await iterator.next();
    expect(finish.value).toMatchObject({
      message: {
        toolCalls: [{ id: "call_isolada", input: { a: 19, b: 23 }, name: "somar" }],
      },
      reason: "tool-calls",
      type: "finish",
    });
  });

  it("mantém snapshot do schema durante o stream", async () => {
    const mutableTool = structuredClone(somar) as Tool;
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({ reasoning_content: "validando" }),
          streamChunk({
            tool_calls: [
              {
                function: { arguments: '{"a":19,"b":23}', name: "somar" },
                id: "call_mutacao",
                index: 0,
              },
            ],
          }),
          streamChunk({}, "tool_calls"),
        ]),
    });
    const iterator = provider
      .stream({ messages: [{ content: "some", role: "user" }], tools: [mutableTool] })
      [Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({
      value: { text: "validando", type: "reasoning-delta" },
    });
    (mutableTool.inputSchema.properties as Record<string, { readonly type: string }>).a = {
      type: "string",
    };

    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        call: { id: "call_mutacao", input: { a: 19, b: 23 }, name: "somar" },
        type: "tool-call",
      },
    });
  });

  it("mantém IDs e argumentos separados em calls paralelas intercaladas", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({
            tool_calls: [
              {
                function: { arguments: '{"a":1,', name: "somar" },
                id: "call_primeira",
                index: 0,
              },
              {
                function: { arguments: '{"a":3,', name: "somar" },
                id: "call_segunda",
                index: 1,
              },
            ],
          }),
          streamChunk({
            tool_calls: [
              { function: { arguments: '"b":4}' }, index: 1 },
              { function: { arguments: '"b":2}' }, index: 0 },
            ],
          }),
          streamChunk({}, "tool_calls"),
        ]),
    });

    const events = await collect(provider, undefined, {
      messages: [{ content: "duas somas", role: "user" }],
      tools: [somar],
    });
    const calls = events.filter((event) => event.type === "tool-call").map((event) => event.call);
    expect(calls).toEqual([
      { id: "call_primeira", input: { a: 1, b: 2 }, name: "somar" },
      { id: "call_segunda", input: { a: 3, b: 4 }, name: "somar" },
    ]);
    expect(events.at(-1)).toMatchObject({
      message: { toolCalls: calls },
      reason: "tool-calls",
      type: "finish",
    });
  });

  it("rejeita request inválido antes de acessar a rede", async () => {
    const fetchMock = vi.fn<FetchFunction>();
    const provider = new DeepSeekProvider({ apiKey: "chave-sintetica", fetch: fetchMock });

    await expect(
      collect(provider, undefined, {
        messages: [{ content: "olá", role: "user" }],
        tools: [somar, somar],
      }),
    ).rejects.toMatchObject({ code: "invalid-request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["required", { toolName: "somar" }] as const)(
    "rejeita tool choice forçado no thinking antes da rede: %j",
    async (toolChoice) => {
      const fetchMock = vi.fn<FetchFunction>();
      const provider = new DeepSeekProvider({ apiKey: "chave-sintetica", fetch: fetchMock });

      await expect(
        collect(provider, undefined, {
          messages: [{ content: "some", role: "user" }],
          toolChoice,
          tools: [somar],
        }),
      ).rejects.toMatchObject({
        code: "invalid-request",
        safeMessage: expect.stringContaining("thinking"),
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("serializa tool choice nominal quando thinking está desligado", async () => {
    let body: Record<string, unknown> | undefined;
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse([
          streamChunk({
            tool_calls: [
              {
                function: { arguments: '{"a":1,"b":2}', name: "somar" },
                id: "call_nomeada",
                index: 0,
              },
            ],
          }),
          streamChunk({}, "tool_calls"),
        ]);
      },
      thinking: false,
    });

    await collect(provider, undefined, {
      messages: [{ content: "some", role: "user" }],
      toolChoice: { toolName: "somar" },
      tools: [somar],
    });
    expect(body).toMatchObject({
      tool_choice: { function: { name: "somar" }, type: "function" },
    });
  });

  it("rejeita call quando tool choice é none", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({
            tool_calls: [
              {
                function: { arguments: '{"a":1,"b":2}', name: "somar" },
                id: "call_proibida",
                index: 0,
              },
            ],
          }),
          streamChunk({}, "tool_calls"),
        ]),
    });

    await expect(
      collect(provider, undefined, {
        messages: [{ content: "não use tool", role: "user" }],
        toolChoice: "none",
        tools: [somar],
      }),
    ).rejects.toMatchObject({ code: "invalid-tool-call" });
  });

  it("rejeita stop sem call quando tool choice é required", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () => happyResponse(),
      thinking: false,
    });

    await expect(
      collect(provider, undefined, {
        messages: [{ content: "use tool", role: "user" }],
        toolChoice: "required",
        tools: [somar],
      }),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("rejeita tool diferente da escolha nominal", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica",
      fetch: async () =>
        sseResponse([
          streamChunk({
            tool_calls: [
              {
                function: { arguments: '{"a":3,"b":1}', name: "subtrair" },
                id: "call_errada",
                index: 0,
              },
            ],
          }),
          streamChunk({}, "tool_calls"),
        ]),
      thinking: false,
    });

    await expect(
      collect(provider, undefined, {
        messages: [{ content: "some", role: "user" }],
        toolChoice: { toolName: "somar" },
        tools: [somar, subtrair],
      }),
    ).rejects.toMatchObject({ code: "invalid-tool-call" });
  });

  it("mantém a allowlist de modelos fechada em Pro e Flash", () => {
    expect(DEEPSEEK_MODELS).toEqual([DEEPSEEK_MODEL_PRO, DEEPSEEK_MODEL_FLASH]);
    expect(Object.isFrozen(DEEPSEEK_MODELS)).toBe(true);
    expect(() => (DEEPSEEK_MODELS as unknown as string[]).push("deepseek-inventado")).toThrow(
      TypeError,
    );
    expect(
      () => new DeepSeekProvider({ apiKey: "ok", model: "deepseek-inventado" as never }),
    ).toThrowError(expect.objectContaining({ code: "not-configured" }));
  });
});
