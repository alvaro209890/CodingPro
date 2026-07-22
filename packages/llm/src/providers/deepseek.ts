import {
  APICallError,
  type FinishReason as AiFinishReason,
  type LanguageModelUsage,
  type ModelMessage,
  streamText,
} from "ai";
import {
  createOpenAICompatible,
  type OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible";
import { ProviderError } from "../errors.js";
import type {
  ChatMessage,
  ChatRequest,
  FinishReason,
  Provider,
  ProviderEvent,
  StreamOptions,
  TokenUsage,
} from "../provider.js";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODEL = "deepseek-v4-pro";

type FetchFunction = NonNullable<OpenAICompatibleProviderSettings["fetch"]>;

export interface DeepSeekProviderOptions {
  readonly apiKey: string;
  readonly chunkTimeoutMs?: number;
  readonly fetch?: FetchFunction;
  readonly maxOutputTokens?: number;
  readonly reasoningEffort?: "high" | "max";
  readonly thinking?: boolean;
  readonly totalTimeoutMs?: number;
}

const DEFAULT_CHUNK_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_TOTAL_TIMEOUT_MS = 120_000;

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ProviderError("not-configured", `A configuração ${name} é inválida.`);
  }
}

function validateApiKey(apiKey: string): void {
  if (apiKey.trim().length === 0 || /[\0\r\n]/u.test(apiKey)) {
    throw new ProviderError("not-configured", "A chave da API DeepSeek é inválida.");
  }
}

function createRestrictedFetch(delegate: FetchFunction): FetchFunction {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (
      url.origin !== DEEPSEEK_BASE_URL ||
      url.pathname !== "/chat/completions" ||
      url.search.length > 0 ||
      url.hash.length > 0 ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      init?.method !== "POST"
    ) {
      throw new ProviderError("provider-failed", "O destino da API DeepSeek é inválido.");
    }

    return delegate(input, { ...init, redirect: "error" });
  };
}

function toModelMessage(message: ChatMessage): ModelMessage {
  if (
    message.role !== "assistant" ||
    message.reasoning === undefined ||
    message.reasoning.length === 0
  ) {
    return { content: message.content, role: message.role };
  }

  return {
    content: [
      { text: message.reasoning, type: "reasoning" },
      { text: message.content, type: "text" },
    ],
    role: "assistant",
  };
}

function isNonNegativeInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

function mapUsage(usage: LanguageModelUsage): TokenUsage | undefined {
  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }
  if (!isNonNegativeInteger(inputTokens) || !isNonNegativeInteger(outputTokens)) {
    throw new ProviderError("invalid-response", "A DeepSeek retornou uso de tokens inválido.");
  }

  const cacheReadInputTokens = usage.inputTokenDetails.cacheReadTokens;
  const noCacheTokens = usage.inputTokenDetails.noCacheTokens;
  const reasoningTokens = usage.outputTokenDetails.reasoningTokens;
  for (const optionalValue of [cacheReadInputTokens, noCacheTokens, reasoningTokens]) {
    if (optionalValue !== undefined && !isNonNegativeInteger(optionalValue)) {
      throw new ProviderError("invalid-response", "A DeepSeek retornou uso de tokens inválido.");
    }
  }
  if (
    cacheReadInputTokens !== undefined &&
    noCacheTokens !== undefined &&
    cacheReadInputTokens + noCacheTokens !== inputTokens
  ) {
    throw new ProviderError("invalid-response", "A DeepSeek retornou uso de cache inconsistente.");
  }
  if (reasoningTokens !== undefined && reasoningTokens > outputTokens) {
    throw new ProviderError("invalid-response", "A DeepSeek retornou uso de tokens inconsistente.");
  }

  return {
    ...(cacheReadInputTokens === undefined ? {} : { cacheReadInputTokens }),
    inputTokens,
    outputTokens,
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  };
}

function mapFinishReason(reason: AiFinishReason): FinishReason {
  return reason === "other" ? "unknown" : reason;
}

function hasErrorName(error: unknown, expectedName: string): boolean {
  const visited = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null || visited.has(current)) {
      return false;
    }
    visited.add(current);
    if ("name" in current && current.name === expectedName) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

function providerFailure(error: unknown): ProviderError {
  const apiError = APICallError.isInstance(error)
    ? error
    : typeof error === "object" &&
        error !== null &&
        "cause" in error &&
        APICallError.isInstance(error.cause)
      ? error.cause
      : undefined;

  if (hasErrorName(error, "TimeoutError")) {
    return new ProviderError(
      "provider-failed",
      "A DeepSeek não respondeu dentro do tempo limite.",
      true,
    );
  }

  if (apiError === undefined) {
    return new ProviderError(
      "provider-failed",
      "Não foi possível obter resposta da DeepSeek.",
      error instanceof TypeError,
    );
  }

  const status = apiError.statusCode;
  if (status === 401 || status === 403) {
    return new ProviderError("provider-failed", "A autenticação da DeepSeek falhou.");
  }
  if (status === 402) {
    return new ProviderError("provider-failed", "A conta DeepSeek não possui saldo disponível.");
  }
  if (status === 429) {
    return new ProviderError(
      "provider-failed",
      "A DeepSeek limitou temporariamente a solicitação.",
      true,
    );
  }
  if (status !== undefined && status >= 500) {
    return new ProviderError(
      "provider-failed",
      "A DeepSeek está temporariamente indisponível.",
      true,
    );
  }
  if (status !== undefined && status >= 400) {
    return new ProviderError("provider-failed", "A DeepSeek rejeitou a solicitação.");
  }
  return new ProviderError("provider-failed", "Não foi possível obter resposta da DeepSeek.", true);
}

function convertDeepSeekUsage(usage: Record<string, unknown> | null | undefined) {
  if (usage == null) {
    return {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    };
  }

  const promptTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const completionTokens =
    typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
  const cacheRead =
    typeof usage.prompt_cache_hit_tokens === "number" ? usage.prompt_cache_hit_tokens : undefined;
  const cacheMiss =
    typeof usage.prompt_cache_miss_tokens === "number"
      ? usage.prompt_cache_miss_tokens
      : cacheRead !== undefined && promptTokens !== undefined
        ? promptTokens - cacheRead
        : promptTokens;
  const completionDetails =
    typeof usage.completion_tokens_details === "object" && usage.completion_tokens_details !== null
      ? (usage.completion_tokens_details as Record<string, unknown>)
      : undefined;
  const reasoning =
    typeof completionDetails?.reasoning_tokens === "number"
      ? completionDetails.reasoning_tokens
      : undefined;

  return {
    inputTokens: {
      total: promptTokens,
      noCache: cacheMiss,
      cacheRead,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: completionTokens === undefined ? undefined : completionTokens - (reasoning ?? 0),
      reasoning,
    },
  };
}

export class DeepSeekProvider implements Provider {
  readonly capabilities = {
    cacheUsage: true,
    reasoning: "effort",
    streaming: true,
    tools: false,
  } as const;
  readonly id = "deepseek";
  readonly model = DEEPSEEK_MODEL;

  readonly #languageModel;
  readonly #maxOutputTokens: number;
  readonly #timeout: { readonly chunkMs: number; readonly totalMs: number };

  constructor(options: DeepSeekProviderOptions) {
    validateApiKey(options.apiKey);
    this.#maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const chunkMs = options.chunkTimeoutMs ?? DEFAULT_CHUNK_TIMEOUT_MS;
    const totalMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
    validatePositiveInteger(this.#maxOutputTokens, "maxOutputTokens");
    validatePositiveInteger(chunkMs, "chunkTimeoutMs");
    validatePositiveInteger(totalMs, "totalTimeoutMs");
    this.#timeout = { chunkMs, totalMs };

    const thinking = options.thinking ?? true;
    const reasoningEffort = options.reasoningEffort ?? "high";

    const provider = createOpenAICompatible({
      apiKey: options.apiKey,
      baseURL: DEEPSEEK_BASE_URL,
      convertUsage: convertDeepSeekUsage,
      fetch: createRestrictedFetch(options.fetch ?? globalThis.fetch),
      includeUsage: true,
      name: "deepseek",
      transformRequestBody: (body) => ({
        ...body,
        thinking: { type: thinking ? "enabled" : "disabled" },
        ...(thinking ? { reasoning_effort: reasoningEffort } : {}),
      }),
    });
    this.#languageModel = provider(DEEPSEEK_MODEL);
  }

  async *stream(request: ChatRequest, options?: StreamOptions): AsyncIterable<ProviderEvent> {
    options?.signal?.throwIfAborted();
    let content = "";
    let reasoning = "";
    let finished = false;

    try {
      const result = streamText({
        ...(options?.signal === undefined ? {} : { abortSignal: options.signal }),
        allowSystemInMessages: true,
        maxOutputTokens: this.#maxOutputTokens,
        maxRetries: 0,
        messages: request.messages.map(toModelMessage),
        model: this.#languageModel,
        onError: () => {},
        telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
        timeout: this.#timeout,
      });

      for await (const part of result.stream) {
        if (finished) {
          throw new ProviderError("invalid-response", "A DeepSeek enviou dados após finalizar.");
        }

        if (part.type === "text-delta") {
          content += part.text;
          yield { text: part.text, type: "text-delta" };
        } else if (part.type === "reasoning-delta") {
          reasoning += part.text;
          yield { text: part.text, type: "reasoning-delta" };
        } else if (part.type === "error") {
          throw providerFailure(part.error);
        } else if (part.type === "abort") {
          options?.signal?.throwIfAborted();
          throw new ProviderError(
            "provider-failed",
            "A DeepSeek não respondeu dentro do tempo limite.",
            true,
          );
        } else if (part.type === "finish") {
          if (
            part.finishReason === "error" ||
            part.rawFinishReason === "insufficient_system_resource"
          ) {
            throw new ProviderError(
              "provider-failed",
              "A DeepSeek está temporariamente indisponível.",
              true,
            );
          }
          finished = true;
          const usage = mapUsage(part.totalUsage);
          yield {
            message: {
              content,
              ...(reasoning.length === 0 ? {} : { reasoning }),
              role: "assistant",
            },
            reason: mapFinishReason(part.finishReason),
            type: "finish",
            ...(usage === undefined ? {} : { usage }),
          };
        } else if (
          part.type === "start" ||
          part.type === "start-step" ||
          part.type === "finish-step" ||
          part.type === "text-start" ||
          part.type === "text-end" ||
          part.type === "reasoning-start" ||
          part.type === "reasoning-end"
        ) {
          // Eventos de ciclo de vida não fazem parte do contrato Provider v1.
        } else {
          throw new ProviderError(
            "invalid-response",
            "A DeepSeek retornou conteúdo não suportado nesta etapa.",
          );
        }
      }
    } catch (error) {
      options?.signal?.throwIfAborted();
      if (error instanceof ProviderError) {
        throw error;
      }
      throw providerFailure(error);
    }

    if (!finished) {
      throw new ProviderError("invalid-response", "A DeepSeek terminou sem finalizar a resposta.");
    }
  }
}
