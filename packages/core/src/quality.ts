import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Loop de qualidade (doc 14.5 / 14.5.1): após um turno que editou arquivos,
 * 1) opcionalmente `biome check --write` (format + fixes seguros),
 * 2) `biome check` de novo,
 * 3) devolve diagnóstico residual para re-turno da IA se ainda houver problemas.
 *
 * Segurança: caminhos como ARGV do `execFile` (nunca shell). Best-effort: só com
 * biome.json; falha nunca bloqueia o turno.
 */

/** Executor do biome; injetável nos testes. Recebe cwd + args, devolve o stdout. */
export type RunnerBiome = (root: string, args: readonly string[]) => Promise<string>;

const execFileAsync = promisify(execFile);

const runnerPadrao: RunnerBiome = async (root, args) => {
  const { stdout } = await execFileAsync("pnpm", ["exec", "biome", ...args], {
    cwd: root,
    maxBuffer: 1_000_000,
    timeout: 60_000,
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

/** Normaliza lista de paths (únicos, relativos, não vazios). */
export function normalizarArquivos(arquivos: readonly string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const a of arquivos) {
    const t = a.trim().replaceAll("\\", "/");
    if (t.length === 0 || t.startsWith("/") || t.includes("\0") || vistos.has(t)) {
      continue;
    }
    // Bloqueia escape de diretório óbvio
    if (t.split("/").includes("..")) {
      continue;
    }
    vistos.add(t);
    out.push(t);
  }
  return out;
}

export interface QualidadeIo {
  readonly progresso: (texto: string) => void;
}

export interface OpcoesQualidade {
  /** Se true (padrão), roda `biome check --write` antes do check final. */
  readonly autoFix?: boolean;
  readonly runner?: RunnerBiome;
}

export interface ResultadoQualidade {
  /** true se não restou diagnóstico após o fluxo. */
  readonly limpo: boolean;
  /** true se o passo `--write` foi executado com sucesso (mesmo que ainda reste lint). */
  readonly autoCorrigiu: boolean;
  readonly problemas: number;
  /** Saída residual do último check (vazia se limpo). */
  readonly diagnostico: string;
  readonly arquivos: readonly string[];
  /** true se o projeto não usa biome ou não havia arquivos. */
  readonly ignorado: boolean;
}

function saidaDeErro(erro: unknown): { code?: string; stdout: string } {
  const e = erro as { stdout?: string; stderr?: string; code?: string | number };
  const stdout =
    typeof e.stdout === "string"
      ? e.stdout
      : typeof e.stderr === "string"
        ? e.stderr
        : erro instanceof Error
          ? erro.message
          : "";
  if (e.code === undefined) {
    return { stdout };
  }
  return { code: String(e.code), stdout };
}

async function rodarBiome(
  root: string,
  args: readonly string[],
  runner: RunnerBiome,
): Promise<{ ok: boolean; saida: string; enoent: boolean }> {
  try {
    const saida = await runner(root, args);
    return { enoent: false, ok: true, saida };
  } catch (erro) {
    const { code, stdout } = saidaDeErro(erro);
    if (code === "ENOENT") {
      return { enoent: true, ok: false, saida: "" };
    }
    // biome check com problemas costuma sair com code !== 0 e stdout preenchido
    return { enoent: false, ok: false, saida: stdout };
  }
}

/**
 * Roda o biome nos arquivos editados: opcionalmente auto-fix (`--write`), depois check.
 * Devolve resultado estruturado para o chat decidir re-turno da IA.
 */
export async function corrigirQualidade(
  root: string,
  arquivos: readonly string[],
  io: QualidadeIo,
  options: OpcoesQualidade = {},
): Promise<ResultadoQualidade> {
  const autoFix = options.autoFix !== false;
  const runner = options.runner ?? runnerPadrao;
  const lista = normalizarArquivos(arquivos);

  if (lista.length === 0 || !(await projetoUsaBiome(root))) {
    return {
      arquivos: lista,
      autoCorrigiu: false,
      diagnostico: "",
      ignorado: true,
      limpo: true,
      problemas: 0,
    };
  }

  let autoCorrigiu = false;

  if (autoFix) {
    io.progresso("· formatando…");
    const fix = await rodarBiome(root, ["check", "--write", "--", ...lista], runner);
    if (fix.enoent) {
      io.progresso(" (biome indisponível)\n");
      return {
        arquivos: lista,
        autoCorrigiu: false,
        diagnostico: "",
        ignorado: true,
        limpo: true,
        problemas: 0,
      };
    }
    autoCorrigiu = true;
    io.progresso(" ok\n");
  }

  io.progresso("· verificando…");
  const check = await rodarBiome(root, ["check", "--", ...lista], runner);
  if (check.enoent) {
    io.progresso(" (biome indisponível)\n");
    return {
      arquivos: lista,
      autoCorrigiu,
      diagnostico: "",
      ignorado: true,
      limpo: true,
      problemas: 0,
    };
  }

  const problemas = contarProblemas(check.saida);
  const limpo = problemas === 0;
  if (limpo) {
    io.progresso(autoCorrigiu ? " ✓ limpo (auto-corrigido)\n" : " ✓ limpo\n");
  } else {
    io.progresso(` ✗ ${problemas} problema(s)\n${check.saida.trim()}\n`);
  }

  return {
    arquivos: lista,
    autoCorrigiu,
    diagnostico: limpo ? "" : check.saida.trim(),
    ignorado: false,
    limpo,
    problemas,
  };
}

/**
 * Compat: só verifica (sem `--write`). Preferir `corrigirQualidade` no caminho novo.
 */
export async function verificarQualidade(
  root: string,
  arquivos: readonly string[],
  io: QualidadeIo,
  runner: RunnerBiome = runnerPadrao,
): Promise<void> {
  await corrigirQualidade(root, arquivos, io, { autoFix: false, runner });
}

/** Lê preferências de qualidade do ambiente (sem segredos). */
export function lerOpcoesQualidadeEnv(env: Record<string, string | undefined> = process.env): {
  autoFix: boolean;
  maxRepairTurns: number;
} {
  const rawFix = (env.CODINGPRO_QUALITY_AUTOFIX ?? "true").trim().toLowerCase();
  const autoFix = !(rawFix === "0" || rawFix === "false" || rawFix === "off" || rawFix === "no");
  const rawMax = Number.parseInt(env.CODINGPRO_QUALITY_MAX_REPAIR ?? "1", 10);
  const maxRepairTurns = Number.isInteger(rawMax) && rawMax >= 0 ? Math.min(rawMax, 2) : 1;
  return { autoFix, maxRepairTurns };
}

/** Prompt sintético para o modelo corrigir o residual do linter. */
export function promptReparoQualidade(diagnostico: string, arquivos: readonly string[]): string {
  const lista = arquivos.length > 0 ? arquivos.join(", ") : "(arquivos do turno)";
  return [
    "O linter/formatador do projeto (Biome) ainda reporta problemas nos arquivos recém-editados.",
    "Corrija **apenas** o necessário para o lint passar. Não refatore além do diagnóstico.",
    `Arquivos: ${lista}`,
    "",
    "Diagnóstico:",
    diagnostico.trim() || "(sem detalhes)",
  ].join("\n");
}
