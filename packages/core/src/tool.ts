import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import type { Workspace } from "./workspace.js";

/** Ambiente entregue a cada execução de tool. Sem credenciais, sem rede implícita. */
export interface ToolContext {
  readonly workspace: Workspace;
  readonly signal?: AbortSignal;
}

/**
 * Classe de efeito da tool, base do gate de permissão:
 * `read` nunca pede aprovação; `write`/`exec` passam pelo controlador de permissões.
 */
export type ToolSideEffect = "exec" | "read" | "write";

/**
 * Descritor puro (validável por `isTool`) acoplado à sua execução e à sua classe de efeito.
 * `execute` recebe input já validado contra o schema e sempre devolve um `ToolResult`;
 * erros de execução viram `ToolResult` de erro na fronteira do registry.
 */
export interface ExecutableTool {
  readonly definition: Tool;
  readonly sideEffect: ToolSideEffect;
  execute(input: JsonObject, context: ToolContext): Promise<ToolResult>;
}

export function textResult(value: string): ToolResult {
  return { type: "text", value };
}

export function errorResult(value: string): ToolResult {
  return { type: "error-text", value };
}
