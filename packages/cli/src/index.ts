#!/usr/bin/env node

import { executarCli } from "./program.js";

process.exitCode = await executarCli(process.argv.slice(2), {
  stderr: (texto) => process.stderr.write(texto),
  stdout: (texto) => process.stdout.write(texto),
});
