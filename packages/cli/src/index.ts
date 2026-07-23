#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatIo } from "./chat-runtime.js";
import { criarLeitorDeLinhas } from "./line-reader.js";
import { executarCli } from "./program.js";
import { criarProviderRuntime } from "./provider-runtime.js";
import { criarPromptTty } from "./prompt-tty.js";
import { criarTema } from "./tema.js";

const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);

// Tema visual detectado do terminal real (truecolor/256/16/nenhuma), respeitando NO_COLOR.
const tema = criarTema();
const ehTty =
  process.stdin.isTTY === true && process.stdout.isTTY === true && process.stderr.isTTY === true;

/** Chat IO rico em TTY (autocomplete `/`, setas, spinner); fallback readline em pipe. */
function criarChatIo(): ChatIo {
  if (ehTty) {
    const prompt = criarPromptTty({
      input: process.stdin,
      output: process.stderr,
      signal: controller.signal,
      tema,
    });
    return {
      abrir: () => prompt.bannerAnimado(),
      pergunta: async (texto) => (await prompt.ler(texto)) ?? "",
      progresso: (texto) => {
        // Sempre limpa o spinner antes de linhas permanentes (não deixa lixo no terminal).
        if (prompt.spinner.ativo()) {
          prompt.spinner.stop();
        }
        process.stderr.write(texto);
      },
      proximaMensagem: async () => {
        if (prompt.spinner.ativo()) {
          prompt.spinner.stop();
        }
        return prompt.ler(tema.prompt());
      },
      saida: (texto) => {
        if (prompt.spinner.ativo()) {
          prompt.spinner.stop();
        }
        process.stdout.write(texto);
      },
      spinner: prompt.spinner,
    };
  }

  // Pipe / não-TTY: leitor por eventos (sem raw mode, sem animações).
  const leitor = criarLeitorDeLinhas(process.stdin, process.stderr);
  return {
    pergunta: async (texto) => (await leitor.next(texto)) ?? "",
    progresso: (texto) => process.stderr.write(texto),
    proximaMensagem: () => leitor.next(tema.prompt()),
    saida: (texto) => process.stdout.write(texto),
  };
}

try {
  process.exitCode = await executarCli(
    process.argv.slice(2),
    {
      stderr: (texto) => process.stderr.write(texto),
      stdout: (texto) => process.stdout.write(texto),
    },
    {
      criarChatIo,
      criarProvider: (flags) =>
        criarProviderRuntime(
          {
            cwd: process.cwd(),
            environment: process.env,
            flags,
            homeDirectory: homedir(),
          },
          controller.signal,
        ),
      raizMemoriaGlobal: join(homedir(), ".codingpro", "memory"),
      raizProjeto: process.cwd(),
      raizSessoes: join(homedir(), ".codingpro", "sessions"),
      signal: controller.signal,
      tema,
    },
  );
} finally {
  process.off("SIGINT", interrupt);
}
