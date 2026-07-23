import { CoreError } from "@codingpro/core";
import { type Provider, ProviderError } from "@codingpro/llm";
import { Command, CommanderError, type Help, Option } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { executarAgenteHeadless } from "./agent-runtime.js";
import { type ChatIo, executarChat } from "./chat-runtime.js";
import { ConfigError, type ProviderOverrides } from "./config.js";
import { rodarDoctor } from "./doctor.js";
import { executarPromptHeadless } from "./headless.js";
import { carregarHooks } from "./hooks-runtime.js";
import { mensagens } from "./i18n/pt-BR.js";
import { iniciarServidoresMcp } from "./mcp-runtime.js";
import { carregarSkills, dirsSkills } from "./skills-runtime.js";
import type { Tema } from "./tema.js";

export interface CliIo {
  readonly stdout: (texto: string) => void;
  readonly stderr: (texto: string) => void;
}

export interface CliServices {
  /** IO interativo (readline) para o modo chat; ausente desabilita `--chat`. */
  readonly criarChatIo?: () => ChatIo;
  readonly criarProvider: (overrides: ProviderOverrides) => Promise<Provider> | Provider;
  /** Diretório da memória global (`~/.codingpro/memory`); ausente usa o padrão. */
  readonly raizMemoriaGlobal?: string;
  /** Raiz do projeto (cwd) para o modo agente sandboxar as ferramentas. */
  readonly raizProjeto?: string;
  /** Diretório onde as sessões do agente são salvas/lidas. */
  readonly raizSessoes?: string;
  readonly signal?: AbortSignal;
  /** Tema visual do chat; ausente = sem cor. */
  readonly tema?: Tema;
  /** Habilita o companheiro/XP no chat; ausente = desligado. */
  readonly petHabilitado?: boolean;
  /** Caminho do estado do pet; ausente usa o padrão. */
  readonly petArquivo?: string;
}

class CliUsageError extends Error {
  override readonly name = "CliUsageError";
}

const servicosSemProvider: CliServices = {
  criarProvider: () => {
    throw new ProviderError("not-configured", "Nenhum provider foi configurado.");
  },
};

function formatarAjuda(command: Command, helper: Help): string {
  const termos = helper.visibleOptions(command).map((opcao) => ({
    descricao: helper.optionDescription(opcao),
    termo: helper.optionTerm(opcao),
  }));
  const maiorTermo = Math.max(0, ...termos.map(({ termo }) => termo.length));
  const linhasOpcoes = termos.map(({ descricao, termo }) =>
    `  ${termo.padEnd(maiorTermo + 2)}${descricao}`.trimEnd(),
  );

  return [
    `${mensagens.ajuda.uso} ${helper.commandUsage(command).replace("[options]", "[opções]")}`,
    "",
    command.description(),
    "",
    mensagens.ajuda.opcoes,
    ...linhasOpcoes,
    "",
  ].join("\n");
}

function normalizarAliases(argumentos: readonly string[]): string[] {
  const aliases: Readonly<Record<string, string>> = {
    "--help": "--ajuda",
    "--version": "--versao",
  };

  return argumentos.map((argumento) => aliases[argumento] ?? argumento);
}

function traduzirErro(texto: string): string {
  return texto
    .replace(/^error:/u, "erro:")
    .replace(/unknown option/gu, mensagens.erro.opcaoDesconhecida)
    .replace(/too many arguments/gu, mensagens.erro.argumentosDemais)
    .replace(/option '([^']+)' argument missing/gu, "a opção '$1' exige um argumento")
    .replace(/argument '([^']+)' is invalid/gu, "argumento '$1' é inválido")
    .replace(/Allowed choices are/gu, "Valores permitidos:")
    .replace(/missing mandatory argument/gu, mensagens.erro.argumentoAusente);
}

/** Holder mutável para códigos de saída definidos dentro da ação (ex.: `--doctor`). */
export interface EstadoSaida {
  codigo: number;
}

export function criarPrograma(
  io: CliIo,
  services: CliServices = servicosSemProvider,
  estado: EstadoSaida = { codigo: 0 },
): Command {
  const programa = new Command()
    .name("codingpro")
    .description(mensagens.ajuda.descricao)
    .version(packageJson.version, "-v, --versao", mensagens.opcao.versao)
    .option("-p, --prompt <texto>", mensagens.opcao.prompt)
    .option("--chat", mensagens.opcao.chat)
    .option("--agente", mensagens.opcao.agente)
    .option("--doctor", mensagens.opcao.doctor)
    .option("--continuar", mensagens.opcao.continuar)
    .addOption(
      new Option("--max-contexto <n>", mensagens.opcao.maxContexto).argParser((valor) => {
        const numero = Number.parseInt(valor, 10);
        if (!Number.isSafeInteger(numero) || numero <= 0) {
          throw new CliUsageError("--max-contexto exige um inteiro positivo");
        }
        return numero;
      }),
    )
    .option("--resume <id>", mensagens.opcao.resume)
    .addOption(
      new Option("--provider <nome>", mensagens.opcao.provider).choices(["deepseek", "replay"]),
    )
    .option("--replay-file <caminho>", mensagens.opcao.replayFile)
    .helpOption("-h, --ajuda", mensagens.opcao.ajuda)
    .addHelpCommand(false)
    .configureHelp({ formatHelp: formatarAjuda })
    .configureOutput({
      outputError: (texto, escrever) => escrever(traduzirErro(texto)),
      writeErr: io.stderr,
      writeOut: io.stdout,
    })
    .exitOverride();

  programa.action(async () => {
    const options = programa.opts<{
      agente?: boolean;
      chat?: boolean;
      continuar?: boolean;
      doctor?: boolean;
      maxContexto?: number;
      prompt?: string;
      provider?: string;
      replayFile?: string;
      resume?: string;
    }>();

    if (options.doctor === true) {
      estado.codigo = await rodarDoctor(
        { stdout: io.stdout },
        services.raizProjeto ?? process.cwd(),
      );
      return;
    }

    if (options.chat === true) {
      const criarChatIo = services.criarChatIo;
      if (criarChatIo === undefined) {
        // index.ts só injeta criarChatIo com stdin TTY; sem isso o chat “piscava” e saía no EOF.
        throw new CliUsageError(mensagens.erro.chatIndisponivel);
      }
      services.signal?.throwIfAborted();
      // UI primeiro: banner na hora, depois init (provider/MCP/workspace).
      // Assim o usuário nunca fica preso só em "abrindo chat…" sem feedback.
      io.stderr("· abrindo chat…\n");
      const chatIo = criarChatIo();
      if (chatIo.abrir !== undefined) {
        await chatIo.abrir();
      } else if (services.tema !== undefined) {
        io.stderr(services.tema.banner());
      }
      io.stderr("· carregando provider…\n");
      const provider = await services.criarProvider({
        ...(options.provider === undefined ? {} : { provider: options.provider }),
        ...(options.replayFile === undefined ? {} : { replayFile: options.replayFile }),
      });
      const cwdChat = services.raizProjeto ?? process.cwd();
      io.stderr("· carregando hooks, skills e MCP…\n");
      const [hooksChat, skillsChat, mcp] = await Promise.all([
        carregarHooks(cwdChat),
        carregarSkills(dirsSkills(cwdChat)),
        iniciarServidoresMcp(cwdChat),
      ]);
      for (const aviso of mcp.avisos) {
        io.stderr(`· ${aviso}\n`);
      }
      try {
        await executarChat(
          {
            cwd: cwdChat,
            hooks: hooksChat,
            mcpTools: mcp.tools,
            provider,
            pularBanner: true,
            skills: skillsChat,
            ...(options.maxContexto === undefined ? {} : { maxContexto: options.maxContexto }),
            ...(services.raizMemoriaGlobal === undefined
              ? {}
              : { memoriaGlobalDir: services.raizMemoriaGlobal }),
            ...(services.raizSessoes === undefined ? {} : { sessaoDir: services.raizSessoes }),
            ...(services.signal === undefined ? {} : { signal: services.signal }),
            ...(services.tema === undefined ? {} : { tema: services.tema }),
            ...(services.petHabilitado === undefined
              ? {}
              : { petHabilitado: services.petHabilitado }),
            ...(services.petArquivo === undefined ? {} : { petArquivo: services.petArquivo }),
          },
          chatIo,
        );
      } finally {
        mcp.fechar();
      }
      return;
    }

    const prompt = options.prompt;
    if (prompt === undefined) {
      programa.outputHelp();
      return;
    }
    if (prompt.trim().length === 0) {
      throw new CliUsageError(mensagens.erro.promptVazio);
    }

    services.signal?.throwIfAborted();
    const provider = await services.criarProvider({
      ...(options.provider === undefined ? {} : { provider: options.provider }),
      ...(options.replayFile === undefined ? {} : { replayFile: options.replayFile }),
    });

    if (options.agente === true) {
      const cwdAgente = services.raizProjeto ?? process.cwd();
      const [hooksAgente, skillsAgente] = await Promise.all([
        carregarHooks(cwdAgente),
        carregarSkills(dirsSkills(cwdAgente)),
      ]);
      await executarAgenteHeadless(
        {
          continuarUltima: options.continuar === true,
          cwd: cwdAgente,
          hooks: hooksAgente,
          prompt,
          provider,
          skills: skillsAgente,
          ...(options.maxContexto === undefined ? {} : { maxContexto: options.maxContexto }),
          ...(services.raizMemoriaGlobal === undefined
            ? {}
            : { memoriaGlobalDir: services.raizMemoriaGlobal }),
          ...(options.resume === undefined ? {} : { resumirId: options.resume }),
          ...(services.raizSessoes === undefined ? {} : { sessaoDir: services.raizSessoes }),
          ...(services.signal === undefined ? {} : { signal: services.signal }),
        },
        { progresso: io.stderr, saida: io.stdout },
      );
      return;
    }

    await executarPromptHeadless(prompt, provider, io.stdout, services.signal);
  });
  return programa;
}

export async function executarPrograma(
  programa: Command,
  argumentos: readonly string[],
): Promise<number> {
  try {
    await programa.parseAsync(normalizarAliases(argumentos), { from: "user" });
    return 0;
  } catch (erro) {
    if (erro instanceof CommanderError) {
      return erro.exitCode;
    }

    throw erro;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function executarCli(
  argumentos: readonly string[],
  io: CliIo,
  services: CliServices = servicosSemProvider,
): Promise<number> {
  const estado: EstadoSaida = { codigo: 0 };
  try {
    const resultado = await executarPrograma(criarPrograma(io, services, estado), argumentos);
    return resultado !== 0 ? resultado : estado.codigo;
  } catch (error) {
    if (services.signal?.aborted === true || isAbortError(error)) {
      io.stderr(`erro: ${mensagens.erro.interrompido}\n`);
      return 130;
    }
    if (error instanceof CliUsageError) {
      io.stderr(`erro: ${error.message}\n`);
      return 1;
    }
    if (
      error instanceof ConfigError ||
      error instanceof ProviderError ||
      error instanceof CoreError
    ) {
      io.stderr(`erro: ${error.safeMessage}\n`);
      return 2;
    }

    io.stderr(`erro: ${mensagens.erro.inesperado}\n`);
    return 2;
  }
}
