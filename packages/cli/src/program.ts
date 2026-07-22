import { Command, CommanderError, type Help } from "commander";
import { ProviderError, type Provider } from "@codingpro/llm";
import packageJson from "../package.json" with { type: "json" };
import { executarPromptHeadless } from "./headless.js";
import { mensagens } from "./i18n/pt-BR.js";

export interface CliIo {
  readonly stdout: (texto: string) => void;
  readonly stderr: (texto: string) => void;
}

export interface CliServices {
  readonly criarProvider: () => Promise<Provider> | Provider;
  readonly signal?: AbortSignal;
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
    .replace(/missing mandatory argument/gu, mensagens.erro.argumentoAusente);
}

export function criarPrograma(io: CliIo, services: CliServices = servicosSemProvider): Command {
  const programa = new Command()
    .name("codingpro")
    .description(mensagens.ajuda.descricao)
    .version(packageJson.version, "-v, --versao", mensagens.opcao.versao)
    .option("-p, --prompt <texto>", mensagens.opcao.prompt)
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
    const prompt = programa.opts<{ prompt?: string }>().prompt;
    if (prompt === undefined) {
      programa.outputHelp();
      return;
    }
    if (prompt.trim().length === 0) {
      throw new CliUsageError(mensagens.erro.promptVazio);
    }

    services.signal?.throwIfAborted();
    const provider = await services.criarProvider();
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
  try {
    return await executarPrograma(criarPrograma(io, services), argumentos);
  } catch (error) {
    if (services.signal?.aborted === true || isAbortError(error)) {
      io.stderr(`erro: ${mensagens.erro.interrompido}\n`);
      return 130;
    }
    if (error instanceof CliUsageError) {
      io.stderr(`erro: ${error.message}\n`);
      return 1;
    }
    if (error instanceof ProviderError) {
      io.stderr(`erro: ${error.safeMessage}\n`);
      return 2;
    }

    io.stderr(`erro: ${mensagens.erro.inesperado}\n`);
    return 2;
  }
}
