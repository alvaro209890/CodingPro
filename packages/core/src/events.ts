import type {
  ChatMessage,
  FinishReason,
  ModelRole,
  TokenUsage,
  ToolCall,
  ToolResult,
} from "@codingpro/llm";
import type { PermissionRequest } from "./permissions.js";
import type { PreviaEscrita } from "./preview.js";
import type { SubagenteEvento } from "./subagent.js";

/** Versão atual do protocolo de eventos Core <-> UI. */
export const CORE_UI_EVENT_PROTOCOL_VERSION = "1.5.0";

/**
 * Eventos brutos emitidos pelo loop agêntico durante a execução de um turno.
 * DEVE espelhar `AgentEvent` de `agent.ts` (mesma união) — este é o mirror versionado do protocolo.
 */
export type AgentEvent =
  | { readonly text: string; readonly type: "text-delta" }
  | { readonly text: string; readonly type: "reasoning-delta" }
  | { readonly call: ToolCall; readonly type: "tool-call" }
  | { readonly call: ToolCall; readonly result: ToolResult; readonly type: "tool-result" }
  /** Aviso não-fatal do loop (ex.: recuperação de chamada de ferramenta inválida) — aditivo v1.3.0. */
  | {
      readonly text: string;
      readonly type: "notice";
      readonly key?: string;
      readonly attempt?: number;
      readonly total?: number;
    }
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

export interface UsageSourceUi {
  readonly source: "main" | "repair" | `subagent:${string}`;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly reasoningTokens: number;
  readonly costUsd: number;
  readonly apiCalls: number;
}

export interface UsageSnapshotUi {
  readonly estimated: boolean;
  readonly updatedAt: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly reasoningTokens: number;
  readonly totalCostUsd: number;
  readonly turns: number;
  readonly apiCalls: number;
  readonly subagentCalls: number;
  readonly contextTokens: number;
  readonly contextBudget: number;
  readonly sources: readonly UsageSourceUi[];
}

/** Resposta de aprovação enviada pela UI de volta ao Core. */
export interface UiPermissionResponse {
  readonly decision: { readonly action: "allow" | "always" | "deny" };
  readonly requestId: string;
}

/** Eventos consolidados do protocolo Core <-> UI (IPC no Electron, TTY no Terminal). */
export type CoreUiEvent =
  | { readonly type: "agent-event"; readonly event: AgentEvent }
  | { readonly type: "usage-updated"; readonly snapshot: UsageSnapshotUi }
  | { readonly type: "subagent-event"; readonly event: SubagenteEvento }
  | UiPermissionEvent
  | { readonly type: "session-updated"; readonly messages: readonly ChatMessage[] }
  | { readonly type: "error"; readonly code: string; readonly message: string }
  | {
      readonly type: "plan-task";
      readonly task: {
        id: string;
        label: string;
        status: "pending" | "running" | "done" | "failed";
      };
    }
  /** Modelo/effort real usado no turno (aditivo v1.4.0) — substitui strings fixas na UI. */
  | { readonly type: "model-info"; readonly modelName: string; readonly effort: ModelRole };

/** Envelope tipado para envio de mensagens IPC no Electron Renderer/Main. */
export interface IpcEnvelope<T = unknown> {
  readonly channel: string;
  readonly payload: T;
  readonly protocolVersion: typeof CORE_UI_EVENT_PROTOCOL_VERSION;
}
