import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser/lib/esm/main.js";
import { nomeTemaValido, type TemaNome } from "./tema.js";

/**
 * Resolve o tema visual. Precedência: `CODINGPRO_TEMA` (env) → `theme` no settings.json
 * (projeto vence global) → padrão `aurora`. Best-effort: settings ausente/ilegível → padrão.
 */
export async function carregarNomeTema(
  cwd: string,
  homeDir: string = homedir(),
  env: Record<string, string | undefined> = process.env,
): Promise<TemaNome> {
  const doEnv = (env.CODINGPRO_TEMA ?? "").trim();
  if (doEnv.length > 0) {
    return nomeTemaValido(doEnv);
  }
  for (const arquivo of [
    join(cwd, ".codingpro", "settings.json"),
    join(homeDir, ".codingpro", "settings.json"),
  ]) {
    try {
      const dados = parseJsonc(await readFile(arquivo, "utf8")) as { theme?: unknown } | undefined;
      if (typeof dados?.theme === "string" && dados.theme.trim().length > 0) {
        return nomeTemaValido(dados.theme);
      }
    } catch {
      // ausente/ilegível → tenta o próximo
    }
  }
  return "aurora";
}
