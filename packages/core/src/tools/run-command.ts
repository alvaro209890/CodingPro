import type { JsonObject, JsonValue, Tool, ToolResult } from "@codingpro/llm";
import { CoreError } from "../errors.js";
import { type ExecutableTool, type ToolContext, errorResult, textResult } from "../tool.js";
import { runShellCommand } from "./bash.js";

export const RUN_COMMAND_DEFAULT_TIMEOUT_MS = 15_000;
export const RUN_COMMAND_MAX_TIMEOUT_MS = 60_000;
export const RUN_COMMAND_MAX_OUTPUT_CHARS = 16_000;

const ALLOWED_PREFIXES = Object.freeze([
  "git log",
  "git show",
  "git branch",
  "git remote",
  "git rev-parse",
  "node -v",
  "node --version",
  "npm -v",
  "pnpm -v",
  "ls",
  "dir",
  "pwd",
  "echo",
  "type",
  "cat ",
  "where ",
  "which ",
] as const);

const definition: Tool = {
  description:
    "Executa comandos de leitura allowlisted (git log, ls, cat, node -v, etc.) com saída " +
    "limitada. Para comandos com efeito colateral, use bash.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      command: { description: "Comando allowlisted a executar.", type: "string" },
      timeoutMs: { description: "Tempo máximo em ms (teto de 60000).", type: "integer" },
    },
    required: ["command"],
    type: "object",
  },
  name: "run_command",
};

function clampTimeout(value: JsonValue | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return RUN_COMMAND_DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.max(1, Math.trunc(value)), RUN_COMMAND_MAX_TIMEOUT_MS);
}

export function comandoPermitido(command: string): boolean {
  const trimmed = command.trim();
  if (trimmed === "") {
    return false;
  }
  return ALLOWED_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function truncateCharsHeadTail(text: string, maxChars: number): string {
  if (text.length < maxChars) {
    return text;
  }
  const headChars = Math.floor(maxChars * 0.6);
  const tailChars = Math.floor(maxChars * 0.3);
  const omitidos = text.length - headChars - tailChars;
  return `${text.slice(0, headChars)}\n…[truncado: ${omitidos} caracteres omitidos]…\n${text.slice(-tailChars)}`;
}

function maybeTruncateOutput(text: string, capped: boolean): string {
  if (!capped && text.length < RUN_COMMAND_MAX_OUTPUT_CHARS) {
    return text;
  }
  return truncateCharsHeadTail(text, RUN_COMMAND_MAX_OUTPUT_CHARS);
}

function render(command: string, outcome: Awaited<ReturnType<typeof runShellCommand>>): string {
  const head = command.trim().slice(0, 200);
  const status = outcome.timedOut
    ? "tempo esgotado"
    : outcome.aborted
      ? "cancelado"
      : outcome.exitCode !== null
        ? `código ${outcome.exitCode}`
        : `sinal ${outcome.signal ?? "?"}`;
  const partes = [`$ ${head}`, `[${status}]`];
  const stdout = maybeTruncateOutput(outcome.stdout.trimEnd(), outcome.stdoutCapped);
  const stderr = maybeTruncateOutput(outcome.stderr.trimEnd(), outcome.stderrCapped);
  if (stdout !== "") {
    partes.push(stdout);
  }
  if (stderr !== "") {
    partes.push(`[stderr]\n${stderr}`);
  }
  return partes.join("\n");
}

export const runCommandTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const command = input.command;
    if (typeof command !== "string" || command.trim() === "") {
      throw new CoreError("invalid-input", "O comando é obrigatório.");
    }
    if (!comandoPermitido(command)) {
      return errorResult(
        "Comando não permitido nesta ferramenta de leitura. " +
          "Use bash para comandos com efeito colateral.",
      );
    }
    if (context.signal?.aborted === true) {
      throw new CoreError("timeout", "Operação cancelada.");
    }
    const timeoutMs = clampTimeout(input.timeoutMs);
    const outcome = await runShellCommand(command, context.workspace.root, {
      maxOutputBytes: RUN_COMMAND_MAX_OUTPUT_CHARS,
      ...(context.signal === undefined ? {} : { signal: context.signal }),
      timeoutMs,
    });
    return textResult(render(command, outcome));
  },
};
