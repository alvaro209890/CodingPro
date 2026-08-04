import type {
  CoreUiEvent,
  PreviaEscrita,
  UiPermissionResponse,
  UsageSnapshotUi,
} from "@codingpro/core";
import type { SaldoContaUI } from "../shared/saldo-conta.js";
import type { UpdateStateUI } from "../shared/updater.js";

export interface SessionMetaUI {
  id: string;
  updatedAt: string;
  createdAt: string;
  title: string;
  isRunning: boolean;
  usage: Omit<
    UsageSnapshotUi,
    "contextBudget" | "contextTokens" | "estimated" | "sources" | "updatedAt"
  >;
}

export interface ProjectSessionGroupUI {
  id: string;
  name: string;
  workspacePath: string;
  lastOpenedAt: string;
  available: boolean;
  sessions: SessionMetaUI[];
}

export type { UpdateStateUI } from "../shared/updater.js";

export interface EstadoAcesso {
  /** `conta` = token do site; `chave-propria` = apenas dev; `sem-acesso` = login obrigatório. */
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
  /** Nome da pasta aberta — o que a UI mostra como "projeto". */
  projectName?: string;
  /** Branch git da pasta aberta; ausente quando não é repositório. */
  branch?: string;
  /** Quantidade de skills carregadas de `.codingpro/skills` na sessão atual. */
  skills?: number;
  /** Versão do app (package.json) — a UI não pode inventar este número. */
  appVersion?: string;
}

export interface SendMessageResult {
  success: boolean;
  error?: string;
  local?: boolean;
  reply?: string;
  sessionId?: string;
  cwd?: string;
  cost?: UsageSnapshotUi;
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
  obterSaldoConta: () => Promise<SaldoContaUI>;
  onSaldoConta: (callback: (saldo: SaldoContaUI) => void) => () => void;
  contaLogin: (apiUrl?: string) => Promise<InicioDeviceUI>;
  contaLoginDireto: (email: string, senha: string) => Promise<{ status: string }>;
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
  listSessions: () => Promise<ProjectSessionGroupUI[]>;
  loadSession: (target: {
    workspacePath: string;
    sessionId: string;
  }) => Promise<{ success: boolean; messages?: unknown[]; cwd?: string; error?: string }>;
  getDiffPreview: (targetFile: string, newContent: string) => Promise<PreviaEscrita | undefined>;
  runTerminalCommand: (
    command: string,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  getSessionCost: () => Promise<SendMessageResult["cost"]>;
  getUpdateState: () => Promise<UpdateStateUI>;
  checkForUpdates: () => Promise<UpdateStateUI>;
  downloadUpdate: () => Promise<UpdateStateUI>;
  installUpdate: () => Promise<{ success: boolean; error?: string }>;
  onUpdateEvent: (callback: (state: UpdateStateUI) => void) => () => void;
  getSlashCommands: () => Promise<SlashCommandMeta[]>;
  setAutoApprove: (enabled: boolean) => Promise<{ success: boolean; autoApprove: boolean }>;
  getAutoApprove: () => Promise<boolean>;
}

declare global {
  interface Window {
    codingproAPI: CodingProDesktopAPI;
  }
}
