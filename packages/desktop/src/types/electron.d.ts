import type { CoreUiEvent, PreviaEscrita, UiPermissionResponse } from "@codingpro/core";

export interface SessionMetaUI {
  id: string;
  updatedAt: string;
  preview: string;
}

export interface CodingProDesktopAPI {
  sendMessage: (
    prompt: string,
    workspacePath?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  respondPermission: (response: UiPermissionResponse) => void;
  onCoreEvent: (callback: (event: CoreUiEvent) => void) => () => void;
  getWorkspaceInfo: () => Promise<{ cwd: string; platform: string }>;
  chooseWorkspaceFolder: () => Promise<string | undefined>;
  listSessions: () => Promise<SessionMetaUI[]>;
  loadSession: (sessionId: string) => Promise<{ success: boolean; messages?: any[]; error?: string }>;
  getDiffPreview: (targetFile: string, newContent: string) => Promise<PreviaEscrita | undefined>;
  runTerminalCommand: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

declare global {
  interface Window {
    codingproAPI: CodingProDesktopAPI;
  }
}
