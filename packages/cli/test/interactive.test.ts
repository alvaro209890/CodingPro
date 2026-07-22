import type { PermissionRequest, ToolContext } from "@codingpro/core";
import { describe, expect, it } from "vitest";
import { criarAprovadorInterativo, type Perguntador } from "../src/interactive.js";

const ctx = {} as ToolContext;
const pedido: PermissionRequest = {
  input: { path: "novo.txt" },
  sideEffect: "write",
  toolName: "write_file",
};

function perguntadorFixo(resposta: string): { perguntador: Perguntador; perguntas: string[] } {
  const perguntas: string[] = [];
  return {
    perguntador: {
      pergunta: async (texto) => {
        perguntas.push(texto);
        return resposta;
      },
    },
    perguntas,
  };
}

describe("criarAprovadorInterativo", () => {
  it("mostra a ação pt-BR e aprova uma vez com 's'", async () => {
    const { perguntador, perguntas } = perguntadorFixo("s");
    const aprovador = criarAprovadorInterativo(perguntador, () => {});
    expect(await aprovador.request(pedido, ctx)).toBe("approve-once");
    expect(perguntas[0]).toContain("Escrevendo novo.txt");
  });

  it("aprova sempre com 'sempre'", async () => {
    const { perguntador } = perguntadorFixo("sempre");
    const aprovador = criarAprovadorInterativo(perguntador, () => {});
    expect(await aprovador.request(pedido, ctx)).toBe("approve-always");
  });

  it("nega e avisa em qualquer outra resposta", async () => {
    let progresso = "";
    const { perguntador } = perguntadorFixo("não");
    const aprovador = criarAprovadorInterativo(perguntador, (t) => {
      progresso += t;
    });
    expect(await aprovador.request(pedido, ctx)).toBe("deny");
    expect(progresso).toContain("recusada");
  });

  it("funciona sem input, usando rótulo genérico", async () => {
    const { perguntador, perguntas } = perguntadorFixo("y");
    const aprovador = criarAprovadorInterativo(perguntador, () => {});
    expect(await aprovador.request({ sideEffect: "exec", toolName: "bash" }, ctx)).toBe(
      "approve-once",
    );
    expect(perguntas[0]).toContain("Rodando comando");
  });
});
