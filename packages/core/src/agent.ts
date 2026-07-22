import {
  type ChatMessage,
  type ChatRequest,
  type FinishReason,
  type Provider,
  ProviderError,
  type Tool,
  type ToolCall,
  type TokenUsage,
  type ToolResult,
} from "@codingpro/llm";
import type { ToolGate } from "./gate.js";
import { SYSTEM_PROMPT_V1 } from "./system-prompt.js";
import type { ToolContext } from "./tool.js";

/** Teto de passos do loop, para nunca girar sem fim quando o modelo insiste em ferramentas. */
export const AGENT_DEFAULT_MAX_STEPS = 25;

export type AgentFinishReason = "max-steps" | "stop";

/** Eventos observáveis do loop — a UI (TUI/headless) os traduz para a tela. */
export type AgentEvent =
  | { readonly text: string; readonly type: "text-delta" }
  | { readonly text: string; readonly type: "reasoning-delta" }
  | { readonly call: ToolCall; readonly type: "tool-call" }
  | { readonly call: ToolCall; readonly result: ToolResult; readonly type: "tool-result" }
  | {
      readonly reason: FinishReason;
      readonly step: number;
      readonly type: "step";
      readonly usage?: TokenUsage;
    };

export interface RunAgentOptions {
  readonly context: ToolContext;
  readonly gate: ToolGate;
  /** Mensagens iniciais (ex.: a pergunta do usuário). O system prompt é prefixado. */
  readonly messages: readonly ChatMessage[];
  readonly maxSteps?: number;
  readonly onEvent?: (event: AgentEvent) => void;
  readonly provider: Provider;
  readonly signal?: AbortSignal;
  readonly systemPrompt?: string;
  /** Definições de ferramentas anunciadas ao provider. Vazio → nenhuma ferramenta. */
  readonly tools?: readonly Tool[];
}

export interface AgentResult {
  readonly finishReason: AgentFinishReason;
  /** Transcrito completo, incluindo a mensagem de sistema e os resultados de ferramentas. */
  readonly messages: readonly ChatMessage[];
  readonly steps: number;
  readonly usage: TokenUsage;
}

interface TurnOutcome {
  readonly message: Extract<ChatMessage, { role: "assistant" }>;
  readonly reason: FinishReason;
  readonly usage?: TokenUsage;
}

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

function addUsage(total: TokenUsage, turn: TokenUsage | undefined): TokenUsage {
  if (turn === undefined) {
    return total;
  }
  const cacheRead = (total.cacheReadInputTokens ?? 0) + (turn.cacheReadInputTokens ?? 0);
  const reasoning = (total.reasoningTokens ?? 0) + (turn.reasoningTokens ?? 0);
  return {
    ...(cacheRead > 0 ? { cacheReadInputTokens: cacheRead } : {}),
    inputTokens: total.inputTokens + turn.inputTokens,
    outputTokens: total.outputTokens + turn.outputTokens,
    ...(reasoning > 0 ? { reasoningTokens: reasoning } : {}),
  };
}

async function streamTurn(
  provider: Provider,
  request: ChatRequest,
  onEvent: ((event: AgentEvent) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<TurnOutcome> {
  let outcome: TurnOutcome | undefined;

  for await (const event of provider.stream(
    request,
    signal === undefined ? undefined : { signal },
  )) {
    if (outcome !== undefined) {
      throw new ProviderError("invalid-response", "O provider enviou dados após finalizar.");
    }
    switch (event.type) {
      case "text-delta":
        onEvent?.({ text: event.text, type: "text-delta" });
        break;
      case "reasoning-delta":
        onEvent?.({ text: event.text, type: "reasoning-delta" });
        break;
      case "tool-call":
        onEvent?.({ call: event.call, type: "tool-call" });
        break;
      default:
        outcome = {
          message: event.message,
          reason: event.reason,
          ...(event.usage === undefined ? {} : { usage: event.usage }),
        };
    }
  }

  if (outcome === undefined) {
    throw new ProviderError("invalid-response", "O provider terminou sem finalizar a resposta.");
  }
  return outcome;
}

/**
 * Loop agêntico mínimo: transmite um turno do provider, executa as ferramentas pedidas pelo
 * `ToolGate` (que aplica permissão) e realimenta os resultados até o modelo parar de pedir
 * ferramentas ou o teto de passos ser atingido. As ferramentas só rodam após um `finish`
 * limpo, então uma falha de streaming nunca duplica efeitos colaterais.
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const maxSteps =
    options.maxSteps !== undefined && options.maxSteps > 0
      ? Math.trunc(options.maxSteps)
      : AGENT_DEFAULT_MAX_STEPS;
  const tools = options.tools ?? [];
  const messages: ChatMessage[] = [
    { content: options.systemPrompt ?? SYSTEM_PROMPT_V1, role: "system" },
    ...options.messages,
  ];

  let usage = ZERO_USAGE;
  let steps = 0;
  let finishReason: AgentFinishReason = "max-steps";

  while (steps < maxSteps) {
    options.signal?.throwIfAborted();
    steps += 1;
    const request: ChatRequest = { messages, ...(tools.length > 0 ? { tools } : {}) };
    const turn = await streamTurn(options.provider, request, options.onEvent, options.signal);
    messages.push(turn.message);
    usage = addUsage(usage, turn.usage);
    options.onEvent?.({
      reason: turn.reason,
      step: steps,
      type: "step",
      ...(turn.usage === undefined ? {} : { usage: turn.usage }),
    });

    const calls = turn.message.toolCalls;
    if (calls === undefined || calls.length === 0) {
      finishReason = "stop";
      break;
    }
    if (steps >= maxSteps) {
      break;
    }
    for (const call of calls) {
      options.signal?.throwIfAborted();
      const result = await options.gate.run(call.name, call.input, options.context);
      messages.push({
        result,
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
      });
      options.onEvent?.({ call, result, type: "tool-result" });
    }
  }

  return { finishReason, messages, steps, usage };
}
