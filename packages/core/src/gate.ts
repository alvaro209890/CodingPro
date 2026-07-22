import type { ToolResult } from "@codingpro/llm";
import { deniedResult, type PermissionController } from "./permissions.js";
import type { ToolRegistry } from "./registry.js";
import { errorResult, type ToolContext } from "./tool.js";

/**
 * Fronteira única que o loop agêntico usa para rodar uma tool: primeiro autoriza pela
 * política/aprovador, só então executa. Uma tool não autorizada devolve `execution-denied`
 * sem tocar em disco nem processo; uma desconhecida devolve erro sem vazar detalhe.
 */
export class ToolGate {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionController,
  ) {}

  async run(name: string, rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.registry.get(name);
    if (tool === undefined) {
      return errorResult(`Ferramenta desconhecida: ${name}.`);
    }
    const authorized = await this.permissions.authorize(
      { sideEffect: tool.sideEffect, toolName: name },
      context,
    );
    if (!authorized) {
      return deniedResult(name);
    }
    return this.registry.run(name, rawInput, context);
  }
}
