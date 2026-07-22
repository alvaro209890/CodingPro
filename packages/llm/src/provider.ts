export type ChatMessage =
  | {
      readonly content: string;
      readonly role: "system" | "user";
    }
  | {
      readonly content: string;
      readonly reasoning?: string;
      readonly role: "assistant";
    };

export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
}

export interface StreamOptions {
  readonly signal?: AbortSignal;
}

export interface ProviderCapabilities {
  readonly cacheUsage: boolean;
  readonly reasoning: "none" | "toggle" | "effort";
  readonly streaming: boolean;
  readonly tools: boolean;
}

export interface TokenUsage {
  readonly cacheReadInputTokens?: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens?: number;
}

export type FinishReason =
  | "stop"
  | "length"
  | "tool-calls"
  | "content-filter"
  | "error"
  | "unknown";

export type ProviderEvent =
  | {
      readonly text: string;
      readonly type: "text-delta";
    }
  | {
      readonly text: string;
      readonly type: "reasoning-delta";
    }
  | {
      readonly message: Extract<ChatMessage, { role: "assistant" }>;
      readonly reason: FinishReason;
      readonly type: "finish";
      readonly usage?: TokenUsage;
    };

export interface Provider {
  readonly capabilities: ProviderCapabilities;
  readonly id: string;
  readonly model: string;

  stream(request: ChatRequest, options?: StreamOptions): AsyncIterable<ProviderEvent>;
}
