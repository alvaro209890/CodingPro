export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

interface ToolSchemaBase {
  readonly description?: string;
}

export type ToolInputSchema =
  | (ToolSchemaBase & {
      readonly additionalProperties: false;
      readonly properties: Readonly<Record<string, ToolInputSchema>>;
      readonly required?: readonly string[];
      readonly type: "object";
    })
  | (ToolSchemaBase & {
      readonly enum?: readonly string[];
      readonly type: "string";
    })
  | (ToolSchemaBase & {
      readonly type: "boolean" | "integer" | "number";
    })
  | (ToolSchemaBase & {
      readonly items: ToolInputSchema;
      readonly type: "array";
    });

/** Descritor puro: a execução e a permissão pertencem ao core, nunca ao provider. */
export interface Tool {
  readonly description: string;
  readonly inputSchema: Extract<ToolInputSchema, { type: "object" }>;
  readonly name: string;
}

export interface ToolCall {
  readonly id: string;
  readonly input: JsonObject;
  readonly name: string;
}

export type ToolResult =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "json"; readonly value: JsonValue }
  | { readonly type: "error-text"; readonly value: string }
  | { readonly type: "error-json"; readonly value: JsonValue }
  | { readonly reason?: string; readonly type: "execution-denied" };

export type ToolChoice = "auto" | "none" | "required" | { readonly toolName: string };

export type ChatMessage =
  | {
      readonly content: string;
      readonly role: "system" | "user";
    }
  | {
      readonly content: string;
      readonly reasoning?: string;
      readonly role: "assistant";
      readonly toolCalls?: readonly ToolCall[];
    }
  | {
      readonly result: ToolResult;
      readonly role: "tool";
      readonly toolCallId: string;
      readonly toolName: string;
    };

export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly toolChoice?: ToolChoice;
  readonly tools?: readonly Tool[];
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
      readonly call: ToolCall;
      readonly type: "tool-call";
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
