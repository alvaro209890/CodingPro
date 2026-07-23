import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Provider, type ProviderEvent, ProviderError, ReplayProvider } from "@codingpro/llm";
import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/config.js";
import { criarPrograma, executarCli, executarPrograma, type CliIo } from "../src/program.js";

function providerRoteirizado(turns: readonly (readonly ProviderEvent[])[]): Provider {
  let indice = 0;
  return {
    capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
    id: "fake",
    model: "fake",
    async *stream(_request, options) {
      options?.signal?.throwIfAborted();
      const turno = turns[indice];
      indice += 1;
      if (turno === undefined) {
        throw new Error("roteiro sem turno");
      }
      for (const evento of turno) {
        yield evento;
      }
    },
  };
}

function capturarSaida(): { io: CliIo; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];

  return {
    io: {
      stderr: (texto) => stderr.push(texto),
      stdout: (texto) => stdout.push(texto),
    },
    stderr,
    stdout,
  };
}

describe("CLI", () => {
  it.each([
    { argumentos: ["--ajuda"] },
    { argumentos: ["--help"] },
    { argumentos: ["-h"] },
    { argumentos: [] },
  ])("exibe ajuda em pt-BR com $argumentos", async ({ argumentos }) => {
    const captura = capturarSaida();

    await expect(executarCli(argumentos, captura.io)).resolves.toBe(0);
    expect(captura.stderr).toEqual([]);
    expect(captura.stdout.join("")).toContain("Uso: codingpro");
    expect(captura.stdout.join("")).toContain("[opções]");
    expect(captura.stdout.join("")).toContain("Opções:");
    expect(captura.stdout.join("")).not.toContain("[options]");
    expect(captura.stdout.join("")).not.toContain("Options:");
  });

  it.each([["--versao"], ["--version"], ["-v"]])(
    "exibe a versão do pacote com %s",
    async (opcao) => {
      const captura = capturarSaida();
      const manifesto = JSON.parse(
        await readFile(new URL("../package.json", import.meta.url), "utf8"),
      ) as { version: string };

      await expect(executarCli([opcao], captura.io)).resolves.toBe(0);
      expect(captura.stderr).toEqual([]);
      expect(captura.stdout.join("").trim()).toBe(manifesto.version);
    },
  );

  it("mapeia os dois nomes do binário para o mesmo artefato", async () => {
    const manifesto = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { bin: { codingpro: string; cpro: string } };

    expect(manifesto.bin.codingpro).toBe("./dist/index.mjs");
    expect(manifesto.bin.cpro).toBe(manifesto.bin.codingpro);
  });

  it.each(["-p", "--prompt"])("executa prompt via replay com %s", async (option) => {
    const captura = capturarSaida();
    const provider = new ReplayProvider([
      {
        events: [
          { text: "Olá!", type: "text-delta" },
          {
            message: { content: "Olá!", role: "assistant" },
            reason: "stop",
            type: "finish",
          },
        ],
        request: { messages: [{ content: "olá", role: "user" }] },
      },
    ]);

    await expect(
      executarCli([option, "olá"], captura.io, { criarProvider: () => provider }),
    ).resolves.toBe(0);
    expect(captura.stdout.join("")).toBe("Olá!\n");
    expect(captura.stderr).toEqual([]);
  });

  it("repassa flags de provider e replay ao composition root", async () => {
    const captura = capturarSaida();
    const overrides: unknown[] = [];
    const provider = new ReplayProvider([
      {
        events: [
          { text: "ok", type: "text-delta" },
          { message: { content: "ok", role: "assistant" }, reason: "stop", type: "finish" },
        ],
        request: { messages: [{ content: "teste", role: "user" }] },
      },
    ]);

    await expect(
      executarCli(
        ["--provider", "replay", "--replay-file", "fixture.jsonl", "-p", "teste"],
        captura.io,
        {
          criarProvider: (value) => {
            overrides.push(value);
            return provider;
          },
        },
      ),
    ).resolves.toBe(0);
    expect(overrides).toEqual([{ provider: "replay", replayFile: "fixture.jsonl" }]);
  });

  it("rejeita provider inválido como erro de uso antes do composition root", async () => {
    const captura = capturarSaida();
    let chamadas = 0;

    await expect(
      executarCli(["--provider", "outro", "-p", "teste"], captura.io, {
        criarProvider: () => {
          chamadas += 1;
          throw new Error("não deveria executar");
        },
      }),
    ).resolves.toBe(1);
    expect(chamadas).toBe(0);
    expect(captura.stderr.join("")).toContain("Valores permitidos:");
    expect(captura.stderr.join("")).not.toContain("Allowed choices are");
  });

  it("preserva espaços, acentos e quebras de linha do prompt", async () => {
    const captura = capturarSaida();
    const prompt = "  primeira linha ç\nsegunda linha  ";
    const provider = new ReplayProvider([
      {
        events: [
          { text: "ok", type: "text-delta" },
          { message: { content: "ok", role: "assistant" }, reason: "stop", type: "finish" },
        ],
        request: { messages: [{ content: prompt, role: "user" }] },
      },
    ]);

    await expect(
      executarCli(["-p", prompt], captura.io, { criarProvider: () => provider }),
    ).resolves.toBe(0);
  });

  it("rejeita -p sem argumento em pt-BR", async () => {
    const captura = capturarSaida();

    await expect(executarCli(["-p"], captura.io)).resolves.toBe(1);
    expect(captura.stdout).toEqual([]);
    expect(captura.stderr.join("")).toContain("a opção '-p, --prompt <texto>' exige um argumento");
  });

  it("rejeita prompt em branco antes de construir o provider", async () => {
    const captura = capturarSaida();
    let construído = false;

    await expect(
      executarCli(["-p", "   "], captura.io, {
        criarProvider: () => {
          construído = true;
          throw new Error("não deveria executar");
        },
      }),
    ).resolves.toBe(1);
    expect(construído).toBe(false);
    expect(captura.stderr.join("")).toBe("erro: o prompt não pode estar vazio\n");
  });

  it("não constrói provider para ajuda ou versão", async () => {
    let chamadas = 0;
    const services = {
      criarProvider: () => {
        chamadas += 1;
        throw new Error("não deveria executar");
      },
    };

    await executarCli(["--ajuda"], capturarSaida().io, services);
    await executarCli(["--versao"], capturarSaida().io, services);
    expect(chamadas).toBe(0);
  });

  it("exibe somente mensagem segura de erro do provider", async () => {
    const captura = capturarSaida();
    const canary = "sk-segredo-nao-pode-vazar";

    await expect(
      executarCli(["-p", "olá"], captura.io, {
        criarProvider: () => {
          throw new ProviderError("not-configured", "provider não configurado", false, {
            cause: new Error(canary),
          });
        },
      }),
    ).resolves.toBe(2);
    expect(captura.stderr.join("")).toBe("erro: provider não configurado\n");
    expect(captura.stderr.join("")).not.toContain(canary);
  });

  it("exibe somente mensagem segura de configuração", async () => {
    const captura = capturarSaida();
    const canary = "segredo-config-nao-pode-vazar";

    await expect(
      executarCli(["-p", "olá"], captura.io, {
        criarProvider: () => {
          throw new ConfigError("configuração inválida", { cause: new Error(canary) });
        },
      }),
    ).resolves.toBe(2);
    expect(captura.stderr.join("")).toBe("erro: configuração inválida\n");
    expect(captura.stderr.join("")).not.toContain(canary);
  });

  it("oculta detalhes de erro inesperado", async () => {
    const captura = capturarSaida();
    const canary = "token-super-secreto";

    await expect(
      executarCli(["-p", "olá"], captura.io, {
        criarProvider: () => {
          throw new Error(canary);
        },
      }),
    ).resolves.toBe(2);
    expect(captura.stderr.join("")).toBe("erro: não foi possível concluir a solicitação\n");
    expect(captura.stderr.join("")).not.toContain(canary);
  });

  it("mapeia cancelamento para código 130", async () => {
    const captura = capturarSaida();
    const controller = new AbortController();
    controller.abort();

    await expect(
      executarCli(["-p", "olá"], captura.io, {
        criarProvider: () => {
          throw new Error("não deveria executar");
        },
        signal: controller.signal,
      }),
    ).resolves.toBe(130);
    expect(captura.stderr.join("")).toBe("erro: operação interrompida\n");
  });

  it("roda o loop agêntico com --agente e ferramentas de leitura", async () => {
    const captura = capturarSaida();
    const raiz = await mkdtemp(join(tmpdir(), "codingpro-agente-"));
    try {
      await writeFile(join(raiz, "a.txt"), "conteúdo do projeto");
      const provider = providerRoteirizado([
        [
          {
            call: { id: "c1", input: { path: "a.txt" }, name: "read_file" },
            type: "tool-call",
          },
          {
            message: {
              content: "",
              role: "assistant",
              toolCalls: [{ id: "c1", input: { path: "a.txt" }, name: "read_file" }],
            },
            reason: "tool-calls",
            type: "finish",
          },
        ],
        [
          { text: "o arquivo tem conteúdo do projeto", type: "text-delta" },
          {
            message: { content: "o arquivo tem conteúdo do projeto", role: "assistant" },
            reason: "stop",
            type: "finish",
          },
        ],
      ]);

      await expect(
        executarCli(["--agente", "-p", "o que tem em a.txt?"], captura.io, {
          criarProvider: () => provider,
          raizProjeto: raiz,
        }),
      ).resolves.toBe(0);
      expect(captura.stdout.join("")).toContain("o arquivo tem conteúdo do projeto");
      expect(captura.stderr.join("")).toContain("· Lendo a.txt");
    } finally {
      await rm(raiz, { force: true, recursive: true });
    }
  });

  it("abre o chat interativo com --chat", async () => {
    const captura = capturarSaida();
    const raiz = await mkdtemp(join(tmpdir(), "codingpro-chat-prog-"));
    try {
      const provider = providerRoteirizado([
        [
          { text: "olá do chat", type: "text-delta" },
          {
            message: { content: "olá do chat", role: "assistant" },
            reason: "stop",
            type: "finish",
          },
        ],
      ]);
      const io = {
        pergunta: async () => "n",
        progresso: (t: string) => captura.io.stderr(t),
        proximaMensagem: (() => {
          const fila = ["oi", undefined] as const;
          let i = 0;
          return async () => fila[i++];
        })(),
        saida: (t: string) => captura.io.stdout(t),
      };

      await expect(
        executarCli(["--chat"], captura.io, {
          criarChatIo: () => io,
          criarProvider: () => provider,
          raizProjeto: raiz,
        }),
      ).resolves.toBe(0);
      expect(captura.stdout.join("")).toContain("olá do chat");
    } finally {
      await rm(raiz, { force: true, recursive: true });
    }
  });

  it("recusa --chat sem terminal interativo", async () => {
    const captura = capturarSaida();
    await expect(
      executarCli(["--chat"], captura.io, { criarProvider: () => providerRoteirizado([]) }),
    ).resolves.toBe(1);
    expect(captura.stderr.join("")).toContain("terminal interativo");
  });

  it("repassa contexto, sessões e provider ao chat", async () => {
    const captura = capturarSaida();
    const raiz = await mkdtemp(join(tmpdir(), "codingpro-chat-cfg-"));
    try {
      const provider = providerRoteirizado([
        [{ message: { content: "ok", role: "assistant" }, reason: "stop", type: "finish" }],
      ]);
      const io = {
        pergunta: async () => "n",
        progresso: (t: string) => captura.io.stderr(t),
        proximaMensagem: (() => {
          const fila = ["oi", undefined] as const;
          let i = 0;
          return async () => fila[i++];
        })(),
        saida: (t: string) => captura.io.stdout(t),
      };
      await expect(
        executarCli(["--chat", "--max-contexto", "50", "--provider", "replay"], captura.io, {
          criarChatIo: () => io,
          criarProvider: () => provider,
          raizProjeto: raiz,
          raizSessoes: join(raiz, "sessoes"),
        }),
      ).resolves.toBe(0);
    } finally {
      await rm(raiz, { force: true, recursive: true });
    }
  });

  it("repassa contexto e sessões ao agente com --continuar", async () => {
    const captura = capturarSaida();
    const raiz = await mkdtemp(join(tmpdir(), "codingpro-ag-cfg-"));
    try {
      const provider = providerRoteirizado([
        [
          { text: "resp", type: "text-delta" },
          { message: { content: "resp", role: "assistant" }, reason: "stop", type: "finish" },
        ],
      ]);
      await expect(
        executarCli(["--agente", "--continuar", "--max-contexto", "50", "-p", "oi"], captura.io, {
          criarProvider: () => provider,
          raizProjeto: raiz,
          raizSessoes: join(raiz, "sessoes"),
        }),
      ).resolves.toBe(0);
      expect(captura.stderr.join("")).toContain("Sessão:");
    } finally {
      await rm(raiz, { force: true, recursive: true });
    }
  });

  it("rejeita --max-contexto não inteiro como erro de uso", async () => {
    const captura = capturarSaida();
    await expect(
      executarCli(["--agente", "--max-contexto", "abc", "-p", "oi"], captura.io, {
        criarProvider: () => providerRoteirizado([]),
      }),
    ).resolves.toBe(1);
    expect(captura.stderr.join("")).toContain("--max-contexto exige um inteiro positivo");
  });

  it("rejeita opção desconhecida com erro em pt-BR", async () => {
    const captura = capturarSaida();

    await expect(executarCli(["--inexistente"], captura.io)).resolves.toBe(1);
    expect(captura.stdout).toEqual([]);
    expect(captura.stderr.join("")).toContain("erro: opção desconhecida '--inexistente'");
    expect(captura.stderr.join("")).not.toContain("unknown option");
  });

  it("cria o programa sem encerrar nem escrever no processo", () => {
    const captura = capturarSaida();

    const programa = criarPrograma(captura.io);

    expect(programa.name()).toBe("codingpro");
    expect(captura.stdout).toEqual([]);
    expect(captura.stderr).toEqual([]);
  });

  it("propaga erros inesperados da aplicação", async () => {
    const captura = capturarSaida();
    const falha = new Error("falha inesperada");
    const programa = criarPrograma(captura.io).action(() => {
      throw falha;
    });

    await expect(executarPrograma(programa, [])).rejects.toBe(falha);
  });
});

describe("--doctor", () => {
  it("roda o diagnóstico e imprime o relatório sem precisar de provider", async () => {
    const captura = capturarSaida();
    const raiz = await mkdtemp(join(tmpdir(), "codingpro-doc-"));
    const orig = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "";
    try {
      const codigo = await executarCli(["--doctor"], captura.io, {
        criarProvider: () => {
          throw new Error("não deve ser chamado");
        },
        raizProjeto: raiz,
      });
      // Sem DEEPSEEK_API_KEY nem provider no settings, o item crítico falha → exit 1.
      expect(codigo).toBe(1);
      expect(captura.stdout.join("")).toContain("Diagnóstico do CodingPro");
    } finally {
      if (orig === undefined) {
        process.env.DEEPSEEK_API_KEY = undefined;
      } else {
        process.env.DEEPSEEK_API_KEY = orig;
      }
      await rm(raiz, { force: true, recursive: true });
    }
  });
});
