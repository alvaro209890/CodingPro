import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Provider, ProviderEvent, ToolCall } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ChatIo, executarChat } from "../src/chat-runtime.js";

type Assistant = Extract<ProviderEvent, { type: "finish" }>["message"];

function finish(message: Assistant): ProviderEvent {
  return {
    message,
    reason: message.toolCalls === undefined ? "stop" : "tool-calls",
    type: "finish",
  };
}

function scripted(turns: readonly (readonly ProviderEvent[])[]): {
  provider: Provider;
  requests: string[];
} {
  const requests: string[] = [];
  let index = 0;
  return {
    provider: {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(request) {
        requests.push(JSON.stringify(request));
        const turn = turns[index];
        index += 1;
        if (turn === undefined) {
          throw new Error("roteiro sem turno");
        }
        for (const event of turn) {
          yield event;
        }
      },
    },
    requests,
  };
}

interface Captura {
  io: ChatIo;
  progresso: () => string;
  saida: () => string;
}

function fakeIo(mensagens: readonly (string | undefined)[], respostas: readonly string[]): Captura {
  let saida = "";
  let progresso = "";
  let mi = 0;
  let ri = 0;
  return {
    io: {
      pergunta: async () => respostas[ri++] ?? "n",
      progresso: (texto) => {
        progresso += texto;
      },
      proximaMensagem: async () => mensagens[mi++],
      saida: (texto) => {
        saida += texto;
      },
    },
    progresso: () => progresso,
    saida: () => saida,
  };
}

describe("executarChat", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "codingpro-chat-"));
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  it("responde uma mensagem e encerra no fim da entrada", async () => {
    const { provider } = scripted([
      [{ text: "Olá!", type: "text-delta" }, finish({ content: "Olá!", role: "assistant" })],
    ]);
    const captura = fakeIo(["oi", undefined], []);
    await executarChat({ cwd, provider }, captura.io);
    expect(captura.saida()).toContain("Olá!");
  });

  it("sai imediatamente em /sair sem chamar o provider", async () => {
    const { provider, requests } = scripted([]);
    const captura = fakeIo(["/sair"], []);
    await executarChat({ cwd, provider }, captura.io);
    expect(requests).toEqual([]);
  });

  it("executa efeito quando o usuário aprova", async () => {
    const call: ToolCall = {
      id: "w1",
      input: { content: "olá mundo", path: "novo.txt" },
      name: "write_file",
    };
    const { provider } = scripted([
      [{ call, type: "tool-call" }, finish({ content: "", role: "assistant", toolCalls: [call] })],
      [
        { text: "arquivo criado", type: "text-delta" },
        finish({ content: "arquivo criado", role: "assistant" }),
      ],
    ]);
    const captura = fakeIo(["crie novo.txt", undefined], ["s"]);
    await executarChat({ cwd, provider }, captura.io);
    expect(await readFile(join(cwd, "novo.txt"), "utf8")).toBe("olá mundo");
    expect(captura.progresso()).toContain("Escrevendo novo.txt");
  });

  it("nega o efeito quando o usuário recusa", async () => {
    const call: ToolCall = {
      id: "w1",
      input: { content: "x", path: "negado.txt" },
      name: "write_file",
    };
    const { provider } = scripted([
      [{ call, type: "tool-call" }, finish({ content: "", role: "assistant", toolCalls: [call] })],
      [
        { text: "não pude", type: "text-delta" },
        finish({ content: "não pude", role: "assistant" }),
      ],
    ]);
    const captura = fakeIo(["crie negado.txt", undefined], ["n"]);
    await executarChat({ cwd, provider }, captura.io);
    await expect(readFile(join(cwd, "negado.txt"), "utf8")).rejects.toThrow();
    expect(captura.progresso()).toContain("recusada");
  });

  it("atende os comandos /custo, /limpar e /ajuda sem chamar o provider", async () => {
    const { provider, requests } = scripted([]);
    const captura = fakeIo(["/custo", "/ajuda", "/limpar", "", undefined], []);
    await executarChat({ cwd, provider }, captura.io);
    expect(requests).toEqual([]);
    expect(captura.progresso()).toContain("sem custo ainda");
    expect(captura.progresso()).toContain("histórico esquecido");
    expect(captura.progresso()).toContain("Comandos:");
  });

  it("mantém o histórico entre turnos sem duplicar o system", async () => {
    const { provider, requests } = scripted([
      [{ text: "um", type: "text-delta" }, finish({ content: "um", role: "assistant" })],
      [{ text: "dois", type: "text-delta" }, finish({ content: "dois", role: "assistant" })],
    ]);
    const captura = fakeIo(["primeira", "segunda", undefined], []);
    await executarChat({ cwd, provider }, captura.io);
    const segundo = JSON.parse(requests[1] ?? "{}") as {
      messages: { role: string; content?: string }[];
    };
    expect(segundo.messages.filter((m) => m.role === "system")).toHaveLength(1);
    expect(segundo.messages.filter((m) => m.role === "user")).toHaveLength(2);
  });

  it("salva a sessão a cada turno quando há diretório", async () => {
    const sessaoDir = join(cwd, "sessoes");
    const { provider } = scripted([
      [{ text: "ok", type: "text-delta" }, finish({ content: "ok", role: "assistant" })],
    ]);
    const captura = fakeIo(["oi", undefined], []);
    await executarChat({ cwd, provider, sessaoDir }, captura.io);
    expect(captura.progresso()).toContain("chat do agente");
  });
});
