#!/usr/bin/env node

import { executarCli } from "./program.js";
import { criarProviderRuntime } from "./provider-runtime.js";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatIo } from "./chat-runtime.js";
import { criarLeitorDeLinhas } from "./line-reader.js";

const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);

function criarChatIo(): ChatIo {
  // Leitor por eventos de linha: robusto em TTY e em pipe (sem race de EOF).
  const leitor = criarLeitorDeLinhas(process.stdin, process.stderr);
  return {
    // Em EOF durante uma aprovação, "" nega (fail-closed).
    pergunta: async (texto) => (await leitor.next(texto)) ?? "",
    progresso: (texto) => process.stderr.write(texto),
    proximaMensagem: () => leitor.next("› "),
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
    },
  );
} finally {
  process.off("SIGINT", interrupt);
}
