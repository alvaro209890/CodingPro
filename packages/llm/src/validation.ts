import type {
  ChatMessage,
  ChatRequest,
  JsonObject,
  JsonValue,
  Tool,
  ToolCall,
  ToolInputSchema,
  ToolResult,
} from "./provider.js";

const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/u;
const TOOL_CALL_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_SCHEMA_BYTES = 65_536;
const MAX_SCHEMA_DEPTH = 16;
const MAX_SCHEMA_PROPERTIES = 256;
const MAX_TOOL_INPUT_BYTES = 262_144;
const MAX_TOOL_RESULT_BYTES = 1_048_576;
const MAX_JSON_DEPTH = 32;
const MAX_JSON_NODES = 20_000;

function hasCanonicalOwnProperties(value: object): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.every((key) => {
    if (typeof key !== "string") {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function isCanonicalArray(value: readonly unknown[]): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.at(-1) !== "length") {
    return false;
  }
  return keys.every((key, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (key === "length") {
      return descriptor !== undefined && !descriptor.enumerable && "value" in descriptor;
    }
    return (
      key === String(index) &&
      descriptor !== undefined &&
      descriptor.enumerable &&
      "value" in descriptor
    );
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && hasCanonicalOwnProperties(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isSafeText(value: unknown, maxBytes: number, allowEmpty = true): value is string {
  return (
    typeof value === "string" &&
    (allowEmpty || value.length > 0) &&
    Buffer.byteLength(value, "utf8") <= maxBytes &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        code <= 8 ||
        (code >= 11 && code <= 31) ||
        (code >= 127 && code <= 159) ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
      );
    })
  );
}

function jsonByteLength(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(copyJsonValue(value as JsonValue));
    return serialized === undefined ? undefined : Buffer.byteLength(serialized, "utf8");
  } catch {
    return undefined;
  }
}

function isJsonValueWithinLimits(value: unknown, maxBytes: number): value is JsonValue {
  const active = new Set<object>();
  let nodes = 0;

  const visit = (candidate: unknown, depth: number): candidate is JsonValue => {
    nodes += 1;
    if (nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
      return false;
    }
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "string") {
      return true;
    }
    if (typeof candidate === "number") {
      return Number.isFinite(candidate);
    }
    if (typeof candidate !== "object" || active.has(candidate)) {
      return false;
    }

    active.add(candidate);
    let valid: boolean;
    if (Array.isArray(candidate)) {
      valid =
        isCanonicalArray(candidate) &&
        candidate.length <= MAX_JSON_NODES &&
        candidate.every((item) => visit(item, depth + 1));
    } else if (isObject(candidate)) {
      const entries = Object.entries(candidate);
      valid =
        entries.length <= MAX_SCHEMA_PROPERTIES &&
        entries.every(([key, item]) => !DANGEROUS_KEYS.has(key) && visit(item, depth + 1));
    } else {
      valid = false;
    }
    active.delete(candidate);
    return valid;
  };

  return visit(value, 0) && (jsonByteLength(value) ?? maxBytes + 1) <= maxBytes;
}

export function copyJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(copyJsonValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyJsonValue(item)]),
    );
  }
  return value;
}

export function copyToolCall(call: ToolCall): ToolCall {
  return {
    id: call.id,
    input: copyJsonValue(call.input) as JsonObject,
    name: call.name,
  };
}

export function copyChatMessage(message: ChatMessage): ChatMessage {
  if (message.role === "tool") {
    return {
      result: copyToolResult(message.result),
      role: "tool",
      toolCallId: message.toolCallId,
      toolName: message.toolName,
    };
  }
  if (message.role === "assistant") {
    return {
      content: message.content,
      ...(message.reasoning === undefined ? {} : { reasoning: message.reasoning }),
      role: "assistant",
      ...(message.toolCalls === undefined
        ? {}
        : { toolCalls: message.toolCalls.map(copyToolCall) }),
    };
  }
  return { content: message.content, role: message.role };
}

function copyToolResult(result: ToolResult): ToolResult {
  if (result.type === "json" || result.type === "error-json") {
    return { type: result.type, value: copyJsonValue(result.value) };
  }
  if (result.type === "execution-denied") {
    return { type: result.type, ...(result.reason === undefined ? {} : { reason: result.reason }) };
  }
  return { type: result.type, value: result.value };
}

export function copyChatRequest(request: ChatRequest): ChatRequest {
  return {
    messages: request.messages.map(copyChatMessage),
    ...(request.toolChoice === undefined
      ? {}
      : {
          toolChoice:
            typeof request.toolChoice === "string"
              ? request.toolChoice
              : { toolName: request.toolChoice.toolName },
        }),
    ...(request.tools === undefined
      ? {}
      : {
          tools: request.tools.map((definition) => ({
            description: definition.description,
            inputSchema: copyJsonValue(
              definition.inputSchema as unknown as JsonValue,
            ) as unknown as Tool["inputSchema"],
            name: definition.name,
          })),
        }),
  };
}

function isToolInputSchema(value: unknown): value is ToolInputSchema {
  let properties = 0;
  const active = new Set<object>();

  const visit = (candidate: unknown, depth: number): candidate is ToolInputSchema => {
    if (!isObject(candidate) || active.has(candidate) || depth > MAX_SCHEMA_DEPTH) {
      return false;
    }
    active.add(candidate);
    const descriptionValid =
      candidate.description === undefined || isSafeText(candidate.description, 4_096);
    if (!descriptionValid) {
      active.delete(candidate);
      return false;
    }

    let valid = false;
    if (candidate.type === "object") {
      valid =
        hasOnlyKeys(candidate, [
          "additionalProperties",
          "description",
          "properties",
          "required",
          "type",
        ]) &&
        candidate.additionalProperties === false &&
        isObject(candidate.properties);
      if (valid) {
        const entries = Object.entries(candidate.properties as Record<string, unknown>);
        properties += entries.length;
        valid =
          properties <= MAX_SCHEMA_PROPERTIES &&
          entries.every(
            ([key, schema]) =>
              PROPERTY_NAME.test(key) && !DANGEROUS_KEYS.has(key) && visit(schema, depth + 1),
          );
        const propertyNames = new Set(entries.map(([key]) => key));
        if (candidate.required !== undefined) {
          valid =
            valid &&
            Array.isArray(candidate.required) &&
            isCanonicalArray(candidate.required) &&
            candidate.required.length <= propertyNames.size &&
            new Set(candidate.required).size === candidate.required.length &&
            candidate.required.every((key) => typeof key === "string" && propertyNames.has(key));
        }
      }
    } else if (candidate.type === "array") {
      valid =
        hasOnlyKeys(candidate, ["description", "items", "type"]) &&
        visit(candidate.items, depth + 1);
    } else if (candidate.type === "string") {
      valid = hasOnlyKeys(candidate, ["description", "enum", "type"]);
      if (candidate.enum !== undefined) {
        valid =
          valid &&
          Array.isArray(candidate.enum) &&
          isCanonicalArray(candidate.enum) &&
          candidate.enum.length > 0 &&
          candidate.enum.length <= 128 &&
          new Set(candidate.enum).size === candidate.enum.length &&
          candidate.enum.every((item) => isSafeText(item, 4_096));
      }
    } else if (
      candidate.type === "boolean" ||
      candidate.type === "integer" ||
      candidate.type === "number"
    ) {
      valid = hasOnlyKeys(candidate, ["description", "type"]);
    }

    active.delete(candidate);
    return valid;
  };

  return visit(value, 0) && (jsonByteLength(value) ?? MAX_SCHEMA_BYTES + 1) <= MAX_SCHEMA_BYTES;
}

export function isTool(value: unknown): value is Tool {
  return (
    isObject(value) &&
    hasOnlyKeys(value, ["description", "inputSchema", "name"]) &&
    typeof value.name === "string" &&
    TOOL_NAME.test(value.name) &&
    !DANGEROUS_KEYS.has(value.name) &&
    isSafeText(value.description, 4_096, false) &&
    isToolInputSchema(value.inputSchema) &&
    value.inputSchema.type === "object"
  );
}

export function toolAcceptsInput(schema: Tool["inputSchema"], value: unknown): value is JsonObject {
  if (!isJsonValueWithinLimits(value, MAX_TOOL_INPUT_BYTES) || !isObject(value)) {
    return false;
  }

  const matches = (candidate: unknown, expected: ToolInputSchema): boolean => {
    if (expected.type === "object") {
      if (!isObject(candidate)) {
        return false;
      }
      const keys = Object.keys(candidate);
      if (keys.some((key) => !Object.hasOwn(expected.properties, key) || DANGEROUS_KEYS.has(key))) {
        return false;
      }
      if (expected.required?.some((key) => !Object.hasOwn(candidate, key))) {
        return false;
      }
      return keys.every((key) =>
        matches(candidate[key], expected.properties[key] as ToolInputSchema),
      );
    }
    if (expected.type === "array") {
      return Array.isArray(candidate) && candidate.every((item) => matches(item, expected.items));
    }
    if (expected.type === "string") {
      return (
        typeof candidate === "string" &&
        (expected.enum === undefined || expected.enum.includes(candidate))
      );
    }
    if (expected.type === "boolean") {
      return typeof candidate === "boolean";
    }
    if (expected.type === "integer") {
      return typeof candidate === "number" && Number.isSafeInteger(candidate);
    }
    return typeof candidate === "number" && Number.isFinite(candidate);
  };

  return matches(value, schema);
}

export function isToolCall(value: unknown): value is ToolCall {
  return (
    isObject(value) &&
    hasOnlyKeys(value, ["id", "input", "name"]) &&
    typeof value.id === "string" &&
    TOOL_CALL_ID.test(value.id) &&
    typeof value.name === "string" &&
    TOOL_NAME.test(value.name) &&
    isObject(value.input) &&
    isJsonValueWithinLimits(value.input, MAX_TOOL_INPUT_BYTES)
  );
}

function isToolResult(value: unknown): value is ToolResult {
  if (!isObject(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "execution-denied") {
    return (
      hasOnlyKeys(value, ["reason", "type"]) &&
      (value.reason === undefined || isSafeText(value.reason, MAX_TOOL_RESULT_BYTES))
    );
  }
  if (value.type === "text" || value.type === "error-text") {
    return hasOnlyKeys(value, ["type", "value"]) && isSafeText(value.value, MAX_TOOL_RESULT_BYTES);
  }
  if (value.type === "json" || value.type === "error-json") {
    return (
      hasOnlyKeys(value, ["type", "value"]) &&
      isJsonValueWithinLimits(value.value, MAX_TOOL_RESULT_BYTES)
    );
  }
  return false;
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!isObject(value) || typeof value.role !== "string") {
    return false;
  }
  if (value.role === "system" || value.role === "user") {
    return hasOnlyKeys(value, ["content", "role"]) && typeof value.content === "string";
  }
  if (value.role === "assistant") {
    return (
      hasOnlyKeys(value, ["content", "reasoning", "role", "toolCalls"]) &&
      typeof value.content === "string" &&
      (value.reasoning === undefined || typeof value.reasoning === "string") &&
      (value.toolCalls === undefined ||
        (Array.isArray(value.toolCalls) &&
          isCanonicalArray(value.toolCalls) &&
          value.toolCalls.length > 0 &&
          value.toolCalls.every(isToolCall)))
    );
  }
  return (
    value.role === "tool" &&
    hasOnlyKeys(value, ["result", "role", "toolCallId", "toolName"]) &&
    typeof value.toolCallId === "string" &&
    TOOL_CALL_ID.test(value.toolCallId) &&
    typeof value.toolName === "string" &&
    TOOL_NAME.test(value.toolName) &&
    isToolResult(value.result)
  );
}

export function isChatRequest(value: unknown): value is ChatRequest {
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ["messages", "toolChoice", "tools"]) ||
    !Array.isArray(value.messages) ||
    !isCanonicalArray(value.messages) ||
    value.messages.length === 0 ||
    !value.messages.every(isChatMessage)
  ) {
    return false;
  }

  const tools = value.tools;
  if (
    tools !== undefined &&
    (!Array.isArray(tools) ||
      !isCanonicalArray(tools) ||
      tools.length === 0 ||
      tools.length > 128 ||
      !tools.every(isTool))
  ) {
    return false;
  }
  const toolMap = new Map<string, Tool>();
  for (const definition of tools ?? []) {
    if (toolMap.has(definition.name)) {
      return false;
    }
    toolMap.set(definition.name, definition);
  }

  if (value.toolChoice !== undefined) {
    if (toolMap.size === 0) {
      return false;
    }
    if (typeof value.toolChoice === "string") {
      if (!["auto", "none", "required"].includes(value.toolChoice)) {
        return false;
      }
    } else if (
      !isObject(value.toolChoice) ||
      !hasOnlyKeys(value.toolChoice, ["toolName"]) ||
      typeof value.toolChoice.toolName !== "string" ||
      !toolMap.has(value.toolChoice.toolName)
    ) {
      return false;
    }
  }

  const pending = new Map<string, ToolCall>();
  const seenIds = new Set<string>();
  for (const message of value.messages) {
    if (message.role === "tool") {
      const call = pending.get(message.toolCallId);
      if (call === undefined || call.name !== message.toolName) {
        return false;
      }
      pending.delete(message.toolCallId);
      continue;
    }
    if (pending.size > 0) {
      return false;
    }
    if (message.role !== "assistant" || message.toolCalls === undefined) {
      continue;
    }
    for (const call of message.toolCalls) {
      const definition = toolMap.get(call.name);
      if (
        definition === undefined ||
        seenIds.has(call.id) ||
        !toolAcceptsInput(definition.inputSchema, call.input)
      ) {
        return false;
      }
      seenIds.add(call.id);
      pending.set(call.id, call);
    }
  }

  return pending.size === 0;
}
