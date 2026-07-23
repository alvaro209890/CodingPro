import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type ModoAtribuicao, modoAtribuicaoValido } from "@codingpro/core";
import { parse as parseJsonc } from "jsonc-parser/lib/esm/main.js";

/**
 * Lê o modo de atribuição de commits (`attribution`) do settings.json (projeto vence global).
 * Padrão = `full` (assina). Best-effort: settings ausente/ilegível → padrão.
 */
export async function carregarAtribuicao(
  cwd: string,
  homeDir: string = homedir(),
): Promise<ModoAtribuicao> {
  for (const arquivo of [
    join(cwd, ".codingpro", "settings.json"),
    join(homeDir, ".codingpro", "settings.json"),
  ]) {
    try {
      const dados = parseJsonc(await readFile(arquivo, "utf8")) as
        | { attribution?: unknown }
        | undefined;
      if (dados?.attribution !== undefined) {
        return modoAtribuicaoValido(dados.attribution);
      }
    } catch {
      // ausente/ilegível → tenta o próximo
    }
  }
  return modoAtribuicaoValido(undefined);
}
