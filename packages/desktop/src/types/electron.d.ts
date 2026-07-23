import type { CoreUiEvent, PreviaEscrita, UiPermissionResponse } from "@codingpro/core";

export interface SessionMetaUI {
  id: string;
  updatedAt: string;
  preview: string;
}

export interface WorkspaceInfo {
  cwd: string;
  platform: string;
  running?: boolean;
  hasApiKey?: boolean;
  isCodingProMonorepo?: boolean;
  projectSummary?: string;
}

export interface SendMessageResult {
  success: boolean;
  error?: string;
  local?: boolean;
  reply?: string;
  sessionId?: string;
  cwd?: string;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    turns: number;
    contextTokens: number;
    contextBudget: number;
  };
}

export interface SlashCommandMeta {
  nome: string;
  aliases: string[];
  descricao: string;
  aceitaArgs: boolean;
}

export interface CodingProDesktopAPI {
  sendMessage: (prompt: string, workspacePath?: string) => Promise<SendMessageResult>;
  respondPermission: (response: UiPermissionResponse) => void;
  onCoreEvent: (callback: (event: CoreUiEvent) => void) => () => void;
  getWorkspaceInfo: () => Promise<WorkspaceInfo>;
  chooseWorkspaceFolder: () => Promise<string | undefined>;
  setWorkspace: (cwd: string) => Promise<{ success: boolean; cwd?: string; error?: string }>;
  newSession: () => Promise<{ success: boolean; sessionId?: string; error?: string }>;
  cancelRun: () => Promise<{ success: boolean }>;
  listSessions: () => Promise<SessionMetaUI[]>;
  loadSession: (
    sessionId: string,
  ) => Promise<{ success: boolean; messages?: unknown[]; error?: string }>;
  getDiffPreview: (targetFile: string, newContent: string) => Promise<PreviaEscrita | undefined>;
  runTerminalCommand: (
    command: string,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  getSessionCost: () => Promise<SendMessageResult["cost"]>;
  getSlashCommands: () => Promise<SlashCommandMeta[]>;
}

declare global {
  interface Window {
    codingproAPI: CodingProDesktopAPI;
  }
}
