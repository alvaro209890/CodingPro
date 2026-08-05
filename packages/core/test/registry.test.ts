import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoreError } from "../src/errors.js";
import { ToolRegistry } from "../src/registry.js";
import { type ExecutableTool, errorResult, type ToolContext, textResult } from "../src/tool.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

function tool(name: string, execute: ExecutableTool["execute"]): ExecutableTool {
  const definition: Tool = {
    description: `Tool de teste ${name}.`,
    inputSchema: {
      additionalProperties: false,
      properties: { valor: { type: "string" } },
      required: ["valor"],
      type: "object",
    },
    name,
  };
  return { definition, execute, sideEffect: "read" };
}

describe("ToolRegistry", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("registra, consulta e lista definições ordenadas", () => {
    const registry = new ToolRegistry();
    registry
      .register(tool("zeta", async () => textResult("z")))
      .register(tool("alfa", async () => textResult("a")));
    expect(registry.has("alfa")).toBe(true);
    expect(registry.get("zeta")).toBeDefined();
    expect(registry.get("ausente")).toBeUndefined();
    expect(registry.definitions().map((definition) => definition.name)).toEqual(["alfa", "zeta"]);
  });

  it("recusa definição inválida e nome duplicado", () => {
    const registry = new ToolRegistry();
    const invalid = { definition: { name: "x" }, execute: async () => textResult("x") };
    expect(() => registry.register(invalid as unknown as ExecutableTool)).toThrow(CoreError);
    registry.register(tool("dup", async () => textResult("1")));
    expect(() => registry.register(tool("dup", async () => textResult("2")))).toThrow(CoreError);
  });

  it("converte tool desconhecida e input inválido em error-text", async () => {
    const registry = new ToolRegistry();
    registry.register(tool("eco", async (input) => textResult(String(input.valor))));

    const unknown = await registry.run("inexistente", { valor: "x" }, context);
    expect(unknown).toMatchObject({ type: "error-text" });

    const badInput = await registry.run("eco", { valor: 123 }, context);
    expect(badInput).toMatchObject({ type: "error-text" });
  });

  it("executa a tool e devolve o resultado", async () => {
    const registry = new ToolRegistry();
    registry.register(tool("eco", async (input: JsonObject) => textResult(String(input.valor))));
    const result = await registry.run("eco", { valor: "olá" }, context);
    expect(result).toEqual<ToolResult>({ type: "text", value: "olá" });
  });

  it("recusa antes de executar quando o sinal já está abortado", async () => {
    const registry = new ToolRegistry();
    let ran = false;
    registry.register(
      tool("eco", async () => {
        ran = true;
        return textResult("x");
      }),
    );
    const controller = new AbortController();
    controller.abort();
    const result = await registry.run(
      "eco",
      { valor: "x" },
      { ...context, signal: controller.signal },
    );
    expect(ran).toBe(false);
    expect(result).toMatchObject({ type: "error-text" });
  });

  it("mapeia CoreError, AbortError e erro genérico para error-text", async () => {
    const registry = new ToolRegistry();
    registry.register(
      tool("core", async () => {
        throw new CoreError("execution-failed", "falha controlada");
      }),
    );
    registry.register(
      tool("abort", async () => {
        throw new DOMException("cancelado", "AbortError");
      }),
    );
    registry.register(
      tool("boom", async () => {
        throw new Error("detalhe interno sensível");
      }),
    );

    const core = await registry.run("core", { valor: "x" }, context);
    expect(core).toEqual(errorResult("falha controlada"));

    const abort = await registry.run("abort", { valor: "x" }, context);
    expect(abort).toMatchObject({ type: "error-text" });

    const boom = await registry.run("boom", { valor: "x" }, context);
    expect(boom).toMatchObject({ type: "error-text" });
    expect((boom as { value: string }).value).not.toContain("sensível");
  });

  // C3 — dedup de resultados idênticos (doc 06): releitura "por garantia" não reexecuta.
  it("C3: releitura do mesmo input devolve referência curta sem reexecutar", async () => {
    const registry = new ToolRegistry();
    let execucoes = 0;
    registry.register(
      tool("eco", async (input: JsonObject) => {
        execucoes += 1;
        return textResult(`valor=${String(input.valor)}`);
      }),
    );

    const primeira = await registry.run("eco", { valor: "olá" }, context);
    const segunda = await registry.run("eco", { valor: "olá" }, context);

    expect(execucoes).toBe(1); // 2ª chamada veio do cache
    expect(primeira).toEqual<ToolResult>({ type: "text", value: "valor=olá" });
    expect(segunda.type).toBe("text");
    expect((segunda as { value: string }).value).toContain("mesmo resultado da leitura");
  });

  it("C3: input diferente não deduplica", async () => {
    const registry = new ToolRegistry();
    let execucoes = 0;
    registry.register(
      tool("eco", async (input: JsonObject) => {
        execucoes += 1;
        return textResult(`valor=${String(input.valor)}`);
      }),
    );
    await registry.run("eco", { valor: "a" }, context);
    await registry.run("eco", { valor: "b" }, context);
    expect(execucoes).toBe(2);
  });

  it("C3: tool de efeito invalida o cache de leituras", async () => {
    const registry = new ToolRegistry();
    let leituras = 0;
    registry.register(
      tool("ler", async () => {
        leituras += 1;
        return textResult("conteúdo");
      }),
    );
    const muta: ExecutableTool = {
      ...tool("muta", async () => textResult("ok")),
      sideEffect: "write",
    };
    registry.register(muta);

    await registry.run("ler", { valor: "x" }, context);
    await registry.run("ler", { valor: "x" }, context); // cache
    expect(leituras).toBe(1);
    await registry.run("muta", { valor: "x" }, context); // invalida
    await registry.run("ler", { valor: "x" }, context); // reexecuta
    expect(leituras).toBe(2);
  });
});
