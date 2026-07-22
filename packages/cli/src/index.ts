#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { executarCli } from "./program.js";
import { criarProviderRuntime } from "./provider-runtime.js";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatIo } from "./chat-runtime.js";

const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);

function criarChatIo(): ChatIo {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return {
    pergunta: (texto) => rl.question(texto),
    progresso: (texto) => process.stderr.write(texto),
    proximaMensagem: async () => {
      try {
        return await rl.question("› ");
      } catch {
        return undefined; // Ctrl-D / stream fechado encerra o chat.
      }
    },
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
      raizProjeto: process.cwd(),
      raizSessoes: join(homedir(), ".codingpro", "sessions"),
      signal: controller.signal,
    },
  );
} finally {
  process.off("SIGINT", interrupt);
}
