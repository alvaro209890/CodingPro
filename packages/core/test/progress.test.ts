import type { ToolCall } from "@codingpro/llm";
import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../src/agent.js";
import {
  describeAgentEvent,
  describeToolCall,
  describeToolResult,
  PROGRESS_THINKING,
} from "../src/progress.js";

const call = (name: string, input: ToolCall["input"]): ToolCall => ({ id: "x", input, name });

describe("describeToolCall", () => {
  it("dá o verbo pt-BR de cada ferramenta conhecida", () => {
    expect(describeToolCall(call("read_file", { path: "a.txt" }))).toBe("Lendo a.txt");
    expect(describeToolCall(call("list_dir", {}))).toBe("Listando o projeto");
    expect(describeToolCall(call("list_dir", { path: "src" }))).toBe("Listando src");
    expect(describeToolCall(call("grep", { pattern: "TODO" }))).toBe('Buscando "TODO"');
    expect(describeToolCall(call("write_file", { path: "n.txt" }))).toBe("Escrevendo n.txt");
    expect(describeToolCall(call("bash", { command: "ls -la" }))).toBe("Rodando ls -la");
    expect(describeToolCall(call("mcp_thing", {}))).toBe("Usando mcp_thing");
  });

  it("trunca argumentos longos e cai em rótulo genérico sem argumento", () => {
    expect(describeToolCall(call("grep", { pattern: "x".repeat(100) })).endsWith('…"')).toBe(true);
    expect(describeToolCall(call("read_file", {}))).toBe("Lendo arquivo");
    expect(describeToolCall(call("grep", {}))).toBe("Buscando");
    expect(describeToolCall(call("bash", {}))).toBe("Rodando comando");
    expect(describeToolCall(call("write_file", {}))).toBe("Escrevendo arquivo");
  });
});

describe("describeToolResult", () => {
  const c = call("read_file", { path: "a.txt" });
  it("marca sucesso, erro e negação", () => {
    expect(describeToolResult(c, { type: "text", value: "ok" })).toBe("✓ Lendo a.txt");
    expect(describeToolResult(c, { type: "error-text", value: "x" })).toBe("✗ read_file falhou");
    expect(describeToolResult(c, { type: "execution-denied" })).toBe("✗ read_file não autorizado");
    expect(describeToolResult(c, { type: "error-json", value: {} })).toBe("✗ read_file falhou");
  });
});

describe("describeAgentEvent", () => {
  it("mapeia tool-call e tool-result, ignora texto/raciocínio/step", () => {
    const c = call("bash", { command: "ls" });
    expect(describeAgentEvent({ call: c, type: "tool-call" })).toBe("Rodando ls");
    expect(
      describeAgentEvent({ call: c, result: { type: "text", value: "x" }, type: "tool-result" }),
    ).toBe("✓ Rodando ls");
    const ignored: AgentEvent[] = [
      { text: "oi", type: "text-delta" },
      { text: "pensa", type: "reasoning-delta" },
      { reason: "stop", step: 1, type: "step" },
    ];
    for (const event of ignored) {
      expect(describeAgentEvent(event)).toBeUndefined();
    }
  });

  it("expõe o rótulo de raciocínio", () => {
    expect(PROGRESS_THINKING).toContain("Pensando");
  });
});
