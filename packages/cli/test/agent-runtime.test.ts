import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Provider, ProviderEvent, ToolCall } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AgenteHeadlessIo, executarAgenteHeadless } from "../src/agent-runtime.js";

type Assistant = Extract<ProviderEvent, { type: "finish" }>["message"];

function finish(message: Assistant): ProviderEvent {
  return {
    message,
    reason: message.toolCalls === undefined ? "stop" : "tool-calls",
    type: "finish",
  };
}

function scripted(turns: readonly (readonly ProviderEvent[])[], model = "fake"): Provider {
  let index = 0;
  return {
    capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
    id: "fake",
    model,
    async *stream(_request, options) {
      options?.signal?.throwIfAborted();
      const turn = turns[index];
      index += 1;
      if (turn === undefined) {
        throw new Error("roteiro sem turno");
      }
      for (const event of turn) {
        yield event;
      }
    },
  };
}

describe("executarAgenteHeadless", () => {
  let cwd: string;
  let saida: string;
  let progresso: string;
  let io: AgenteHeadlessIo;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "codingpro-cli-"));
    saida = "";
    progresso = "";
    io = {
      progresso: (texto) => {
        progresso += texto;
      },
      saida: (texto) => {
        saida += texto;
      },
    };
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  it("transmite a resposta de texto para stdout com quebra final", async () => {
    const provider = scripted([
      [{ text: "Olá!", type: "text-delta" }, finish({ content: "Olá!", role: "assistant" })],
    ]);
    await executarAgenteHeadless({ cwd, prompt: "oi", provider }, io);
    expect(saida).toBe("Olá!\n");
    expect(progresso).toBe("");
  });

  it("executa ferramenta de leitura e reporta progresso no stderr", async () => {
    await writeFile(join(cwd, "a.txt"), "conteúdo");
    const call: ToolCall = { id: "c1", input: { path: "a.txt" }, name: "read_file" };
    const provider = scripted([
      [{ call, type: "tool-call" }, finish({ content: "", role: "assistant", toolCalls: [call] })],
      [
        { text: "o arquivo tem conteúdo", type: "text-delta" },
        finish({ content: "o arquivo tem conteúdo", role: "assistant" }),
      ],
    ]);
    await executarAgenteHeadless({ cwd, prompt: "leia a.txt", provider }, io);
    expect(saida).toContain("o arquivo tem conteúdo");
    expect(progresso).toContain("· Lendo a.txt");
    expect(progresso).toContain("✓");
  });

  it("imprime o custo quando o modelo tem tabela de preço", async () => {
    const provider = scripted(
      [
        [
          {
            message: { content: "ok", role: "assistant" },
            reason: "stop",
            type: "finish",
            usage: { inputTokens: 1_000, outputTokens: 100 },
          },
        ],
      ],
      "deepseek-v4-pro",
    );
    await executarAgenteHeadless({ cwd, prompt: "oi", provider }, io);
    expect(progresso).toContain("Custo:");
  });

  it("aborta antes de rodar quando o sinal já está abortado", async () => {
    const provider = scripted([[finish({ content: "x", role: "assistant" })]]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      executarAgenteHeadless({ cwd, prompt: "oi", provider, signal: controller.signal }, io),
    ).rejects.toThrow();
  });

  it("salva o transcrito e devolve o id da sessão", async () => {
    const sessaoDir = join(cwd, "sessoes");
    const provider = scripted([
      [
        { text: "resposta um", type: "text-delta" },
        finish({ content: "resposta um", role: "assistant" }),
      ],
    ]);
    const { sessaoId } = await executarAgenteHeadless(
      { cwd, prompt: "primeira", provider, sessaoDir },
      io,
    );
    expect(sessaoId).toBeDefined();
    expect(progresso).toContain(`Sessão: ${sessaoId}`);
  });

  it("retoma uma sessão salva e continua o transcrito", async () => {
    const sessaoDir = join(cwd, "sessoes");
    const primeiro = scripted([
      [{ text: "um", type: "text-delta" }, finish({ content: "um", role: "assistant" })],
    ]);
    const { sessaoId } = await executarAgenteHeadless(
      { cwd, prompt: "primeira pergunta", provider: primeiro, sessaoDir },
      io,
    );
    if (sessaoId === undefined) {
      throw new Error("esperava id de sessão");
    }

    const requests: string[] = [];
    const segundo: Provider = {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(request) {
        requests.push(JSON.stringify(request));
        yield { text: "dois", type: "text-delta" };
        yield finish({ content: "dois", role: "assistant" });
      },
    };
    const resultado = await executarAgenteHeadless(
      { cwd, prompt: "segunda pergunta", provider: segundo, resumirId: sessaoId, sessaoDir },
      io,
    );
    expect(resultado.sessaoId).toBe(sessaoId);
    // O request retomado carrega a pergunta antiga e a resposta antiga.
    expect(requests[0]).toContain("primeira pergunta");
    expect(requests[0]).toContain("segunda pergunta");
    // O transcrito final tem as duas perguntas do usuário.
    const perguntas = resultado.resultado.messages.filter((m) => m.role === "user");
    expect(perguntas).toHaveLength(2);
  });

  it("--continuar retoma a sessão mais recente", async () => {
    const sessaoDir = join(cwd, "sessoes");
    const um = scripted([
      [{ text: "um", type: "text-delta" }, finish({ content: "um", role: "assistant" })],
    ]);
    const { sessaoId } = await executarAgenteHeadless(
      { cwd, prompt: "pergunta antiga", provider: um, sessaoDir },
      io,
    );

    const requests: string[] = [];
    const dois: Provider = {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(request) {
        requests.push(JSON.stringify(request));
        yield finish({ content: "dois", role: "assistant" });
      },
    };
    const resultado = await executarAgenteHeadless(
      { continuarUltima: true, cwd, prompt: "pergunta nova", provider: dois, sessaoDir },
      io,
    );
    expect(resultado.sessaoId).toBe(sessaoId);
    expect(requests[0]).toContain("pergunta antiga");
    expect(requests[0]).toContain("pergunta nova");
  });

  it("--continuar sem sessão prévia começa uma nova", async () => {
    const sessaoDir = join(cwd, "sessoes");
    const provider = scripted([
      [{ text: "nova", type: "text-delta" }, finish({ content: "nova", role: "assistant" })],
    ]);
    const { sessaoId } = await executarAgenteHeadless(
      { continuarUltima: true, cwd, prompt: "primeira de todas", provider, sessaoDir },
      io,
    );
    expect(sessaoId).toBeDefined();
  });

  it("erro claro ao retomar sessão inexistente", async () => {
    const provider = scripted([[finish({ content: "x", role: "assistant" })]]);
    await expect(
      executarAgenteHeadless(
        { cwd, prompt: "oi", provider, resumirId: "nao-existe", sessaoDir: join(cwd, "sessoes") },
        io,
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("executarAgenteHeadless — skills e hooks (F6)", () => {
  let cwd2: string;
  let saida2: string;
  let io2: AgenteHeadlessIo;

  beforeEach(async () => {
    cwd2 = await mkdtemp(join(tmpdir(), "codingpro-cli-f6-"));
    saida2 = "";
    io2 = {
      progresso: () => {},
      saida: (t) => {
        saida2 += t;
      },
    };
  });

  afterEach(async () => {
    await rm(cwd2, { force: true, recursive: true });
  });

  it("injeta skill relevante no system prompt e roda stop hook", async () => {
    const requests: string[] = [];
    const provider: Provider = {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(request) {
        requests.push(JSON.stringify(request));
        yield { text: "feito", type: "text-delta" };
        yield { message: { content: "feito", role: "assistant" }, reason: "stop", type: "finish" };
      },
    };
    const skills = [
      { body: "rode pnpm build", descricao: "como buildar o projeto", nome: "build" },
    ];
    await executarAgenteHeadless(
      {
        cwd: cwd2,
        hooks: [{ command: "true", event: "stop" }],
        memoriaGlobalDir: join(cwd2, "gm"),
        prompt: "como buildar?",
        provider,
        skills,
      },
      io2,
    );
    const req = JSON.parse(requests[0] ?? "{}") as {
      messages: { role: string; content?: string }[];
    };
    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    expect(system).toContain("Skill: build");
    expect(saida2).toContain("feito");
  });
});
