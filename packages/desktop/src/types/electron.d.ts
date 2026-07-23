import type { CoreUiEvent, PreviaEscrita, UiPermissionResponse } from "@codingpro/core";

export interface SessionMetaUI {
  id: string;
  updatedAt: string;
  preview: string;
}

export interface EstadoAcesso {
  /** `conta` = token do site; `chave-propria` = DEEPSEEK_API_KEY; `sem-acesso` = nada configurado. */
  modo: "conta" | "chave-propria" | "sem-acesso";
  apiUrl?: string;
  prefixoToken?: string;
}

export interface InicioDeviceUI {
  codigoDispositivo: string;
  codigoUsuario: string;
  urlVerificacao: string;
  intervaloSegundos: number;
  apiUrl?: string;
}

export interface WorkspaceInfo {
  cwd: string;
  platform: string;
  running?: boolean;
  hasApiKey?: boolean;
  acesso?: EstadoAcesso;
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
  estadoAcesso: () => Promise<EstadoAcesso>;
  contaLogin: (apiUrl?: string) => Promise<InicioDeviceUI>;
  contaLoginDireto: (email: string, senha: string) => Promise<void>;
  contaCadastrar: (email: string, nome: string, senha: string) => Promise<string>;
  contaConsultar: (
    apiUrl: string,
    codigoDispositivo: string,
  ) => Promise<{ estado: "pendente" | "pronto" | "expirado" }>;
  contaLogout: () => Promise<boolean>;
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
  setAutoApprove: (enabled: boolean) => Promise<{ success: boolean; autoApprove: boolean }>;
  getAutoApprove: () => Promise<boolean>;
}

declare global {
  interface Window {
    codingproAPI: CodingProDesktopAPI;
  }
}
