import { describe, expect, it } from "vitest";
import { normalizarInputTool, toolAcceptsInput, type Tool } from "../src/index.js";

const writeFile: Tool = {
  description: "Escreve um arquivo.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      content: { type: "string" },
      path: { type: "string" },
    },
    required: ["path", "content"],
    type: "object",
  },
  name: "write_file",
};

describe("normalizarInputTool", () => {
  it("remove extras de schema fechado antes da validação", () => {
    const result = normalizarInputTool("write_file", writeFile.inputSchema, {
      content: "x".repeat(10_240),
      path: "docs/plano.md",
      overwrite: true,
    });
    expect(result).toEqual({ content: "x".repeat(10_240), path: "docs/plano.md" });
    expect(toolAcceptsInput(writeFile.inputSchema, result)).toBe(true);
  });

  it("aceita aliases seguros e exclusivos de write_file", () => {
    const result = normalizarInputTool("write_file", writeFile.inputSchema, {
      contents: "conteúdo",
      file_path: "docs/plano.md",
    });
    expect(result).toEqual({ content: "conteúdo", path: "docs/plano.md" });
    expect(toolAcceptsInput(writeFile.inputSchema, result)).toBe(true);
  });

  it("falha fechado em alias ambíguo, campo ausente e outra ferramenta", () => {
    const ambiguous = normalizarInputTool("write_file", writeFile.inputSchema, {
      content: "a",
      contents: "b",
      path: "x",
    });
    expect(toolAcceptsInput(writeFile.inputSchema, ambiguous)).toBe(false);
    expect(
      toolAcceptsInput(
        writeFile.inputSchema,
        normalizarInputTool("write_file", writeFile.inputSchema, { path: "x" }),
      ),
    ).toBe(false);
    expect(
      toolAcceptsInput(
        writeFile.inputSchema,
        normalizarInputTool("edit_file", writeFile.inputSchema, {
          contents: "a",
          file_path: "x",
        }),
      ),
    ).toBe(false);
  });
});
