import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PermissionRequest, type ToolContext, Workspace } from "@codingpro/core";
import { afterEach, describe, expect, it } from "vitest";
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

  describe("com prévia de diff", () => {
    let root: string;

    afterEach(async () => {
      if (root !== undefined) {
        await rm(root, { force: true, recursive: true });
      }
    });

    it("mostra o diff antes de perguntar quando há workspace", async () => {
      root = await mkdtemp(join(tmpdir(), "codingpro-previa-"));
      await writeFile(join(root, "a.txt"), "velho");
      const workspace = await Workspace.create(root);
      let progresso = "";
      const { perguntador } = perguntadorFixo("s");
      const aprovador = criarAprovadorInterativo(perguntador, (t) => {
        progresso += t;
      });
      const pedido: PermissionRequest = {
        input: { content: "novo", path: "a.txt" },
        sideEffect: "write",
        toolName: "write_file",
      };
      await aprovador.request(pedido, { workspace } as ToolContext);
      expect(progresso).toContain("── a.txt ──");
      expect(progresso).toContain("- velho");
      expect(progresso).toContain("+ novo");
    });

    it("não mostra prévia para tools sem diff (ex.: bash)", async () => {
      root = await mkdtemp(join(tmpdir(), "codingpro-previa-"));
      const workspace = await Workspace.create(root);
      let progresso = "";
      const { perguntador } = perguntadorFixo("s");
      const aprovador = criarAprovadorInterativo(perguntador, (t) => {
        progresso += t;
      });
      await aprovador.request({ input: { command: "ls" }, sideEffect: "exec", toolName: "bash" }, {
        workspace,
      } as ToolContext);
      expect(progresso).not.toContain("──");
    });

    it("não mostra prévia quando a escrita não altera nada", async () => {
      root = await mkdtemp(join(tmpdir(), "codingpro-previa-"));
      await writeFile(join(root, "a.txt"), "igual");
      const workspace = await Workspace.create(root);
      let progresso = "";
      const { perguntador } = perguntadorFixo("s");
      const aprovador = criarAprovadorInterativo(perguntador, (t) => {
        progresso += t;
      });
      await aprovador.request(
        { input: { content: "igual", path: "a.txt" }, sideEffect: "write", toolName: "write_file" },
        { workspace } as ToolContext,
      );
      expect(progresso).not.toContain("──");
    });
  });
});
