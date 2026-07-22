import { readFile, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isObject(value) || typeof value.content !== "string") {
    return false;
  }

  if (value.role === "system" || value.role === "user") {
    return true;
  }

  return (
    value.role === "assistant" &&
    (value.reasoning === undefined || typeof value.reasoning === "string")
  );
}

function isTokenUsage(value: unknown): value is TokenUsage {
  if (!isObject(value)) {
    return false;
  }

  const optionalNumbers = [value.cacheReadInputTokens, value.reasoningTokens];
  return (
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
    return typeof value.text === "string";
  }

  return (
    value.type === "finish" &&
    typeof value.reason === "string" &&
    finishReasons.has(value.reason as FinishReason) &&
    isChatMessage(value.message) &&
    value.message.role === "assistant" &&
    (value.usage === undefined || isTokenUsage(value.usage))
  );
}

function isReplayTurn(value: unknown): value is ReplayTurn {
  if (!isObject(value) || !isObject(value.request) || !Array.isArray(value.request.messages)) {
    return false;
  }

  if (!value.request.messages.every(isChatMessage) || !Array.isArray(value.events)) {
    return false;
  }

  if (!value.events.every(isProviderEvent)) {
    return false;
  }

  const finishIndexes = value.events
    .map((event, index) => (isObject(event) && event.type === "finish" ? index : -1))
    .filter((index) => index >= 0);

  return finishIndexes.length === 1 && finishIndexes[0] === value.events.length - 1;
}

export class ReplayProvider implements Provider {
  readonly capabilities = {
    cacheUsage: false,
    reasoning: "toggle",
    streaming: true,
    tools: false,
  } as const;
  readonly id = "replay";
  readonly model = "fixture";
  #nextTurn = 0;

  constructor(private readonly turns: readonly ReplayTurn[]) {
    if (!turns.every(isReplayTurn)) {
      throw new ProviderError("invalid-fixture", "A fixture de replay é inválida.");
    }
  }

  async *stream(request: ChatRequest, options?: StreamOptions): AsyncIterable<ProviderEvent> {
    options?.signal?.throwIfAborted();
    const turn = this.turns[this.#nextTurn];

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
