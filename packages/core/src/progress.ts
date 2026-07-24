import type { ToolCall, ToolResult } from "@codingpro/llm";
import type { AgentEvent } from "./agent.js";

/** Rótulo de status mostrado enquanto o modelo raciocina (raciocínio fica colapsado). */
export const PROGRESS_THINKING = "Pensando…";

function pathArg(call: ToolCall): string | undefined {
  const path = call.input.path;
  return typeof path === "string" && path.length > 0 ? path : undefined;
}

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Verbo de progresso em pt-BR para uma chamada de ferramenta. */
export function describeToolCall(call: ToolCall): string {
  switch (call.name) {
    case "read_file":
      return `Lendo ${pathArg(call) ?? "arquivo"}`;
    case "list_dir":
      return `Listando ${pathArg(call) ?? "o projeto"}`;
    case "glob":
      return "Buscando arquivos…";
    case "grep": {
      const pattern = call.input.pattern;
      return typeof pattern === "string" ? `Buscando "${truncate(pattern)}"` : "Buscando";
    }
    case "write_file":
      return `Escrevendo ${pathArg(call) ?? "arquivo"}`;
    case "edit_file":
      return `Editando ${pathArg(call) ?? "arquivo"}`;
    case "bash": {
      const command = call.input.command;
      return typeof command === "string" ? `Rodando ${truncate(command)}` : "Rodando comando";
    }
    default:
      return `Usando ${call.name}`;
  }
}

function isError(result: ToolResult): boolean {
  return (
    result.type === "error-text" ||
    result.type === "error-json" ||
    result.type === "execution-denied"
  );
}

/** Linha de conclusão de uma ferramenta: ✓ sucesso, ✗ negada/falha. */
export function describeToolResult(call: ToolCall, result: ToolResult): string {
  if (result.type === "execution-denied") {
    return `✗ ${call.name} não autorizado`;
  }
  if (isError(result)) {
    return `✗ ${call.name} falhou`;
  }
  return `✓ ${describeToolCall(call)}`;
}

/**
 * Traduz um evento do loop para uma linha de progresso pt-BR, ou `undefined` para eventos que
 * não são progresso (o texto da resposta e o raciocínio são transmitidos à parte).
 */
export function describeAgentEvent(event: AgentEvent): string | undefined {
  switch (event.type) {
    case "tool-call":
      return describeToolCall(event.call);
    case "tool-result":
      return describeToolResult(event.call, event.result);
    case "notice":
      return event.text;
    default:
      return undefined;
  }
}
