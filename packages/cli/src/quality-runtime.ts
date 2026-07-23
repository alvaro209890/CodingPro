import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Loop de qualidade (doc 14.5): depois de um turno que editou arquivos, passa-os pelo biome do
 * projeto e reporta problemas. Segurança: os caminhos vêm do modelo e são passados como ARGUMENTOS
 * do `execFile` (nunca interpolados em shell) — imune a injeção de comando. Best-effort: só roda onde
 * o biome é o linter do projeto; ausência/erro do biome nunca bloqueia o turno.
 */

/** Executor do biome; injetável nos testes. Recebe cwd + args, devolve o stdout. */
export type RunnerBiome = (root: string, args: readonly string[]) => Promise<string>;

const execFileAsync = promisify(execFile);

const runnerPadrao: RunnerBiome = async (root, args) => {
  const { stdout } = await execFileAsync("pnpm", ["exec", "biome", ...args], {
    cwd: root,
    maxBuffer: 1_000_000,
  });
  return stdout;
};

/** `true` se o projeto tem biome como linter (biome.json/biome.jsonc na raiz). */
export async function projetoUsaBiome(root: string): Promise<boolean> {
  for (const nome of ["biome.json", "biome.jsonc"]) {
    try {
      await stat(join(root, nome));
      return true;
    } catch {
      // não existe; tenta o próximo
    }
  }
  return false;
}

/** Conta linhas de problema na saída do biome (pura). */
export function contarProblemas(saida: string): number {
  const limpa = saida.trim();
  return limpa.length === 0 ? 0 : limpa.split("\n").filter((l) => l.length > 0).length;
}

export interface QualidadeIo {
  readonly progresso: (texto: string) => void;
}

/**
 * Roda o biome nos arquivos editados e reporta via `io`. Só age se o projeto usa biome. Falha do
 * biome (inclusive ausência) é silenciosa/non-blocking.
 */
export async function verificarQualidade(
  root: string,
  arquivos: readonly string[],
  io: QualidadeIo,
  runner: RunnerBiome = runnerPadrao,
): Promise<void> {
  if (arquivos.length === 0 || !(await projetoUsaBiome(root))) {
    return;
  }
  io.progresso("· verificando…");
  let saida: string;
  try {
    saida = await runner(root, ["check", "--", ...arquivos]);
  } catch (erro) {
    const e = erro as { stdout?: string; code?: string };
    if (e.code === "ENOENT") {
      io.progresso(" (biome indisponível)\n");
      return;
    }
    saida = typeof e.stdout === "string" ? e.stdout : "";
  }
  const problemas = contarProblemas(saida);
  io.progresso(problemas > 0 ? ` ✗ ${problemas} problema(s)\n${saida.trim()}\n` : " ✓ limpo\n");
}
