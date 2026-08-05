export {
  type CostBreakdown,
  DEEPSEEK_PRICING,
  estimateCost,
  formatCost,
  type ModelPricing,
  somarCustos,
} from "./cost.js";
export { ProviderError, type ProviderErrorCode } from "./errors.js";
export type {
  ChatMessage,
  ChatRequest,
  FinishReason,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  Provider,
  ProviderCapabilities,
  ProviderEvent,
  StreamOptions,
  TokenUsage,
  Tool,
  ToolCall,
  ToolChoice,
  ToolInputSchema,
  ToolResult,
} from "./provider.js";
export {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  DEEPSEEK_MODEL_FLASH,
  DEEPSEEK_MODEL_PRO,
  DEEPSEEK_MODELS,
  type DeepSeekModel,
  DeepSeekProvider,
  type DeepSeekProviderOptions,
  normalizarBaseUrl,
  normalizarInputTool,
  resolveDeepSeekProviderModel,
} from "./providers/deepseek.js";
export {
  loadReplayProvider,
  parseReplayProvider,
  ReplayProvider,
  type ReplayTurn,
} from "./providers/replay.js";
export {
  DEFAULT_MODEL_ROLE,
  isModelRole,
  MODEL_ROLE_FAST,
  MODEL_ROLE_MAIN,
  MODEL_ROLES,
  type ModelRole,
  parseModelRole,
  type ReasoningEffort,
  type ResolvedDeepSeekModel,
  ROLE_MODEL_FLASH,
  ROLE_MODEL_PRO,
  resolveDeepSeekModelForRole,
  resolverEsforcoRaciocinio,
} from "./roles.js";
export {
  copyChatMessage,
  isChatMessage,
  isTool,
  isToolCall,
  repararInputToolCall,
  toolAcceptsInput,
} from "./validation.js";
