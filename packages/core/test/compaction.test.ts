import type { ChatMessage } from "@codingpro/llm";
import { describe, expect, it } from "vitest";
import { compactMessages, estimateMessageTokens, resumirDescartados } from "../src/compaction.js";

const sys: ChatMessage = { content: "sistema", role: "system" };
const user = (n: number): ChatMessage => ({ content: `pergunta ${n}`, role: "user" });
const asst = (n: number): ChatMessage => ({ content: `resposta ${n}`, role: "assistant" });
const asstCall = (id: string): ChatMessage => ({
  content: "",
  role: "assistant",
  toolCalls: [{ id, input: { path: "a.txt" }, name: "read_file" }],
});
const toolMsg = (id: string): ChatMessage => ({
  result: { type: "text", value: "conteúdo" },
  role: "tool",
  toolCallId: id,
  toolName: "read_file",
});

/** Cada mensagem "pesa" 1 token, para orçamentos previsíveis nos testes. */
const one = () => 1;

/** Valida a regra de pareamento que o provider exige: nenhum tool órfão. */
function pairingValid(messages: readonly ChatMessage[]): boolean {
  let previous: ChatMessage | undefined;
  for (const message of messages) {
    if (message.role === "tool") {
      const owner = previous?.role === "assistant" && previous.toolCalls !== undefined;
      const chained = previous?.role === "tool";
      if (!owner && !chained) {
        return false;
      }
    }
    previous = message;
  }
  return true;
}

describe("compactMessages", () => {
  it("mantém tudo quando cabe no orçamento", () => {
    const messages = [sys, user(1), asst(1)];
    const result = compactMessages(messages, { estimateTokens: one, maxTokens: 10 });
    expect(result.dropped).toBe(0);
    expect(result.messages).toEqual(messages);
  });

  it("descarta os turnos mais antigos mantendo system + sufixo recente", () => {
    const messages = [sys, user(1), asst(1), user(2), asst(2), user(3)];
    // system(1) + orçamento 3 → mantém as 3 últimas.
    const result = compactMessages(messages, { estimateTokens: one, maxTokens: 4 });
    expect(result.messages[0]).toEqual(sys);
    expect(result.messages.slice(1)).toEqual([user(2), asst(2), user(3)]);
    expect(result.dropped).toBe(2);
    expect(pairingValid(result.messages)).toBe(true);
  });

  it("recua o corte para não deixar um resultado de ferramenta órfão", () => {
    // ...asst(call) tool ... o corte por orçamento cairia no tool; deve puxar o asst dono.
    const messages = [sys, user(1), asst(1), asstCall("c1"), toolMsg("c1"), asst(2)];
    const result = compactMessages(messages, { estimateTokens: one, maxTokens: 3 });
    expect(pairingValid(result.messages)).toBe(true);
    // O sufixo não pode começar com tool.
    expect(result.messages[1]?.role).not.toBe("tool");
  });

  it("mantém o bloco assistant→tool inteiro quando o sufixo começa nele", () => {
    const messages = [sys, user(1), asstCall("c1"), toolMsg("c1"), asst(2)];
    const result = compactMessages(messages, { estimateTokens: one, maxTokens: 4 });
    expect(result.messages).toEqual([sys, asstCall("c1"), toolMsg("c1"), asst(2)]);
    expect(pairingValid(result.messages)).toBe(true);
  });

  it("edge crítico: última mensagem é um tool — puxa o assistant dono, sem órfão", () => {
    const messages = [sys, user(1), asstCall("c1"), toolMsg("c1")];
    const result = compactMessages(messages, { estimateTokens: one, maxTokens: 2 });
    expect(pairingValid(result.messages)).toBe(true);
    expect(result.messages.some((message) => message.role === "assistant")).toBe(true);
  });

  it("recua por um bloco longo de resultados de ferramenta", () => {
    const call: ChatMessage = {
      content: "",
      role: "assistant",
      toolCalls: [
        { id: "a", input: {}, name: "grep" },
        { id: "b", input: {}, name: "grep" },
        { id: "c", input: {}, name: "grep" },
      ],
    };
    const t = (id: string): ChatMessage => ({
      result: { type: "text", value: "x" },
      role: "tool",
      toolCallId: id,
      toolName: "grep",
    });
    const messages = [sys, user(1), call, t("a"), t("b"), t("c")];
    const result = compactMessages(messages, { estimateTokens: one, maxTokens: 2 });
    expect(pairingValid(result.messages)).toBe(true);
    expect(result.messages[1]).toEqual(call);
  });

  it("funciona sem system inicial", () => {
    const messages = [user(1), asst(1), user(2)];
    const result = compactMessages(messages, { estimateTokens: one, maxTokens: 2 });
    expect(result.messages[0]?.role).not.toBe("system");
    expect(result.messages.at(-1)).toEqual(user(2));
  });

  it("system maior que o orçamento ainda mantém ao menos a última mensagem", () => {
    const messages = [sys, user(1), asst(1), user(2)];
    const result = compactMessages(messages, { estimateTokens: one, maxTokens: 0 });
    expect(result.messages[0]).toEqual(sys);
    expect(result.messages.at(-1)).toEqual(user(2));
  });

  it("lida com transcrito vazio e só-system", () => {
    expect(compactMessages([], { maxTokens: 10 })).toEqual({ dropped: 0, messages: [] });
    expect(compactMessages([sys], { maxTokens: 10 })).toEqual({ dropped: 0, messages: [sys] });
  });

  it("estimateMessageTokens cobre todos os papéis", () => {
    expect(estimateMessageTokens(user(1))).toBeGreaterThan(0);
    expect(estimateMessageTokens(asstCall("c1"))).toBeGreaterThan(0);
    expect(estimateMessageTokens(toolMsg("c1"))).toBeGreaterThan(0);
    expect(
      estimateMessageTokens({ content: "x", reasoning: "pensa", role: "assistant" }),
    ).toBeGreaterThan(0);
  });

  // C1 — resumo estruturado dos turnos descartados (v1 determinístico, sem LLM).
  it("C1: resumirDescartados extrai arquivos, decisões e pendências", () => {
    const mensagens: ChatMessage[] = [
      user(1),
      {
        content: "Decidimos usar Fastify para a API.",
        role: "assistant",
        toolCalls: [{ id: "w1", input: { path: "src/server.ts" }, name: "write_file" }],
      },
      {
        result: { type: "error-text", value: "permissão negada" },
        role: "tool",
        toolCallId: "w1",
        toolName: "write_file",
      },
      asst(2),
    ];
    const resumo = resumirDescartados(mensagens);
    expect(resumo).toContain("src/server.ts");
    expect(resumo).toContain("Fastify");
    expect(resumo).toContain("permissão negada");
  });

  it("C1: compactMessages com resumirDescartados injeta resumo na posição system→resumo→sufixo", () => {
    const messages = [
      sys,
      user(1),
      { content: "decisão antiga A", role: "assistant" as const },
      user(2),
      asst(2),
      user(3),
    ];
    const result = compactMessages(messages, {
      estimateTokens: one,
      maxTokens: 4,
      resumirDescartados: true,
    });
    expect(result.resumo).toBeDefined();
    expect(result.resumo).toContain("decisão antiga A");
    // [system][resumo system][sufixo]
    expect(result.messages[0]?.role).toBe("system");
    expect(result.messages[1]?.role).toBe("system");
    expect(String(result.messages[1]?.content)).toContain("Resumo de contexto antigo");
    expect(result.messages.at(-1)).toEqual(user(3));
    expect(pairingValid(result.messages)).toBe(true);
  });

  it("C1: sem resumirDescartados o comportamento é idêntico ao anterior (backward-compat)", () => {
    const messages = [sys, user(1), asst(1), user(2), asst(2), user(3)];
    const com = compactMessages(messages, { estimateTokens: one, maxTokens: 4 });
    expect(com.resumo).toBeUndefined();
    expect(com.messages).toEqual([sys, user(2), asst(2), user(3)]);
    expect(pairingValid(com.messages)).toBe(true);
  });
});
