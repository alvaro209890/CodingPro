import type { CoreUiEvent, UiPermissionResponse } from "@codingpro/core";

export interface CodingProDesktopAPI {
  sendMessage: (
    prompt: string,
    workspacePath?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  respondPermission: (response: UiPermissionResponse) => void;
  onCoreEvent: (callback: (event: CoreUiEvent) => void) => () => void;
  getWorkspaceInfo: () => Promise<{ cwd: string; platform: string }>;
  /** Abre o seletor nativo de pasta; `undefined` quando o usuário cancela. */
  chooseWorkspaceFolder: () => Promise<string | undefined>;
}

declare global {
  interface Window {
    codingproAPI: CodingProDesktopAPI;
  }
}
