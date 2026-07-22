#!/usr/bin/env node

import { executarCli } from "./program.js";
import { criarProviderRuntime } from "./provider-runtime.js";
import { homedir } from "node:os";
import { join } from "node:path";

const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);

try {
  process.exitCode = await executarCli(
    process.argv.slice(2),
    {
      stderr: (texto) => process.stderr.write(texto),
      stdout: (texto) => process.stdout.write(texto),
    },
    {
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
