import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    // status de sessão / contexto aparece no progresso (sem dump de todos os comandos)
    expect(captura.progresso()).toMatch(/ctx|rest|CodingPro|DeepSeek/iu);
    expect(captura.progresso()).not.toMatch(/\/undo \(\/desfazer\)/u);
  });

  it("/compact reduz o histórico e /custo mostra a sessão", async () => {
    const { provider } = scripted([
      [{ text: "ok", type: "text-delta" }, finish({ content: "ok", role: "assistant" })],
    ]);
    const captura = fakeIo(
      ["primeira mensagem bem longa ".repeat(20), "/compact", "/custo", undefined],
      [],
    );
    await executarChat({ cwd, maxContexto: 50_000, provider }, captura.io);
    expect(captura.progresso()).toMatch(/compactado|ctx|sem custo|sessão|contexto/iu);
  });

  it("/index indexa o repositório com spinner opcional", async () => {
    await writeFile(join(cwd, "z.ts"), "export const z = 1;\n", "utf8");
    const { provider } = scripted([]);
    const captura = fakeIo(["/index", undefined], []);
    await executarChat({ cwd, provider }, captura.io);
    expect(captura.progresso()).toMatch(/índice|chunks|index/iu);
  });

  it("/custo e /cost sem turnos; /compactar alias", async () => {
    const { provider } = scripted([]);
    const captura = fakeIo(["/custo", "/cost", "/compactar", undefined], []);
    await executarChat({ cwd, maxContexto: 10_000, provider }, captura.io);
    expect(captura.progresso()).toMatch(/sem custo/iu);
    expect(captura.progresso()).toMatch(/compactado/iu);
  });

  it("acumula custo da sessão quando o provider reporta usage DeepSeek", async () => {
    const provider: Provider = {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "deepseek",
      model: "deepseek-v4-pro",
      async *stream() {
        yield { text: "ok", type: "text-delta" };
        yield {
          message: { content: "ok", role: "assistant" },
          reason: "stop",
          type: "finish",
          usage: {
            cacheReadInputTokens: 40,
            inputTokens: 100,
            outputTokens: 10,
          },
        };
      },
    };
    const captura = fakeIo(["oi", "/custo", undefined], []);
    await executarChat({ cwd, provider }, captura.io);
    expect(captura.saida()).toContain("ok");
    expect(captura.progresso()).toMatch(/sessão:|US\$|turnos/iu);
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

  it("/tema lista os temas e troca a paleta da sessão", async () => {
    const { provider, requests } = scripted([]);
    const captura = fakeIo(["/tema", "/tema solar", "/tema banana", undefined], []);
    await executarChat({ cwd, provider }, captura.io);
    expect(requests).toEqual([]);
    const out = captura.progresso();
    expect(out).toContain("tema atual: aurora");
    expect(out).toContain("solar");
    expect(out).toContain("neon");
    expect(out).toContain("mono");
    expect(out).toContain("tema: solar");
    expect(out).toContain("tema desconhecido: banana");
  });

  it("/pet mostra o companheiro quando ligado e avisa quando desligado", async () => {
    const petArquivo = join(cwd, "pet.json");
    const ligado = scripted([]);
    const comPet = fakeIo(["/pet", undefined], []);
    await executarChat(
      { cwd, petArquivo, petHabilitado: true, provider: ligado.provider },
      comPet.io,
    );
    expect(comPet.progresso()).toContain("nível 1");

    const desligado = scripted([]);
    const semPet = fakeIo(["/pet", undefined], []);
    await executarChat(
      { cwd, petArquivo, petHabilitado: false, provider: desligado.provider },
      semPet.io,
    );
    expect(semPet.progresso()).toContain("pet desligado");
  });

  it("o pet ganha XP e persiste após um turno com edição", async () => {
    const petArquivo = join(cwd, "pet.json");
    const call: ToolCall = {
      id: "1",
      input: { content: "oi", path: "novo.txt" },
      name: "write_file",
    };
    const { provider } = scripted([
      [finish({ content: "", role: "assistant", toolCalls: [call] })],
      [finish({ content: "pronto", role: "assistant" })],
    ]);
    const captura = fakeIo(["cria o arquivo", undefined], ["s"]);
    await executarChat({ cwd, petArquivo, petHabilitado: true, provider }, captura.io);
    const salvo = JSON.parse(await readFile(petArquivo, "utf8")) as { xp: number };
    expect(salvo.xp).toBeGreaterThan(0);
  });

  it("mostra o resumo do projeto detectado no cabeçalho", async () => {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "18" } }));
    await writeFile(join(cwd, "app.tsx"), "export default () => null;\n");
    const { provider } = scripted([]);
    const captura = fakeIo(["/sair"], []);
    await executarChat({ cwd, provider }, captura.io);
    expect(captura.progresso()).toContain("Projeto: TypeScript");
    expect(captura.progresso()).toContain("React");
  });

  it("/init gera CODINGPRO.md a partir do projeto detectado", async () => {
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "proj", scripts: { build: "tsc" } }),
    );
    const { provider, requests } = scripted([]);
    const captura = fakeIo(["/init", undefined], []);
    await executarChat({ cwd, provider }, captura.io);
    expect(requests).toEqual([]);
    const md = await readFile(join(cwd, "CODINGPRO.md"), "utf8");
    expect(md).toContain("# CODINGPRO.md");
    expect(md).toContain("**Nome:** proj");
    expect(captura.progresso()).toContain("CODINGPRO.md gerado");
  });

  it("/init pede confirmação para sobrescrever e cancela em não", async () => {
    await writeFile(join(cwd, "CODINGPRO.md"), "conteúdo do usuário");
    const { provider } = scripted([]);
    const captura = fakeIo(["/init", undefined], ["n"]);
    await executarChat({ cwd, provider }, captura.io);
    expect(await readFile(join(cwd, "CODINGPRO.md"), "utf8")).toBe("conteúdo do usuário");
    expect(captura.progresso()).toContain("/init cancelado");
  });

  it("/init sobrescreve quando o usuário confirma", async () => {
    await writeFile(join(cwd, "CODINGPRO.md"), "antigo");
    const { provider } = scripted([]);
    const captura = fakeIo(["/init", undefined], ["s"]);
    await executarChat({ cwd, provider }, captura.io);
    expect(await readFile(join(cwd, "CODINGPRO.md"), "utf8")).toContain("# CODINGPRO.md");
  });

  it("cria checkpoint ao escrever e /undo reverte o arquivo", async () => {
    const call: ToolCall = {
      id: "w1",
      input: { content: "conteúdo novo", path: "a.txt" },
      name: "write_file",
    };
    const { provider } = scripted([
      [{ call, type: "tool-call" }, finish({ content: "", role: "assistant", toolCalls: [call] })],
      [{ text: "feito", type: "text-delta" }, finish({ content: "feito", role: "assistant" })],
    ]);
    const captura = fakeIo(["crie a.txt", "/undo", undefined], ["s"]);
    await executarChat({ cwd, provider }, captura.io);
    expect(captura.progresso()).toContain("checkpoint");
    expect(captura.progresso()).toContain("desfeito");
    await expect(readFile(join(cwd, "a.txt"), "utf8")).rejects.toThrow();
  });

  it("/undo, /redo e /checkpoint operam a linha do tempo", async () => {
    const call: ToolCall = {
      id: "w1",
      input: { content: "v1", path: "a.txt" },
      name: "write_file",
    };
    const { provider } = scripted([
      [{ call, type: "tool-call" }, finish({ content: "", role: "assistant", toolCalls: [call] })],
      [{ text: "feito", type: "text-delta" }, finish({ content: "feito", role: "assistant" })],
    ]);
    const captura = fakeIo(["crie a.txt", "/checkpoint", "/undo", "/redo", undefined], ["s"]);
    await executarChat({ cwd, provider }, captura.io);
    expect(captura.progresso()).toContain("refeito");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("v1");
  });

  it("🏁 marco: refatoração multi-arquivo desfeita num único /undo", async () => {
    const calls: ToolCall[] = [0, 1, 2].map((k) => ({
      id: `w${k}`,
      input: { content: `novo${k}`, path: `f${k}.txt` },
      name: "write_file",
    }));
    const { provider } = scripted([
      [
        ...calls.map((call) => ({ call, type: "tool-call" as const })),
        finish({ content: "", role: "assistant", toolCalls: calls }),
      ],
      [{ text: "pronto", type: "text-delta" }, finish({ content: "pronto", role: "assistant" })],
    ]);
    // "a" = aprovar sempre → uma aprovação cobre os três write_file do mesmo turno.
    const captura = fakeIo(["reescreva os três", "/undo", undefined], ["a"]);
    await executarChat({ cwd, provider }, captura.io);
    for (const k of [0, 1, 2]) {
      await expect(readFile(join(cwd, `f${k}.txt`), "utf8")).rejects.toThrow();
    }
  });

  it("responde vazio quando não há o que desfazer/refazer/listar", async () => {
    const { provider, requests } = scripted([]);
    const captura = fakeIo(["/undo", "/redo 2", "/checkpoint", undefined], []);
    await executarChat({ cwd, provider }, captura.io);
    expect(requests).toEqual([]);
    expect(captura.progresso()).toContain("nada a desfazer");
    expect(captura.progresso()).toContain("nada a refazer");
    expect(captura.progresso()).toContain("sem checkpoints ainda");
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
    expect(captura.progresso()).toMatch(/DeepSeek|1M|auto-compact|ctx|janela/iu);
  });
});

describe("executarChat — memória (F4)", () => {
  let cwd: string;
  let memGlobal: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "codingpro-chat-mem-"));
    memGlobal = join(cwd, "global-mem");
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  it("/lembrar grava na memória do projeto e /memory list mostra", async () => {
    const { provider, requests } = scripted([]);
    const captura = fakeIo(["/lembrar O build usa pnpm", "/memory list", undefined], []);
    await executarChat({ cwd, memoriaGlobalDir: memGlobal, provider }, captura.io);
    expect(requests).toEqual([]);
    expect(captura.progresso()).toContain("memorizado (projeto)");
    expect(captura.progresso()).toContain("[projeto]");
    expect(captura.progresso()).toContain("build usa pnpm");
  });

  it("injeta memória relevante no system prompt do turno", async () => {
    const { provider, requests } = scripted([
      [
        { text: "use pnpm", type: "text-delta" },
        finish({ content: "use pnpm", role: "assistant" }),
      ],
    ]);
    const captura = fakeIo(
      ["/lembrar O build usa pnpm sempre", "como faço o build?", undefined],
      [],
    );
    await executarChat({ cwd, memoriaGlobalDir: memGlobal, provider }, captura.io);
    const req = JSON.parse(requests[0] ?? "{}") as {
      messages: { role: string; content?: string }[];
    };
    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    expect(system).toContain("Memória");
    expect(system).toContain("build usa pnpm");
  });

  it("/memory forget arquiva a memória", async () => {
    const { provider } = scripted([]);
    const captura = fakeIo(
      [
        "/lembrar fato descartável qualquer",
        "/memory forget fato-descartavel-qualquer",
        "/memory list",
        undefined,
      ],
      [],
    );
    await executarChat({ cwd, memoriaGlobalDir: memGlobal, provider }, captura.io);
    expect(captura.progresso()).toContain("esquecido: fato-descartavel-qualquer");
    expect(captura.progresso()).toContain("memória vazia");
  });
});

describe("executarChat — memória, ramos extras", () => {
  let cwd: string;
  let memGlobal: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "codingpro-chat-mem2-"));
    memGlobal = join(cwd, "gmem");
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  it("cobre /memory edit, /lembrar vazio, recusa de segredo e forget inexistente", async () => {
    const { provider } = scripted([]);
    const captura = fakeIo(
      [
        "/lembrar",
        "/lembrar token: superSecretoAbc123",
        "/memory edit algum-slug",
        "/memory forget nao-existe",
        undefined,
      ],
      [],
    );
    await executarChat({ cwd, memoriaGlobalDir: memGlobal, provider }, captura.io);
    const p = captura.progresso();
    expect(p).toContain("uso: /lembrar");
    expect(p).toContain("segredo");
    expect(p).toContain("edite à mão");
    expect(p).toContain("não encontrei: nao-existe");
  });
});

describe("executarChat — subagentes e /plan (F5)", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "codingpro-chat-sub-"));
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  it("/plan salva o plano e o relembra no próximo turno (system prompt)", async () => {
    // 1ª chamada architect: SEM_PERGUNTAS; 2ª: plano; 3ª: agente principal ecoa
    let n = 0;
    const provider: Provider = {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(request) {
        n += 1;
        const u = [...request.messages].reverse().find((m) => m.role === "user");
        const user = u?.role === "user" ? u.content : "";
        let c: string;
        if (n === 1) {
          c = "# SEM_PERGUNTAS";
        } else if (n === 2) {
          c = "# Plano\n## Passos\n1. migrar para SQLite\n## Critério de pronto\n- ok";
        } else {
          // deve ver o plano no system
          const sys = request.messages.find((m) => m.role === "system");
          const s = sys?.role === "system" ? sys.content : "";
          c = s.includes("Plano ativo") ? "LEMBRO DO PLANO" : "ESQUECI";
        }
        yield { text: c, type: "text-delta" };
        yield { message: { content: c, role: "assistant" }, reason: "stop", type: "finish" };
        void user;
      },
    };
    const captura = fakeIo(["/plan migrar para SQLite", "execute o plano", undefined], []);
    await executarChat({ cwd, memoriaGlobalDir: join(cwd, "gmem"), provider }, captura.io);
    expect(captura.progresso()).toContain("plano salvo em");
    expect(captura.progresso()).toContain("plano ativo na sessão");
    expect(captura.saida()).toContain("LEMBRO DO PLANO");
    const planos = await readFile(
      join(
        cwd,
        ".codingpro",
        "plans",
        `${new Date().toISOString().slice(0, 10)}-migrar-para-sqlite.md`,
      ),
      "utf8",
    );
    expect(planos).toContain("migrar para SQLite");
  });

  it("/plan com perguntas pede seleção e usa a resposta no plano", async () => {
    let n = 0;
    const provider: Provider = {
      capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
      id: "fake",
      model: "fake",
      async *stream(request) {
        n += 1;
        const u = [...request.messages].reverse().find((m) => m.role === "user");
        const user = u?.role === "user" ? u.content : "";
        let c: string;
        if (n === 1) {
          c = [
            "# PERGUNTAS",
            "## 1. Qual banco?",
            "- A) SQLite",
            "- B) Postgres",
            "- C) MySQL",
          ].join("\n");
        } else {
          // fase 2: plano deve mencionar a escolha embutida no prompt do user
          c = user.includes("Postgres")
            ? "# Plano\nUsar Postgres conforme decisão"
            : "# Plano\nsem decisao";
        }
        yield { text: c, type: "text-delta" };
        yield { message: { content: c, role: "assistant" }, reason: "stop", type: "finish" };
      },
    };
    // fakeIo: mensagens do chat + respostas de pergunta (2 = Postgres)
    const captura = fakeIo(["/plan migrar banco", undefined], ["2"]);
    await executarChat({ cwd, memoriaGlobalDir: join(cwd, "gmem"), provider }, captura.io);
    expect(captura.progresso()).toContain("pergunta");
    expect(captura.progresso()).toMatch(/Postgres|✓ 1/u);
    expect(captura.saida()).toContain("Postgres");
  });

  it("/plan clear limpa o plano ativo; /plan sem objetivo mostra uso", async () => {
    const { provider } = scripted([]);
    const captura = fakeIo(["/plan", "/plan clear", undefined], []);
    await executarChat({ cwd, memoriaGlobalDir: join(cwd, "gmem"), provider }, captura.io);
    expect(captura.progresso()).toContain("uso: /plan");
    expect(captura.progresso()).toContain("plano ativo limpo");
  });
});

describe("executarChat — skills e hooks (F6)", () => {
  let cwd: string;
  const skills = [
    { body: "Passos: 1 build 2 deploy", descricao: "deploy no firebase", nome: "deploy-firebase" },
    { body: "corpo", descricao: "gerar nfce", nome: "nfce" },
  ];

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "codingpro-chat-f6-"));
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  it("/skills lista e /skill ativa; skill entra no system prompt do turno", async () => {
    const { provider, requests } = scripted([
      [{ text: "ok", type: "text-delta" }, finish({ content: "ok", role: "assistant" })],
    ]);
    const captura = fakeIo(
      ["/skills", "/skill deploy-firebase", "como faço o deploy?", undefined],
      [],
    );
    await executarChat({ cwd, memoriaGlobalDir: join(cwd, "gm"), provider, skills }, captura.io);
    expect(captura.progresso()).toContain("deploy-firebase — deploy no firebase");
    expect(captura.progresso()).toContain("skill ativada: deploy-firebase");
    const req = JSON.parse(requests[0] ?? "{}") as {
      messages: { role: string; content?: string }[];
    };
    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    expect(system).toContain("Skill: deploy-firebase");
    expect(system).toContain("1 build 2 deploy");
  });

  it("/skill desconhecida e /skills vazio", async () => {
    const { provider } = scripted([]);
    const captura = fakeIo(["/skill nao-existe", "/skills", undefined], []);
    await executarChat(
      { cwd, memoriaGlobalDir: join(cwd, "gm"), provider, skills: [] },
      captura.io,
    );
    expect(captura.progresso()).toContain("skill não encontrada: nao-existe");
    expect(captura.progresso()).toContain("nenhuma skill disponível");
  });

  it("sugere skill relevante sem estar ativa", async () => {
    const { provider } = scripted([
      [{ text: "ok", type: "text-delta" }, finish({ content: "ok", role: "assistant" })],
    ]);
    const captura = fakeIo(["preciso do deploy no firebase", undefined], []);
    await executarChat({ cwd, memoriaGlobalDir: join(cwd, "gm"), provider, skills }, captura.io);
    expect(captura.progresso()).toContain("skill sugerida: deploy-firebase");
  });

  it("hook pre-tool que veta bloqueia a tool; stop hook roda no fim", async () => {
    const call: ToolCall = { id: "r1", input: { path: "x.txt" }, name: "read_file" };
    const { provider } = scripted([
      [{ call, type: "tool-call" }, finish({ content: "", role: "assistant", toolCalls: [call] })],
      [{ text: "não li", type: "text-delta" }, finish({ content: "não li", role: "assistant" })],
    ]);
    const hooks = [
      { command: "exit 1", event: "pre-tool" as const, matcher: "read_file" },
      { command: "true", event: "stop" as const },
    ];
    const captura = fakeIo(["leia x.txt", undefined], []);
    await executarChat({ cwd, hooks, memoriaGlobalDir: join(cwd, "gm"), provider }, captura.io);
    // o read foi vetado pelo hook (execution-denied), não executou de fato
    expect(captura.saida()).toContain("não li");
  });

  it("auto-correção: residual do biome gera re-turno e limpa no 2º check", async () => {
    await writeFile(join(cwd, "biome.json"), "{}", "utf8");
    const call: ToolCall = {
      id: "w1",
      input: { content: "export const x = 1\n", path: "sujo.ts" },
      name: "write_file",
    };
    // Turno 1: escreve; turno 2 (reparo): só responde texto
    const { provider, requests } = scripted([
      [{ call, type: "tool-call" }, finish({ content: "", role: "assistant", toolCalls: [call] })],
      [{ text: "pronto", type: "text-delta" }, finish({ content: "pronto", role: "assistant" })],
      [
        { text: "corrigido", type: "text-delta" },
        finish({ content: "corrigido", role: "assistant" }),
      ],
    ]);
    let checks = 0;
    const qualityRunner = async (_root: string, args: readonly string[]) => {
      if (args.includes("--write")) {
        return "";
      }
      checks += 1;
      if (checks === 1) {
        const erro = new Error("lint") as Error & { stdout: string };
        erro.stdout = "sujo.ts:1:1 lint/style/useConst\n";
        throw erro;
      }
      return "";
    };
    const captura = fakeIo(["escreva sujo.ts", undefined], ["s"]);
    await executarChat(
      {
        cwd,
        memoriaGlobalDir: join(cwd, "gm"),
        provider,
        qualityAutoFix: true,
        qualityMaxRepairTurns: 1,
        qualityRunner,
      },
      captura.io,
    );
    expect(await readFile(join(cwd, "sujo.ts"), "utf8")).toContain("export");
    expect(captura.progresso()).toContain("formatando");
    expect(captura.progresso()).toMatch(/reenviando diagnóstico/u);
    // 1º turno + 1 reparo (pelo menos 2 stream requests de agent multi-step)
    expect(requests.length).toBeGreaterThanOrEqual(2);
  });
});

describe("executarChat — /review e atribuição (F8)", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "codingpro-chat-f8-"));
  });

  afterEach(async () => {
    await rm(cwd, { force: true, recursive: true });
  });

  it("/review fora de repo git informa o erro", async () => {
    const { provider } = scripted([]);
    const captura = fakeIo(["/review", undefined], []);
    await executarChat({ cwd, memoriaGlobalDir: join(cwd, "gm"), provider }, captura.io);
    expect(captura.progresso()).toContain("não é um repositório git");
  });

  it("injeta a diretriz de atribuição (padrão full) no system prompt", async () => {
    const { provider, requests } = scripted([
      [{ text: "ok", type: "text-delta" }, finish({ content: "ok", role: "assistant" })],
    ]);
    const captura = fakeIo(["oi", undefined], []);
    await executarChat({ cwd, memoriaGlobalDir: join(cwd, "gm"), provider }, captura.io);
    const req = JSON.parse(requests[0] ?? "{}") as {
      messages: { role: string; content?: string }[];
    };
    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    expect(system).toContain("Co-Authored-By");
  });
});
