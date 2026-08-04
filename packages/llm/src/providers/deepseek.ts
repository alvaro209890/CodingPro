import {
  createOpenAICompatible,
  type OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible";
import {
  type FinishReason as AiFinishReason,
  APICallError,
  jsonSchema,
  type LanguageModelUsage,
  type ModelMessage,
  streamText,
  type ToolSet,
  tool,
} from "ai";
import { ProviderError } from "../errors.js";
import type {
  ChatMessage,
  ChatRequest,
  Tool as CodingProTool,
  FinishReason,
  JsonObject,
  JsonValue,
  Provider,
  ProviderEvent,
  StreamOptions,
  TokenUsage,
  ToolCall,
  ToolChoice,
} from "../provider.js";
import {
  DEFAULT_MODEL_ROLE,
  isModelRole,
  type ModelRole,
  type ReasoningEffort,
  resolveDeepSeekModelForRole,
  resolverEsforcoRaciocinio,
} from "../roles.js";
import {
  copyChatRequest,
  copyToolCall,
  isChatRequest,
  isToolCall,
  toolAcceptsInput,
} from "../validation.js";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODEL_PRO = "deepseek-v4-pro";
export const DEEPSEEK_MODEL_FLASH = "deepseek-v4-flash";
export const DEEPSEEK_MODELS = Object.freeze([DEEPSEEK_MODEL_PRO, DEEPSEEK_MODEL_FLASH] as const);
export type DeepSeekModel = (typeof DEEPSEEK_MODELS)[number];
/** Padrão de produto: Flash (nunca Pro). */
export const DEEPSEEK_MODEL = DEEPSEEK_MODEL_FLASH;

type FetchFunction = NonNullable<OpenAICompatibleProviderSettings["fetch"]>;

export interface DeepSeekProviderOptions {
  readonly apiKey: string;
  /**
   * Base da API. Padrão: DeepSeek direto. No modo cloud da plataforma aponta para o proxy
   * (ex. `https://codingpro-api.cursar.space/v1`), que fala o mesmo protocolo — muda só
   * a base e a credencial (token `cp_` em vez da chave DeepSeek).
   */
  readonly baseUrl?: string;
  readonly chunkTimeoutMs?: number;
  readonly fetch?: FetchFunction;
  readonly maxOutputTokens?: number;
  /**
   * ID allowlisted — uso interno/testes. Preferir `role` no caminho de produto.
   * Se `role` e `model` forem informados juntos, precisam concordar.
   */
  readonly model?: DeepSeekModel;
  /** Papel de produto (`auto`|`main`|`fast`). Padrão efetivo: `auto` → Flash + raciocínio `max`. */
  readonly role?: ModelRole;
  readonly reasoningEffort?: ReasoningEffort;
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

function validateModel(model: unknown): asserts model is DeepSeekModel {
  if (model !== DEEPSEEK_MODEL_PRO && model !== DEEPSEEK_MODEL_FLASH) {
    throw new ProviderError("not-configured", "O modelo DeepSeek é inválido.");
  }
}

/**
 * Resolve o modelo a partir de `role` e/ou `model` allowlisted.
 * Caminho de produto: só `role` (todos os papéis → Flash). `model` permanece para testes/smoke.
 */
export function resolveDeepSeekProviderModel(options: {
  readonly model?: unknown;
  readonly role?: unknown;
}): DeepSeekModel {
  const hasRole = options.role !== undefined;
  const hasModel = options.model !== undefined;

  if (hasRole) {
    if (!isModelRole(options.role)) {
      throw new ProviderError("not-configured", "O papel de modelo é inválido.");
    }
    const fromRole = resolveDeepSeekModelForRole(options.role);
    if (hasModel) {
      validateModel(options.model);
      if (options.model !== fromRole) {
        throw new ProviderError(
          "not-configured",
          "O papel e o modelo DeepSeek são inconsistentes.",
        );
      }
    }
    return fromRole;
  }

  if (hasModel) {
    validateModel(options.model);
    return options.model;
  }

  return resolveDeepSeekModelForRole(DEFAULT_MODEL_ROLE);
}

/**
 * Normaliza e valida a base da API. Além do DeepSeek direto, aceita o proxy da plataforma
 * (`access.mode = cloud`), que é OpenAI-compatible e recebe o mesmo corpo de requisição.
 *
 * Fail-closed: só `https:` — exceto `127.0.0.1`/`localhost`, liberados para desenvolvimento
 * local do próprio proxy. Nada de credenciais embutidas na URL nem query/hash.
 */
export function normalizarBaseUrl(bruto: string): string {
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    throw new ProviderError("not-configured", "A URL base da API é inválida.");
  }

  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new ProviderError("not-configured", "A URL base da API é inválida.");
  }

  // Sem barra final: o caminho é concatenado com "/chat/completions".
  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
}

function createRestrictedFetch(delegate: FetchFunction, baseUrl: string): FetchFunction {
  const permitido = `${baseUrl}/chat/completions`;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (
      `${url.origin}${url.pathname}` !== permitido ||
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
  if (message.role === "system" || message.role === "user") {
    return { content: message.content, role: message.role };
  }

  if (message.role === "tool") {
    return {
      content: [
        {
          output: message.result as never,
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          type: "tool-result",
        },
      ],
      role: "tool",
    };
  }

  if (message.role !== "assistant") {
    return { content: message.content, role: message.role };
  }

  if (
    (message.reasoning === undefined || message.reasoning.length === 0) &&
    message.toolCalls === undefined
  ) {
    return { content: message.content, role: "assistant" };
  }

  return {
    content: [
      ...(message.reasoning === undefined || message.reasoning.length === 0
        ? []
        : [{ text: message.reasoning, type: "reasoning" as const }]),
      ...(message.content.length === 0 ? [] : [{ text: message.content, type: "text" as const }]),
      ...(message.toolCalls ?? []).map((call) => ({
        input: call.input,
        toolCallId: call.id,
        toolName: call.name,
        type: "tool-call" as const,
      })),
    ],
    role: "assistant",
  };
}

type ToolInputSchema = CodingProTool["inputSchema"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const WRITE_FILE_ALIASES = {
  content: ["contents", "text"],
  path: ["file_path", "filePath", "filename"],
} as const;

/**
 * Normaliza apenas formas inequivocamente seguras antes da validação do schema.
 * Schemas fechados descartam extras; aliases existem exclusivamente para `write_file`.
 * Canonical + alias ou dois aliases para o mesmo campo continuam inválidos (fail-closed).
 */
export function normalizarInputTool(
  toolName: string,
  schema: ToolInputSchema,
  value: unknown,
): unknown {
  if (schema.type !== "object" || !isPlainObject(value)) {
    return value;
  }
  const original: Record<string, unknown> = { ...value };
  if (toolName === "write_file") {
    for (const [canonical, aliases] of Object.entries(WRITE_FILE_ALIASES)) {
      const presentes = aliases.filter((alias) => Object.hasOwn(original, alias));
      const temCanonical = Object.hasOwn(original, canonical);
      if (!temCanonical && presentes.length === 1) {
        const alias = presentes[0];
        if (alias !== undefined) original[canonical] = original[alias];
      } else if ((temCanonical && presentes.length > 0) || presentes.length > 1) {
        return value;
      }
    }
  }
  const out: Record<string, unknown> =
    schema.additionalProperties === false ? Object.create(null) : { ...original };
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(original, key)) continue;
    const raw = original[key];
    out[key] = raw;
    if (prop.type === "integer" && typeof raw === "string") {
      const parsed = Number(raw);
      if (Number.isSafeInteger(parsed)) {
        out[key] = parsed;
      }
    } else if (prop.type === "number" && typeof raw === "string") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        out[key] = parsed;
      }
    } else if (prop.type === "boolean" && typeof raw === "string") {
      if (raw === "true") {
        out[key] = true;
      } else if (raw === "false") {
        out[key] = false;
      }
    } else if (prop.type === "object" && isPlainObject(raw)) {
      out[key] = normalizarInputTool(toolName, prop as ToolInputSchema, raw);
    } else if (prop.type === "array" && Array.isArray(raw) && isPlainObject(prop.items)) {
      out[key] = raw.map((item) =>
        isPlainObject(item)
          ? normalizarInputTool(toolName, prop.items as ToolInputSchema, item)
          : item,
      );
    }
  }
  return out;
}

function toAiTools(definitions: readonly CodingProTool[]): ToolSet {
  const tools: ToolSet = Object.create(null) as ToolSet;
  for (const definition of definitions) {
    tools[definition.name] = tool({
      description: definition.description,
      inputSchema: jsonSchema<JsonObject>(definition.inputSchema as never, {
        validate: (value) => {
          const normalized = normalizarInputTool(definition.name, definition.inputSchema, value);
          return toolAcceptsInput(definition.inputSchema, normalized)
            ? { success: true, value: normalized as JsonObject }
            : { error: new Error("Tool input inválido."), success: false };
        },
      }),
      outputSchema: jsonSchema<JsonValue>({}),
    });
  }
  return tools;
}

function toAiToolChoice(choice: ToolChoice | undefined) {
  if (choice === undefined) {
    return undefined;
  }
  return typeof choice === "string" ? choice : { toolName: choice.toolName, type: "tool" as const };
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

  // O app/CLI também usa este provider contra o proxy CodingPro Cloud. Aceitamos
  // somente códigos públicos conhecidos e devolvemos mensagens estáticas; nunca
  // repassamos texto arbitrário do corpo, que pode conter detalhe do upstream.
  if (typeof apiError.responseBody === "string") {
    try {
      const corpo = JSON.parse(apiError.responseBody) as { erro?: unknown };
      if (corpo.erro === "conta_nao_aprovada") {
        return new ProviderError(
          "provider-failed",
          "Sua conta ainda não foi aprovada pelo administrador.",
        );
      }
      if (corpo.erro === "creditos_esgotados") {
        return new ProviderError(
          "provider-failed",
          "Seus créditos acabaram. Aguarde o administrador liberar mais.",
        );
      }
    } catch {
      // Corpo não JSON: segue para a sanitização genérica por status.
    }
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
    tools: true,
  } as const;
  readonly id = "deepseek";
  readonly model: DeepSeekModel;

  readonly #languageModel;
  readonly #maxOutputTokens: number;
  readonly #thinking: boolean;
  readonly #timeout: { readonly chunkMs: number; readonly totalMs: number };

  constructor(options: DeepSeekProviderOptions) {
    validateApiKey(options.apiKey);
    const model = resolveDeepSeekProviderModel({
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.role === undefined ? {} : { role: options.role }),
    });
    this.model = model;
    this.#maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const chunkMs = options.chunkTimeoutMs ?? DEFAULT_CHUNK_TIMEOUT_MS;
    const totalMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
    validatePositiveInteger(this.#maxOutputTokens, "maxOutputTokens");
    validatePositiveInteger(chunkMs, "chunkTimeoutMs");
    validatePositiveInteger(totalMs, "totalTimeoutMs");
    this.#timeout = { chunkMs, totalMs };

    const thinking = options.thinking ?? true;
    this.#thinking = thinking;
    // Raciocínio dinâmico: `auto`/`main` (tarefa difícil) → max; `fast` → high. Modelo é sempre Flash.
    const reasoningEffort =
      options.reasoningEffort ?? resolverEsforcoRaciocinio(options.role ?? DEFAULT_MODEL_ROLE);

    const baseUrl = normalizarBaseUrl(options.baseUrl ?? DEEPSEEK_BASE_URL);
    const provider = createOpenAICompatible({
      apiKey: options.apiKey,
      baseURL: baseUrl,
      convertUsage: convertDeepSeekUsage,
      fetch: createRestrictedFetch(options.fetch ?? globalThis.fetch, baseUrl),
      includeUsage: true,
      name: "deepseek",
      transformRequestBody: (body) => ({
        ...body,
        thinking: { type: thinking ? "enabled" : "disabled" },
        ...(thinking ? { reasoning_effort: reasoningEffort } : {}),
      }),
    });
    this.#languageModel = provider(model);
  }

  async *stream(request: ChatRequest, options?: StreamOptions): AsyncIterable<ProviderEvent> {
    options?.signal?.throwIfAborted();
    let snapshot: ChatRequest;
    try {
      if (!isChatRequest(request)) {
        throw new ProviderError("invalid-request", "A requisição ao provider é inválida.");
      }
      snapshot = copyChatRequest(request);
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError("invalid-request", "A requisição ao provider é inválida.");
    }
    if (
      this.#thinking &&
      (snapshot.toolChoice === "required" || typeof snapshot.toolChoice === "object")
    ) {
      throw new ProviderError(
        "invalid-request",
        "O modo thinking da DeepSeek aceita apenas tool choice automático ou none.",
      );
    }
    let content = "";
    let reasoning = "";
    let finished = false;
    const toolCalls: ToolCall[] = [];
    const toolCallIds = new Set<string>();
    const toolDefinitions = new Map(
      snapshot.tools?.map((definition) => [definition.name, definition]),
    );

    try {
      const tools = snapshot.tools === undefined ? undefined : toAiTools(snapshot.tools);
      const toolChoice = toAiToolChoice(snapshot.toolChoice);
      const result = streamText({
        ...(options?.signal === undefined ? {} : { abortSignal: options.signal }),
        allowSystemInMessages: true,
        maxOutputTokens: this.#maxOutputTokens,
        maxRetries: 0,
        messages: snapshot.messages.map(toModelMessage),
        model: this.#languageModel,
        onError: () => {},
        telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
        timeout: this.#timeout,
        ...(toolChoice === undefined ? {} : { toolChoice }),
        ...(tools === undefined ? {} : { tools }),
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
        } else if (part.type === "tool-call") {
          const definition = toolDefinitions.get(part.toolName);
          const input =
            definition === undefined
              ? part.input
              : normalizarInputTool(definition.name, definition.inputSchema, part.input);
          const candidate = { id: part.toolCallId, input, name: part.toolName };
          const motivo =
            definition === undefined
              ? `ferramenta desconhecida "${part.toolName}"`
              : toolCallIds.has(candidate.id)
                ? "id de chamada duplicado"
                : !isToolCall(candidate) ||
                    !toolAcceptsInput(definition.inputSchema, candidate.input)
                  ? `argumentos fora do schema de "${part.toolName}"`
                  : "chamada de ferramenta não permitida neste turno";
          if (
            snapshot.toolChoice === "none" ||
            (typeof snapshot.toolChoice === "object" &&
              snapshot.toolChoice.toolName !== part.toolName) ||
            definition === undefined ||
            !isToolCall(candidate) ||
            !toolAcceptsInput(definition.inputSchema, candidate.input) ||
            toolCallIds.has(candidate.id)
          ) {
            // Código dedicado: o agente se recupera (realimenta o modelo) em vez de abortar a tarefa.
            throw new ProviderError(
              "invalid-tool-call",
              `A DeepSeek retornou uma chamada de ferramenta inválida (${motivo}).`,
            );
          }
          const call = copyToolCall(candidate);
          toolCallIds.add(call.id);
          toolCalls.push(call);
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
          const reason = mapFinishReason(part.finishReason);
          const toolCallRequired =
            snapshot.toolChoice === "required" || typeof snapshot.toolChoice === "object";
          if (
            (reason === "tool-calls") !== toolCalls.length > 0 ||
            (toolCallRequired && toolCalls.length === 0)
          ) {
            throw new ProviderError(
              "invalid-response",
              "A DeepSeek finalizou chamadas de ferramenta de forma inconsistente.",
            );
          }
          for (const call of toolCalls) {
            yield { call: copyToolCall(call), type: "tool-call" };
          }
          yield {
            message: {
              content,
              ...(reasoning.length === 0 ? {} : { reasoning }),
              role: "assistant",
              ...(toolCalls.length === 0 ? {} : { toolCalls: toolCalls.map(copyToolCall) }),
            },
            reason,
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
          part.type === "reasoning-end" ||
          part.type === "tool-input-start" ||
          part.type === "tool-input-delta" ||
          part.type === "tool-input-end"
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
