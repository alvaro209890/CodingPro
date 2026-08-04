import type { Tool } from "@codingpro/llm";
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/registry.js";
import {
  DEFAULT_TOOL_OUTPUT_MAX_TOKENS,
  applyOutputCeiling,
  estimateToolTokens,
  textResult,
  truncateToolOutput,
  type ExecutableTool,
} from "../src/tool.js";

describe("truncateToolOutput", () => {
  it("não trunca texto dentro do orçamento", () => {
    const texto = "abc";
    const resultado = truncateToolOutput(texto, 100);
    expect(resultado.truncated).toBe(false);
    expect(resultado.text).toBe(texto);
  });

  it("preserva início e fim com aviso em português", () => {
    const texto = "A".repeat(100_000);
    const maxTokens = 100;
    const resultado = truncateToolOutput(texto, maxTokens);
    expect(resultado.truncated).toBe(true);
    expect(resultado.text.startsWith("A".repeat(100 * 4 * 0.6))).toBe(true);
    expect(resultado.text.endsWith("A".repeat(100 * 4 * 0.3))).toBe(true);
    expect(resultado.text).toContain("truncado:");
    expect(resultado.text).toContain("tokens omitidos");
    expect(resultado.text).toContain(`teto ${maxTokens} tok`);
  });

  it("estimateToolTokens arredonda para cima", () => {
    expect(estimateToolTokens("abcd")).toBe(1);
    expect(estimateToolTokens("abcde")).toBe(2);
  });
});

describe("applyOutputCeiling", () => {
  it("trunca resultados text e error-text", () => {
    const longo = "x".repeat(DEFAULT_TOOL_OUTPUT_MAX_TOKENS * 8);
    const truncado = applyOutputCeiling(textResult(longo), 50);
    expect(truncado.type).toBe("text");
    expect((truncado as { value: string }).value).toContain("truncado:");
    expect(estimateToolTokens((truncado as { value: string }).value)).toBeLessThanOrEqual(80);
  });

  it("mantém json truncando strings longas quando possível", () => {
    const resultado = applyOutputCeiling(
      {
        type: "json",
        value: { campo: "z".repeat(50_000), ok: true },
      },
      200,
    );
    expect(resultado.type === "json" || resultado.type === "text").toBe(true);
    const serializado = JSON.stringify(
      resultado.type === "json" ? resultado.value : (resultado as { value: string }).value,
    );
    expect(estimateToolTokens(serializado)).toBeLessThanOrEqual(DEFAULT_TOOL_OUTPUT_MAX_TOKENS + 50);
  });
});

describe("ToolRegistry output ceiling", () => {
  function toolGrande(): ExecutableTool {
    const definition: Tool = {
      description: "tool de teste",
      inputSchema: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      name: "grande",
    };
    return {
      definition,
      sideEffect: "read",
      execute: async () => textResult("y".repeat(DEFAULT_TOOL_OUTPUT_MAX_TOKENS * 10)),
    };
  }

  it("aplica teto após execute", async () => {
    const registry = new ToolRegistry();
    registry.register(toolGrande());
    const resultado = await registry.run("grande", {}, {
      workspace: { root: process.cwd(), resolve: (p: string) => p, toRelative: (p: string) => p } as never,
    });
    expect(resultado.type).toBe("text");
    expect((resultado as { value: string }).value).toContain("truncado:");
  });
});
