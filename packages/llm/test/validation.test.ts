import { describe, expect, it } from "vitest";
import type { ChatRequest, Tool } from "../src/index.js";
import { isChatRequest, isTool, toolAcceptsInput } from "../src/validation.js";

const analisar: Tool = {
  description: "Valida todos os tipos suportados pelo contrato.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      ativo: { type: "boolean" },
      itens: { items: { type: "number" }, type: "array" },
      modo: { enum: ["rápido", "seguro"], type: "string" },
      quantidade: { type: "integer" },
      contexto: {
        additionalProperties: false,
        properties: { nome: { type: "string" } },
        required: ["nome"],
        type: "object",
      },
    },
    required: ["ativo", "itens", "modo", "quantidade", "contexto"],
    type: "object",
  },
  name: "analisar",
};

describe("validação do contrato Tool", () => {
  it("aceita o subconjunto JSON Schema documentado e valida o input sem coerção", () => {
    expect(isTool(analisar)).toBe(true);
    expect(
      toolAcceptsInput(analisar.inputSchema, {
        ativo: true,
        contexto: { nome: "CodingPro" },
        itens: [1, 2.5],
        modo: "seguro",
        quantidade: 2,
      }),
    ).toBe(true);
    expect(
      toolAcceptsInput(analisar.inputSchema, {
        ativo: true,
        contexto: { nome: "CodingPro" },
        itens: [1],
        modo: "inventado",
        quantidade: 2,
      }),
    ).toBe(false);
    expect(
      toolAcceptsInput(analisar.inputSchema, {
        ativo: true,
        contexto: { nome: "CodingPro", extra: true },
        itens: [1],
        modo: "seguro",
        quantidade: 2.5,
      }),
    ).toBe(false);
  });

  it.each([
    {
      label: "nome perigoso",
      tool: { ...analisar, name: "__proto__" },
    },
    {
      label: "propriedades adicionais",
      tool: {
        ...analisar,
        inputSchema: { ...analisar.inputSchema, additionalProperties: true },
      },
    },
    {
      label: "keyword fora do subconjunto",
      tool: {
        ...analisar,
        inputSchema: { ...analisar.inputSchema, $ref: "https://exemplo.invalid/schema" },
      },
    },
    {
      label: "required duplicado",
      tool: {
        ...analisar,
        inputSchema: { ...analisar.inputSchema, required: ["ativo", "ativo"] },
      },
    },
    {
      label: "required inexistente",
      tool: {
        ...analisar,
        inputSchema: { ...analisar.inputSchema, required: ["ausente"] },
      },
    },
    {
      label: "descrição com controle",
      tool: { ...analisar, description: "inválida\r" },
    },
  ])("rejeita $label", ({ tool }) => {
    expect(isTool(tool)).toBe(false);
  });

  it("rejeita ciclos, números não finitos e chaves de prototype no input", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const polluted = JSON.parse('{"__proto__":{"admin":true}}') as Record<string, unknown>;

    expect(toolAcceptsInput(analisar.inputSchema, cyclic)).toBe(false);
    expect(toolAcceptsInput(analisar.inputSchema, new Date())).toBe(false);
    expect(
      toolAcceptsInput(analisar.inputSchema, {
        ativo: true,
        contexto: { nome: "ok" },
        itens: [Number.NaN],
        modo: "seguro",
        quantidade: 1,
      }),
    ).toBe(false);
    expect(toolAcceptsInput(analisar.inputSchema, polluted)).toBe(false);
  });

  it("rejeita accessors, símbolos e propriedades não enumeráveis no schema e no input", () => {
    const schemaWithToJson = structuredClone(analisar.inputSchema) as unknown as Record<
      PropertyKey,
      unknown
    >;
    Object.defineProperty(schemaWithToJson, "toJSON", {
      enumerable: false,
      value: () => ({ type: "string" }),
    });
    const schemaWithAccessor = structuredClone(analisar.inputSchema) as unknown as Record<
      PropertyKey,
      unknown
    >;
    Object.defineProperty(schemaWithAccessor, "description", {
      enumerable: true,
      get: () => "não deve ser executado",
    });
    const schemaWithSymbol = structuredClone(analisar.inputSchema) as unknown as Record<
      PropertyKey,
      unknown
    >;
    schemaWithSymbol[Symbol("oculto")] = true;

    expect(isTool({ ...analisar, inputSchema: schemaWithToJson })).toBe(false);
    expect(isTool({ ...analisar, inputSchema: schemaWithAccessor })).toBe(false);
    expect(isTool({ ...analisar, inputSchema: schemaWithSymbol })).toBe(false);

    const createValidInput = (): Record<PropertyKey, unknown> => ({
      ativo: true,
      contexto: { nome: "CodingPro" },
      itens: [1],
      modo: "seguro",
      quantidade: 1,
    });
    const inputWithToJson = createValidInput();
    const inputWithAccessor = createValidInput();
    const inputWithSymbol = createValidInput();
    Object.defineProperty(inputWithToJson, "toJSON", { enumerable: false, value: () => ({}) });
    Object.defineProperty(inputWithAccessor, "quantidade", {
      configurable: true,
      enumerable: true,
      get: () => 1,
    });
    inputWithSymbol[Symbol("oculto")] = true;

    expect(toolAcceptsInput(analisar.inputSchema, inputWithToJson)).toBe(false);
    expect(toolAcceptsInput(analisar.inputSchema, inputWithAccessor)).toBe(false);
    expect(toolAcceptsInput(analisar.inputSchema, inputWithSymbol)).toBe(false);
  });

  it("faz cumprir limites de profundidade e tamanho do schema e do input", () => {
    let nested: Record<string, unknown> = { type: "string" };
    for (let depth = 0; depth < 18; depth += 1) {
      nested = { items: nested, type: "array" };
    }
    const deepTool = {
      ...analisar,
      inputSchema: {
        additionalProperties: false,
        properties: { nested },
        type: "object",
      },
    };
    const largeSchemaTool = {
      ...analisar,
      inputSchema: {
        additionalProperties: false,
        properties: {
          texto: {
            enum: Array.from({ length: 128 }, (_, index) => `${index}-${"a".repeat(600)}`),
            type: "string",
          },
        },
        required: ["texto"],
        type: "object",
      },
    };
    const texto: Tool = {
      description: "Recebe texto.",
      inputSchema: {
        additionalProperties: false,
        properties: { valor: { type: "string" } },
        required: ["valor"],
        type: "object",
      },
      name: "texto",
    };

    expect(isTool(deepTool)).toBe(false);
    expect(isTool(largeSchemaTool)).toBe(false);
    expect(toolAcceptsInput(texto.inputSchema, { valor: "á".repeat(140_000) })).toBe(false);
  });
});

describe("validação do transcript multi-turno", () => {
  const call = {
    id: "call_analisar_1",
    input: {
      ativo: true,
      contexto: { nome: "CodingPro" },
      itens: [1],
      modo: "seguro",
      quantidade: 1,
    },
    name: "analisar",
  } as const;
  const assistant = {
    content: "",
    reasoning: "vou analisar",
    role: "assistant" as const,
    toolCalls: [call],
  };
  const valid: ChatRequest = {
    messages: [
      { content: "analise", role: "user" },
      assistant,
      {
        result: { type: "json", value: { ok: true } },
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
      },
    ],
    toolChoice: "none",
    tools: [analisar],
  };

  it("aceita call e resultado adjacente com ID e nome correspondentes", () => {
    expect(isChatRequest(valid)).toBe(true);
  });

  it("mede resultados textuais pelo tamanho UTF-8, não por caracteres", () => {
    const oversized: ChatRequest = {
      ...valid,
      messages: [
        { content: "analise", role: "user" },
        assistant,
        {
          result: { type: "text", value: "á".repeat(600_000) },
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
        },
      ],
    };

    expect(isChatRequest(oversized)).toBe(false);
  });

  it.each([
    { label: "lista vazia", request: { messages: [] } },
    {
      label: "call pendente",
      request: { ...valid, messages: [{ content: "analise", role: "user" }, assistant] },
    },
    {
      label: "mensagem entre call e resultado",
      request: {
        ...valid,
        messages: [
          { content: "analise", role: "user" },
          assistant,
          { content: "interrompe", role: "user" },
        ],
      },
    },
    {
      label: "ID desconhecido",
      request: {
        ...valid,
        messages: [
          { content: "analise", role: "user" },
          assistant,
          {
            result: { type: "text", value: "ok" },
            role: "tool",
            toolCallId: "call_desconhecida",
            toolName: call.name,
          },
        ],
      },
    },
    {
      label: "nome divergente",
      request: {
        ...valid,
        messages: [
          { content: "analise", role: "user" },
          assistant,
          {
            result: { type: "text", value: "ok" },
            role: "tool",
            toolCallId: call.id,
            toolName: "outra",
          },
        ],
      },
    },
    { label: "tools duplicadas", request: { ...valid, tools: [analisar, analisar] } },
    {
      label: "tool choice sem tools",
      request: { messages: [{ content: "olá", role: "user" }], toolChoice: "auto" },
    },
    {
      label: "tool choice textual inválida",
      request: { ...valid, toolChoice: "sempre" },
    },
    {
      label: "tool choice desconhecida",
      request: { ...valid, toolChoice: { toolName: "outra" } },
    },
    {
      label: "campo extra",
      request: { ...valid, campoInesperado: true },
    },
    {
      label: "call de tool não declarada",
      request: {
        ...valid,
        messages: [
          { content: "analise", role: "user" },
          { ...assistant, toolCalls: [{ ...call, name: "outra" }] },
          {
            result: { type: "text", value: "ok" },
            role: "tool",
            toolCallId: call.id,
            toolName: "outra",
          },
        ],
      },
    },
  ])("rejeita $label", ({ request }) => {
    expect(isChatRequest(request)).toBe(false);
  });
});
