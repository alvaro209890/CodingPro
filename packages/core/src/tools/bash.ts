import { spawn } from "node:child_process";
import type { JsonObject, JsonValue, Tool, ToolResult } from "@codingpro/llm";
import { CoreError } from "../errors.js";
import { type ExecutableTool, textResult, type ToolContext } from "../tool.js";

export const BASH_DEFAULT_TIMEOUT_MS = 30_000;
export const BASH_MAX_TIMEOUT_MS = 120_000;
export const BASH_MAX_COMMAND_LENGTH = 8_192;
export const BASH_MAX_OUTPUT_BYTES = 100_000; // por fluxo (stdout/stderr)
/** Só estas variáveis chegam ao processo-filho: credenciais nunca vazam para tools. */
export const BASH_ENV_ALLOWLIST = Object.freeze(["HOME", "LANG", "PATH"] as const);

const definition: Tool = {
  description:
    "Executa um comando de shell na raiz do projeto e devolve a saída. Efeito colateral: " +
    "sempre passa pela permissão. Ambiente mínimo, sem credenciais.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      command: { description: "Comando de shell a executar.", type: "string" },
      timeoutMs: { description: "Tempo máximo em ms (teto de 120000).", type: "integer" },
    },
    required: ["command"],
    type: "object",
  },
  name: "bash",
};

function minimalEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of BASH_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

/** Remove caracteres de controle perigosos (mantém \n e \t) e normaliza fins de linha. */
function sanitize(text: string): string {
  return (
    text
      .replace(/\r\n?/gu, "\n")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: remoção intencional de controle.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu, "")
  );
}

function clampTimeout(value: JsonValue | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return BASH_DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.max(1, Math.trunc(value)), BASH_MAX_TIMEOUT_MS);
}

interface CommandOutcome {
  readonly aborted: boolean;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;
  readonly timedOut: boolean;
}

function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<CommandOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      detached: true, // grupo de processos próprio → matamos toda a árvore.
      env: minimalEnv(),
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;

    const collect = (chunk: Buffer, current: string): string => {
      const remaining = BASH_MAX_OUTPUT_BYTES - Buffer.byteLength(current, "utf8");
      if (remaining <= 0) {
        return current;
      }
      const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
      return current + slice.toString("utf8");
    };

    const onStdout = (chunk: Buffer) => {
      if (settled) return;
      stdout = collect(chunk, stdout);
    };
    const onStderr = (chunk: Buffer) => {
      if (settled) return;
      stderr = collect(chunk, stderr);
    };

    const killTree = (): void => {
      if (child.pid === undefined) {
        return;
      }
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const onAbort = (): void => {
      aborted = true;
      killTree();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);

    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      child.stdout.removeListener("data", onStdout);
      child.stderr.removeListener("data", onStderr);
    };

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(
        new CoreError("execution-failed", "Não foi possível iniciar o comando.", { cause: error }),
      );
    });

    child.on("close", (code, closeSignal) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({ aborted, exitCode: code, signal: closeSignal, stderr, stdout, timedOut });
    });
  });
}

function render(command: string, outcome: CommandOutcome): string {
  const head = sanitize(command).slice(0, 200);
  const status = outcome.timedOut
    ? "tempo esgotado"
    : outcome.aborted
      ? "cancelado"
      : outcome.exitCode !== null
        ? `código ${outcome.exitCode}`
        : `sinal ${outcome.signal ?? "?"}`;
  const parts = [`$ ${head}`, `[${status}]`];
  const stdout = sanitize(outcome.stdout).trimEnd();
  const stderr = sanitize(outcome.stderr).trimEnd();
  if (stdout !== "") {
    parts.push(stdout);
  }
  if (stderr !== "") {
    parts.push(`[stderr]\n${stderr}`);
  }
  return parts.join("\n");
}

export const bashTool: ExecutableTool = {
  definition,
  sideEffect: "exec",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const command = input.command;
    if (typeof command !== "string" || command.trim() === "") {
      throw new CoreError("invalid-input", "O comando é obrigatório.");
    }
    if (command.length > BASH_MAX_COMMAND_LENGTH) {
      throw new CoreError("invalid-input", "O comando é longo demais.");
    }
    if (context.signal?.aborted === true) {
      throw new CoreError("timeout", "Operação cancelada.");
    }
    const timeoutMs = clampTimeout(input.timeoutMs);
    const outcome = await runCommand(command, context.workspace.root, timeoutMs, context.signal);
    return textResult(render(command, outcome));
  },
};
