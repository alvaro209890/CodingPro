import type { ChatMessage, FinishReason, TokenUsage, ToolCall, ToolResult } from "@codingpro/llm";
import type { PermissionRequest } from "./permissions.js";
import type { PreviaEscrita } from "./preview.js";

/** Versão atual do protocolo de eventos Core <-> UI. */
export const CORE_UI_EVENT_PROTOCOL_VERSION = "1.2.0";

/** Eventos brutos emitidos pelo loop agêntico durante a execução de um turno. */
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

/** Solicitação de permissão IPC / TTY enviada para aprovação do usuário. */
export interface UiPermissionEvent {
  readonly type: "permission-request";
  readonly request: PermissionRequest;
  /** Correlaciona com `UiPermissionResponse.requestId` — a UI deve ecoar de volta sem gerar a sua própria. */
  readonly requestId: string;
  /** Prévia best-effort de write/edit (aditivo v1.2.0). */
  readonly previa?: PreviaEscrita;
}

/** Resposta de aprovação enviada pela UI de volta ao Core. */
export interface UiPermissionResponse {
  readonly decision: { readonly action: "allow" | "always" | "deny" };
  readonly requestId: string;
}

/** Eventos consolidados do protocolo Core <-> UI (IPC no Electron, TTY no Terminal). */
export type CoreUiEvent =
  | { readonly type: "agent-event"; readonly event: AgentEvent }
  | UiPermissionEvent
  | { readonly type: "session-updated"; readonly messages: readonly ChatMessage[] }
  | { readonly type: "error"; readonly code: string; readonly message: string };

/** Envelope tipado para envio de mensagens IPC no Electron Renderer/Main. */
export interface IpcEnvelope<T = unknown> {
  readonly channel: string;
  readonly payload: T;
  readonly protocolVersion: typeof CORE_UI_EVENT_PROTOCOL_VERSION;
}
