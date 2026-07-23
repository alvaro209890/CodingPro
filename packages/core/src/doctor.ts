import { rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser/lib/esm/main.js";

/**
 * `codingpro doctor`: diagnóstico do ambiente. Funções puras de verificação + uma coleta de sondas
 * (IO) + formatação. Nunca imprime o valor de segredos — só a presença. Exit 0 se nenhum item
 * crítico falhou; 1 caso contrário.
 */
export interface Diagnostico {
  readonly nome: string;
  readonly ok: boolean;
  readonly detalhe: string;
  readonly critico: boolean;
}

export interface SondasDoctor {
  readonly versaoNode: string;
  readonly chaveEnvPresente: boolean;
  readonly providerNoSettings: boolean;
  readonly podeEscrever: boolean;
  readonly gitDisponivel: boolean;
  readonly binResolvivel: boolean;
}

export function verificarVersaoNode(versao: string): Diagnostico {
  const major = Number.parseInt(versao.replace(/^v/u, "").split(".")[0] ?? "0", 10);
  const ok = Number.isInteger(major) && major >= 24;
  return {
    critico: true,
    detalhe: ok ? `${versao} atende (>= 24).` : `${versao} — é preciso Node 24 ou superior.`,
    nome: "Node.js >= 24",
    ok,
  };
}

export function verificarProvider(chaveEnv: boolean, providerSettings: boolean): Diagnostico {
  const ok = chaveEnv || providerSettings;
  const fontes = [
    ...(chaveEnv ? ["DEEPSEEK_API_KEY (ambiente)"] : []),
    ...(providerSettings ? ["settings.json"] : []),
  ];
  return {
    critico: true,
    detalhe: ok
      ? `Configurado via ${fontes.join(" e ")}.`
      : "Nenhum provider. Defina DEEPSEEK_API_KEY ou 'provider' no settings.json.",
    nome: "Provider DeepSeek configurado",
    ok,
  };
}

export function verificarEscrita(podeEscrever: boolean): Diagnostico {
  return {
    critico: true,
    detalhe: podeEscrever
      ? "~/.codingpro é gravável."
      : "Sem permissão de escrita em ~/.codingpro.",
    nome: "Escrita em ~/.codingpro",
    ok: podeEscrever,
  };
}

export function verificarGit(disponivel: boolean): Diagnostico {
  return {
    critico: false,
    detalhe: disponivel ? "git encontrado no PATH." : "git ausente — checkpoints usam repo-sombra.",
    nome: "Git no PATH (opcional)",
    ok: disponivel,
  };
}

export function verificarBinario(resolvivel: boolean): Diagnostico {
  return {
    critico: false,
    detalhe: resolvivel
      ? "'codingpro' resolvível no PATH."
      : "'codingpro' não está no PATH (rode via npx ou ajuste o PATH).",
    nome: "Binário 'codingpro' no PATH",
    ok: resolvivel,
  };
}

/** Monta a lista de diagnósticos a partir das sondas. Puro. */
export function montarDiagnosticos(s: SondasDoctor): Diagnostico[] {
  return [
    verificarVersaoNode(s.versaoNode),
    verificarProvider(s.chaveEnvPresente, s.providerNoSettings),
    verificarEscrita(s.podeEscrever),
    verificarGit(s.gitDisponivel),
    verificarBinario(s.binResolvivel),
  ];
}

/** Formata o relatório pt-BR e calcula o exit code (1 se algum crítico falhou). Puro. */
export function formatarRelatorioDoctor(diags: readonly Diagnostico[]): {
  readonly texto: string;
  readonly exitCode: number;
} {
  const linhas = diags.map((d) => `  ${d.ok ? "✓" : "✗"} ${d.nome} — ${d.detalhe}`);
  const falhouCritico = diags.some((d) => d.critico && !d.ok);
  const rodape = falhouCritico
    ? "\nHá problemas críticos — resolva-os antes de usar o CodingPro."
    : "\nTudo certo para usar o CodingPro.";
  return {
    exitCode: falhouCritico ? 1 : 0,
    texto: `Diagnóstico do CodingPro:\n${linhas.join("\n")}${rodape}\n`,
  };
}

async function providerNoSettings(cwd: string, homeDir: string): Promise<boolean> {
  for (const arquivo of [
    join(homeDir, ".codingpro", "settings.json"),
    join(cwd, ".codingpro", "settings.json"),
  ]) {
    try {
      const { readFile } = await import("node:fs/promises");
      const dados = parseJsonc(await readFile(arquivo, "utf8")) as
        | { provider?: unknown }
        | undefined;
      if (typeof dados?.provider === "string" && dados.provider.length > 0) {
        return true;
      }
    } catch {
      // ausente/ilegível → ignora
    }
  }
  return false;
}

async function testarEscrita(homeDir: string): Promise<boolean> {
  const dir = join(homeDir, ".codingpro");
  const alvo = join(dir, `.doctor-${process.pid}`);
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    await writeFile(alvo, "ok", "utf8");
    await rm(alvo, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function noPath(comando: string): Promise<boolean> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  try {
    await promisify(execFile)("sh", ["-c", `command -v ${comando}`]);
    return true;
  } catch {
    return false;
  }
}

/** Coleta as sondas do ambiente (IO). */
export async function coletarSondas(
  cwd: string,
  homeDir: string,
  env: Record<string, string | undefined>,
): Promise<SondasDoctor> {
  const [providerSettings, podeEscrever, git, bin] = await Promise.all([
    providerNoSettings(cwd, homeDir),
    testarEscrita(homeDir),
    noPath("git"),
    noPath("codingpro"),
  ]);
  return {
    binResolvivel: bin,
    chaveEnvPresente:
      typeof env.DEEPSEEK_API_KEY === "string" && env.DEEPSEEK_API_KEY.trim().length > 0,
    gitDisponivel: git,
    podeEscrever,
    providerNoSettings: providerSettings,
    versaoNode: process.version,
  };
}

export interface DoctorIo {
  readonly stdout: (texto: string) => void;
}

/** Roda o diagnóstico completo e devolve o exit code. */
export async function rodarDoctor(
  io: DoctorIo,
  cwd: string = process.cwd(),
  homeDir: string = homedir(),
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const sondas = await coletarSondas(cwd, homeDir, env);
  const { texto, exitCode } = formatarRelatorioDoctor(montarDiagnosticos(sondas));
  io.stdout(texto);
  return exitCode;
}
