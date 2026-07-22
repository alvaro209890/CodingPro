#!/usr/bin/env node

import { executarCli } from "./program.js";
import { criarProviderRuntime } from "./provider-runtime.js";

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
      criarProvider: () => criarProviderRuntime(process.env, controller.signal),
      signal: controller.signal,
    },
  );
} finally {
  process.off("SIGINT", interrupt);
}
