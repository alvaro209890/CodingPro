import { spawn } from "node:child_process";
import type { JsonObject, ToolResult } from "@codingpro/llm";

/**
 * Hooks de shell: comandos disparados em eventos do ciclo de vida (`pre-tool`, `post-tool`, `stop`).
 * Um `pre-tool` que sai com código != 0 **veta** a execução da tool. Rodam com ambiente mínimo e
 * timeout; a saída nunca é confiada como instrução (é tratada como dado). Config vem do settings.
 */
export type HookEvent = "post-tool" | "pre-tool" | "stop";

export interface Hook {
  readonly event: HookEvent;
  /** Comando shell a executar. */
  readonly command: string;
  /** Substring do nome da tool para filtrar (eventos de tool); ausente = todas. */
  readonly matcher?: string;
  readonly timeoutMs?: number;
}

export const HOOK_DEFAULT_TIMEOUT_MS = 10_000;
export const HOOK_MAX_OUTPUT = 16_384;

export interface HookOutcome {
  /** `false` só quando um `pre-tool` vetou (exit != 0). */
  readonly allow: boolean;
  readonly reason?: string;
}

/** Runner consultado pelo `ToolGate`: roda hooks antes/depois de cada tool. */
export interface HookRunner {
  antes(toolName: string, input: JsonObject | undefined): Promise<HookOutcome>;
  depois(toolName: string, result: ToolResult): Promise<void>;
}

interface PayloadHook {
  readonly event: HookEvent;
  readonly tool?: string;
  readonly input?: JsonObject;
  readonly result?: ToolResult;
}

/** Executa UM hook, entregando o payload como JSON no stdin. `false` se saiu != 0. */
export async function executarHook(hook: Hook, payload: PayloadHook): Promise<HookOutcome> {
  return new Promise((resolve) => {
    const filho = spawn("/bin/sh", ["-c", hook.command], {
      detached: true, // grupo de processo próprio, para matar filhos (ex.: sleep) no timeout
      env: {
        HOME: process.env.HOME ?? "",
        HOOK_EVENT: hook.event,
        HOOK_TOOL: payload.tool ?? "",
        LANG: process.env.LANG ?? "C",
        PATH: process.env.PATH ?? "",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let saida = "";
    const capturar = (chunk: Buffer): void => {
      if (saida.length < HOOK_MAX_OUTPUT) {
        saida += chunk.toString("utf8");
      }
    };
    filho.stdout.on("data", capturar);
    filho.stderr.on("data", capturar);
    const matar = (): void => {
      try {
        if (filho.pid !== undefined) {
          process.kill(-filho.pid, "SIGKILL"); // mata o grupo inteiro
        }
      } catch {
        filho.kill("SIGKILL");
      }
    };
    const timer = setTimeout(matar, hook.timeoutMs ?? HOOK_DEFAULT_TIMEOUT_MS);
    filho.on("error", () => {
      clearTimeout(timer);
      resolve({ allow: true }); // hook que nem executa não bloqueia o trabalho
    });
    filho.on("close", (code) => {
      clearTimeout(timer);
      const bloqueou = hook.event === "pre-tool" && code !== 0;
      resolve(
        bloqueou
          ? { allow: false, reason: saida.trim().slice(0, 500) || `hook vetou (código ${code})` }
          : { allow: true },
      );
    });
    filho.stdin.on("error", () => undefined); // processo pode fechar antes de lermos o stdin (EPIPE)
    try {
      filho.stdin.end(JSON.stringify(payload));
    } catch {
      // stdin já destruído após close do processo — promessa será resolvida ao timeout ou close
    }
  });
}

function combina(hook: Hook, event: HookEvent, toolName: string | undefined): boolean {
  if (hook.event !== event) {
    return false;
  }
  if (hook.matcher === undefined || hook.matcher.length === 0) {
    return true;
  }
  return toolName?.includes(hook.matcher) === true;
}

/**
 * Cria um `HookRunner` a partir da lista de hooks configurados. `antes` roda os `pre-tool` em ordem
 * e para no primeiro veto; `depois` roda os `post-tool` (nunca bloqueia). Sem hooks → no-op barato.
 */
export function criarHookRunner(hooks: readonly Hook[]): HookRunner {
  const preTool = hooks.filter((h) => h.event === "pre-tool");
  const postTool = hooks.filter((h) => h.event === "post-tool");
  return {
    async antes(toolName, input): Promise<HookOutcome> {
      for (const hook of preTool) {
        if (!combina(hook, "pre-tool", toolName)) {
          continue;
        }
        const r = await executarHook(hook, {
          event: "pre-tool",
          tool: toolName,
          ...(input === undefined ? {} : { input }),
        });
        if (!r.allow) {
          return r;
        }
      }
      return { allow: true };
    },
    async depois(toolName, result): Promise<void> {
      for (const hook of postTool) {
        if (combina(hook, "post-tool", toolName)) {
          await executarHook(hook, { event: "post-tool", result, tool: toolName });
        }
      }
    },
  };
}

/** Roda os hooks de `stop` (fim de turno). Best-effort, nunca bloqueia. */
export async function rodarHooksStop(hooks: readonly Hook[]): Promise<void> {
  for (const hook of hooks) {
    if (hook.event === "stop") {
      await executarHook(hook, { event: "stop" });
    }
  }
}
