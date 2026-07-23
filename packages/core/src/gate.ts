import type { JsonObject, ToolResult } from "@codingpro/llm";
import type { HookRunner } from "./hooks.js";
import { deniedResult, type PermissionController } from "./permissions.js";
import type { ToolRegistry } from "./registry.js";
import { errorResult, type ToolContext } from "./tool.js";

function asJsonObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

/**
 * Fronteira única que o loop agêntico usa para rodar uma tool: hook `pre-tool` (pode vetar) →
 * autoriza pela política/aprovador → executa → hook `post-tool`. Uma tool não autorizada ou vetada
 * devolve `execution-denied` sem tocar em disco/processo; uma desconhecida devolve erro sem vazar.
 */
export class ToolGate {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionController,
    private readonly hooks?: HookRunner,
  ) {}

  async run(name: string, rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.registry.get(name);
    if (tool === undefined) {
      return errorResult(`Ferramenta desconhecida: ${name}.`);
    }
    const input = asJsonObject(rawInput);
    if (this.hooks !== undefined) {
      const veto = await this.hooks.antes(name, input);
      if (!veto.allow) {
        return { reason: veto.reason ?? `Hook vetou "${name}".`, type: "execution-denied" };
      }
    }
    const authorized = await this.permissions.authorize(
      { sideEffect: tool.sideEffect, toolName: name, ...(input === undefined ? {} : { input }) },
      context,
    );
    if (!authorized) {
      return deniedResult(name);
    }
    const result = await this.registry.run(name, rawInput, context);
    if (this.hooks !== undefined) {
      await this.hooks.depois(name, result);
    }
    return result;
  }
}
