import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const DESKTOP_DIAGNOSTICS_FILE = "diagnostics.jsonl";

export interface DesktopDiagnosticEvent {
  readonly code?: string;
  readonly durationMs?: number;
  readonly event:
    | "run-cancel-requested"
    | "run-completed"
    | "run-failed"
    | "run-retry"
    | "run-started";
  readonly message?: string;
  readonly runId?: string;
  readonly sessionId?: string;
  readonly workspace?: string;
}

function sanitizeText(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(/[\r\n]+/gu, " ").slice(0, maxLength);
}

/**
 * Log local, pequeno e sem prompt/resposta/chave. Nunca derruba o app se o disco estiver indisponível.
 */
export function appendDesktopDiagnostic(
  userDataPath: string,
  event: DesktopDiagnosticEvent,
  timestamp = new Date(),
): void {
  try {
    mkdirSync(userDataPath, { recursive: true });
    const line = JSON.stringify({
      ...event,
      ...(event.message === undefined ? {} : { message: sanitizeText(event.message, 500) }),
      ...(event.workspace === undefined ? {} : { workspace: sanitizeText(event.workspace, 1_000) }),
      timestamp: timestamp.toISOString(),
    });
    appendFileSync(join(userDataPath, DESKTOP_DIAGNOSTICS_FILE), `${line}\n`, "utf8");
  } catch {
    // Diagnóstico é best-effort e jamais interfere na execução principal.
  }
}
