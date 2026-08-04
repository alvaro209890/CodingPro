import type { Tool, ToolResult } from "@codingpro/llm";
import { isTool, toolAcceptsInput } from "@codingpro/llm";
import { CoreError } from "./errors.js";
import {
  applyOutputCeiling,
  type ExecutableTool,
  errorResult,
  type ToolContext,
} from "./tool.js";

/**
 * Registro de tools executáveis. `run` é a única fronteira de execução: valida o input
 * contra o schema e converte qualquer falha em `ToolResult` de erro — nunca propaga throw
 * para o loop agêntico, mantendo o ciclo modelo↔tool fechado.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ExecutableTool>();

  register(tool: ExecutableTool): this {
    if (!isTool(tool.definition)) {
      throw new CoreError("invalid-input", "A definição da tool é inválida.");
    }
    if (this.tools.has(tool.definition.name)) {
      throw new CoreError("duplicate-tool", `A tool "${tool.definition.name}" já está registrada.`);
    }
    this.tools.set(tool.definition.name, tool);
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): ExecutableTool | undefined {
    return this.tools.get(name);
  }

  /** Descritores puros, ordenados por nome, prontos para enviar ao provider. */
  definitions(): readonly Tool[] {
    return [...this.tools.values()]
      .map((tool) => tool.definition)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async run(name: string, rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (tool === undefined) {
      return errorResult(`Ferramenta desconhecida: ${name}.`);
    }
    if (!toolAcceptsInput(tool.definition.inputSchema, rawInput)) {
      return errorResult("Os argumentos não batem com o esperado pela ferramenta.");
    }
    if (context.signal?.aborted === true) {
      return errorResult("Operação cancelada.");
    }
    try {
      return applyOutputCeiling(await tool.execute(rawInput, context));
    } catch (error) {
      if (error instanceof CoreError) {
        return errorResult(error.safeMessage);
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        return errorResult("Operação cancelada.");
      }
      return errorResult("A ferramenta falhou ao executar.");
    }
  }
}
