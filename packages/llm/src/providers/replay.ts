import { readFile, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { ProviderError } from "../errors.js";
import type {
  ChatRequest,
  FinishReason,
  Provider,
  ProviderEvent,
  StreamOptions,
  TokenUsage,
} from "../provider.js";
import {
  copyChatMessage,
  copyChatRequest,
  copyToolCall,
  isChatMessage,
  isChatRequest,
  isToolCall,
  toolAcceptsInput,
} from "../validation.js";

export interface ReplayTurn {
  readonly events: readonly ProviderEvent[];
  readonly request: ChatRequest;
}

const finishReasons = new Set<FinishReason>([
  "stop",
  "length",
  "tool-calls",
  "content-filter",
  "error",
  "unknown",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTokenUsage(value: unknown): value is TokenUsage {
  if (!isObject(value)) {
    return false;
  }

  const optionalNumbers = [value.cacheReadInputTokens, value.reasoningTokens];
  return (
    hasOnlyKeys(value, [
      "cacheReadInputTokens",
      "inputTokens",
      "outputTokens",
      "reasoningTokens",
    ]) &&
    isNonNegativeInteger(value.inputTokens) &&
    isNonNegativeInteger(value.outputTokens) &&
    optionalNumbers.every((token) => token === undefined || isNonNegativeInteger(token))
  );
}

function isProviderEvent(value: unknown): value is ProviderEvent {
  if (!isObject(value)) {
    return false;
  }

  if (value.type === "text-delta" || value.type === "reasoning-delta") {
    return hasOnlyKeys(value, ["text", "type"]) && typeof value.text === "string";
  }

  if (value.type === "tool-call") {
    return hasOnlyKeys(value, ["call", "type"]) && isToolCall(value.call);
  }

  return (
    value.type === "finish" &&
    hasOnlyKeys(value, ["message", "reason", "type", "usage"]) &&
    typeof value.reason === "string" &&
    finishReasons.has(value.reason as FinishReason) &&
    isChatMessage(value.message) &&
    value.message.role === "assistant" &&
    (value.usage === undefined || isTokenUsage(value.usage))
  );
}

function isReplayTurn(value: unknown): value is ReplayTurn {
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ["events", "request"]) ||
    !isChatRequest(value.request)
  ) {
    return false;
  }

  if (!Array.isArray(value.events)) {
    return false;
  }

  if (!value.events.every(isProviderEvent)) {
    return false;
  }

  const finishIndexes = value.events
    .map((event, index) => (isObject(event) && event.type === "finish" ? index : -1))
    .filter((index) => index >= 0);

  if (finishIndexes.length !== 1 || finishIndexes[0] !== value.events.length - 1) {
    return false;
  }

  const finish = value.events.at(-1);
  if (!isObject(finish) || finish.type !== "finish" || !isChatMessage(finish.message)) {
    return false;
  }
  let content = "";
  let reasoning = "";
  const calls = [];
  const callIds = new Set<string>();
  const definitions = new Map(
    value.request.tools?.map((definition) => [definition.name, definition]),
  );
  for (const event of value.events.slice(0, -1)) {
    if (event.type === "text-delta") {
      content += event.text;
    } else if (event.type === "reasoning-delta") {
      reasoning += event.text;
    } else if (event.type === "tool-call") {
      const definition = definitions.get(event.call.name);
      if (
        value.request.toolChoice === "none" ||
        (typeof value.request.toolChoice === "object" &&
          value.request.toolChoice.toolName !== event.call.name) ||
        definition === undefined ||
        callIds.has(event.call.id) ||
        !toolAcceptsInput(definition.inputSchema, event.call.input)
      ) {
        return false;
      }
      callIds.add(event.call.id);
      calls.push(event.call);
    }
  }

  const toolCallRequired =
    value.request.toolChoice === "required" || typeof value.request.toolChoice === "object";

  return (
    finish.message.role === "assistant" &&
    finish.message.content === content &&
    finish.message.reasoning === (reasoning.length === 0 ? undefined : reasoning) &&
    isDeepStrictEqual(finish.message.toolCalls, calls.length === 0 ? undefined : calls) &&
    (finish.reason === "tool-calls") === calls.length > 0 &&
    (!toolCallRequired || calls.length > 0)
  );
}

export class ReplayProvider implements Provider {
  readonly capabilities = {
    cacheUsage: false,
    reasoning: "toggle",
    streaming: true,
    tools: true,
  } as const;
  readonly id = "replay";
  readonly model = "fixture";
  readonly #turns: readonly ReplayTurn[];
  #nextTurn = 0;

  constructor(turns: readonly ReplayTurn[]) {
    let valid = false;
    try {
      valid = turns.every(isReplayTurn);
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new ProviderError("invalid-fixture", "A fixture de replay é inválida.");
    }
    this.#turns = turns.map((turn) => ({
      events: turn.events.map((event): ProviderEvent => {
        if (event.type === "text-delta" || event.type === "reasoning-delta") {
          return { text: event.text, type: event.type };
        }
        if (event.type === "tool-call") {
          return { call: copyToolCall(event.call), type: "tool-call" };
        }
        return {
          message: copyChatMessage(event.message) as Extract<
            ReturnType<typeof copyChatMessage>,
            { role: "assistant" }
          >,
          reason: event.reason,
          type: "finish",
          ...(event.usage === undefined ? {} : { usage: { ...event.usage } }),
        };
      }),
      request: copyChatRequest(turn.request),
    }));
  }

  async *stream(request: ChatRequest, options?: StreamOptions): AsyncIterable<ProviderEvent> {
    options?.signal?.throwIfAborted();
    const turn = this.#turns[this.#nextTurn];

    if (turn === undefined) {
      throw new ProviderError("replay-exhausted", "A fixture de replay não possui outro turno.");
    }

    if (!isDeepStrictEqual(request, turn.request)) {
      throw new ProviderError(
        "replay-mismatch",
        "A requisição não corresponde à fixture de replay.",
      );
    }

    this.#nextTurn += 1;
    for (const event of turn.events) {
      options?.signal?.throwIfAborted();
      yield event;
    }
  }
}

export async function loadReplayProvider(
  path: string,
  options?: StreamOptions,
): Promise<ReplayProvider> {
  let content: string;
  try {
    options?.signal?.throwIfAborted();
    const metadata = await stat(path);
    options?.signal?.throwIfAborted();
    if (!metadata.isFile()) {
      throw new ProviderError("invalid-fixture", "A fixture de replay não é um arquivo regular.");
    }
    content = await readFile(path, { encoding: "utf8", signal: options?.signal });
  } catch (cause) {
    options?.signal?.throwIfAborted();
    if (cause instanceof ProviderError) {
      throw cause;
    }
    throw new ProviderError("invalid-fixture", "Não foi possível ler a fixture de replay.", false, {
      cause,
    });
  }

  return parseReplayProvider(content);
}

export function parseReplayProvider(content: string): ReplayProvider {
  const turns: ReplayTurn[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (cause) {
      throw new ProviderError(
        "invalid-fixture",
        `A fixture de replay é inválida na linha ${index + 1}.`,
        false,
        { cause },
      );
    }

    if (!isReplayTurn(value)) {
      throw new ProviderError(
        "invalid-fixture",
        `A fixture de replay é inválida na linha ${index + 1}.`,
      );
    }
    turns.push(value);
  }

  if (turns.length === 0) {
    throw new ProviderError("invalid-fixture", "A fixture de replay está vazia.");
  }

  return new ReplayProvider(turns);
}
