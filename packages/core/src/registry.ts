import { createHash } from "node:crypto";
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
  // C3 — dedup de resultados idênticos: chave `tool|hash(input)` → {seq, resultado}.
  private readonly resultados = new Map<string, { seq: number; resultado: ToolResult }>();
  private sequencia = 0;

  /** C3 — limpa o cache de resultados (chamado após tool de efeito). */
  invalidarResultados(): void {
    this.resultados.clear();
  }

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
    // C3 — dedup: mesma tool + mesmo input + resultado idêntico já visto nesta sessão → devolve
    // referência curta em vez de reexecutar (o modelo "rele por garantia" é padrão comum).
    // Só para tools de leitura pura (sideEffect "read"); qualquer efeito executa sempre
    // e invalida o cache (o filesystem mudou — leituras antigas ficam obsoletas).
    if (tool.sideEffect === "read") {
      const chave = `${name}|${hashInput(rawInput)}`;
      const visto = this.resultados.get(chave);
      if (visto !== undefined && visto.resultado.type === "text") {
        const seq = visto.seq;
        return {
          type: "text",
          value: `(mesmo resultado da leitura #${seq} — sem alteração)\n${visto.resultado.value}`,
        };
      }
      try {
        const resultado = applyOutputCeiling(await tool.execute(rawInput, context));
        if (resultado.type === "text" && resultado.value.length < 4_000) {
          this.sequencia += 1;
          this.resultados.set(chave, { resultado, seq: this.sequencia });
        }
        return resultado;
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
    try {
      const resultado = applyOutputCeiling(await tool.execute(rawInput, context));
      // tool de efeito rodou → o estado do filesystem mudou; leituras em cache ficam inválidas.
      this.invalidarResultados();
      return resultado;
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

/** Hash estável do input de uma tool (ordena chaves para inputs equivalentes casarem). */
function hashInput(input: unknown): string {
  const canônico = JSON.stringify(input, (chave, valor) =>
    chave === "" || valor === null || typeof valor !== "object"
      ? valor
      : Object.fromEntries(Object.entries(valor as Record<string, unknown>).sort()),
  );
  return createHash("sha256").update(canônico ?? "null").digest("hex").slice(0, 16);
}
