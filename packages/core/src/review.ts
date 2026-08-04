import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_DIFF_BYTES = 200_000;

/**
 * Obtém o diff a revisar: sem alvo, junta as mudanças não commitadas (working tree + staged); com
 * alvo, usa `git diff <alvo>` (ex.: `main`, `HEAD~3`, um range). Best-effort e sem shell (execFile).
 */
/** Roda git e devolve o stdout; `undefined` se o comando falhou (exit != 0). */
export async function saidaGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: MAX_DIFF_BYTES });
    return stdout;
  } catch (error) {
    const parcial = (error as { stdout?: string }).stdout;
    return typeof parcial === "string" && parcial.length > 0 ? parcial : undefined;
  }
}

/** `true` se o comando git sai 0 (usa só o exit code, ignora stdout). */
export async function gitOk(cwd: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync("git", args, { cwd, maxBuffer: MAX_DIFF_BYTES });
    return true;
  } catch {
    return false;
  }
}

export async function obterDiff(
  cwd: string,
  alvo?: string,
): Promise<{ diff: string; erro?: string }> {
  // `git diff` fora de repo só emite aviso e sai 0; rev-parse detecta pelo exit code.
  if (!(await gitOk(cwd, ["rev-parse", "--is-inside-work-tree"]))) {
    return { diff: "", erro: "não é um repositório git" };
  }
  // Sem alvo: diff vs HEAD se houver commits; senão diff do working tree.
  let ref = alvo;
  if (ref === undefined) {
    ref = (await gitOk(cwd, ["rev-parse", "--quiet", "--verify", "HEAD"])) ? "HEAD" : undefined;
  }
  const stdout = await saidaGit(cwd, ref === undefined ? ["diff"] : ["diff", ref]);
  if (stdout === undefined) {
    return { diff: "", erro: `alvo inválido para o diff: ${alvo ?? ""}`.trimEnd() };
  }
  const diff = stdout.trim();
  if (diff.length === 0) {
    return { diff: "", erro: "nenhuma mudança para revisar" };
  }
  return { diff: diff.slice(0, MAX_DIFF_BYTES) };
}

/** Monta o prompt de revisão para o subagente reviewer. */
export function promptRevisao(diff: string): string {
  return (
    "Revise o diff abaixo e reporte os achados por severidade (mais grave primeiro), no formato " +
    "`{arquivo, linha, severidade, resumo, cenário de falha}`. Se não houver problemas, diga isso.\n\n" +
    "```diff\n" +
    diff +
    "\n```"
  );
}
