import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import type { JsonObject, JsonValue, Tool, ToolResult } from "@codingpro/llm";
import { type ExecutableTool, type ToolContext, textResult } from "../tool.js";

const execFileAsync = promisify(execFile);
const DIAGNOSTICS_TIMEOUT_MS = 60_000;
const MAX_DIAGNOSTICS = 20;

const definition: Tool = {
  description:
    "Obtém erros de lint (Biome) e de tipo (TypeScript) do projeto ou de caminhos específicos. " +
    "Somente leitura.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      paths: {
        description: "Caminhos relativos para limitar a verificação (padrão: raiz do projeto).",
        items: { type: "string" },
        type: "array",
      },
    },
    type: "object",
  },
  name: "get_diagnostics",
};

interface DiagnosticoLinha {
  readonly arquivo: string;
  readonly linha: number;
  readonly codigo: string;
  readonly mensagem: string;
}

function pathsDeInput(valor: JsonValue | undefined): readonly string[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

async function arquivoExiste(caminho: string): Promise<boolean> {
  try {
    await access(caminho);
    return true;
  } catch {
    return false;
  }
}

async function executar(
  cwd: string,
  comando: string,
  args: string[],
): Promise<{ stdout: string; stderr: string } | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(comando, args, {
      cwd,
      maxBuffer: 2_000_000,
      timeout: DIAGNOSTICS_TIMEOUT_MS,
    });
    return { stderr, stdout };
  } catch (error) {
    const parcial = error as { stdout?: string; stderr?: string };
    if (typeof parcial.stdout === "string" || typeof parcial.stderr === "string") {
      return {
        stderr: parcial.stderr ?? "",
        stdout: parcial.stdout ?? "",
      };
    }
    return undefined;
  }
}

function parseTsc(stdout: string, stderr: string): DiagnosticoLinha[] {
  const saida: DiagnosticoLinha[] = [];
  const texto = `${stdout}\n${stderr}`;
  const re = /^(.+?)\((\d+),\d+\):\s+error\s+(TS\d+):\s+(.+)$/gm;
  for (const match of texto.matchAll(re)) {
    const arquivo = match[1];
    const linha = match[2];
    const codigo = match[3];
    const mensagem = match[4];
    if (arquivo === undefined || linha === undefined || codigo === undefined || mensagem === undefined) {
      continue;
    }
    saida.push({
      arquivo,
      codigo,
      linha: Number.parseInt(linha, 10),
      mensagem: mensagem.trim(),
    });
  }
  return saida;
}

function parseBiome(stdout: string): DiagnosticoLinha[] {
  const saida: DiagnosticoLinha[] = [];
  try {
    const json = JSON.parse(stdout) as {
      diagnostics?: Array<{
        category?: string;
        description?: string;
        message?: string | { content?: string };
        location?: { path?: { file?: string }; span?: [number, number] };
        severity?: string;
      }>;
    };
    for (const diag of json.diagnostics ?? []) {
      const arquivo = diag.location?.path?.file;
      if (arquivo === undefined) {
        continue;
      }
      const mensagemBruta = diag.message;
      const mensagem =
        typeof mensagemBruta === "string"
          ? mensagemBruta
          : typeof mensagemBruta?.content === "string"
            ? mensagemBruta.content
            : (diag.description ?? "erro");
      const codigo = diag.category ?? diag.severity ?? "lint";
      const linha = 1;
      saida.push({ arquivo, codigo, linha, mensagem });
    }
  } catch {
    // JSON inválido — ignora
  }
  return saida;
}

function formatar(diagnosticos: readonly DiagnosticoLinha[]): string {
  if (diagnosticos.length === 0) {
    return "Nenhum diagnóstico encontrado.";
  }
  const linhas = diagnosticos
    .slice(0, MAX_DIAGNOSTICS)
    .map((d) => `${d.arquivo}:${d.linha}:${d.codigo}:${d.mensagem}`);
  const rodape =
    diagnosticos.length > MAX_DIAGNOSTICS
      ? `\n…[${diagnosticos.length - MAX_DIAGNOSTICS} diagnósticos omitidos]…`
      : "";
  return `${linhas.join("\n")}${rodape}`;
}

async function rodarBiome(cwd: string, paths: readonly string[]): Promise<DiagnosticoLinha[] | undefined> {
  const alvos = paths.length > 0 ? paths : ["."];
  const tentativas: readonly (readonly [string, string[]])[] = [
    ["npx", ["--yes", "biome", "check", "--reporter=json", ...alvos]],
    ["pnpm", ["exec", "biome", "check", "--reporter=json", ...alvos]],
  ];
  for (const [comando, args] of tentativas) {
    const resultado = await executar(cwd, comando, args);
    if (resultado === undefined) {
      continue;
    }
    const parsed = parseBiome(resultado.stdout);
    if (parsed.length > 0 || resultado.stdout.includes("diagnostics")) {
      return parsed;
    }
    if (resultado.stderr.includes("biome") || resultado.stdout.trim() !== "") {
      return parsed;
    }
  }
  return undefined;
}

async function rodarTsc(cwd: string): Promise<DiagnosticoLinha[] | undefined> {
  if (!(await arquivoExiste(`${cwd}/tsconfig.json`))) {
    return undefined;
  }
  const resultado = await executar(cwd, "npx", ["--yes", "tsc", "--noEmit", "--pretty", "false"]);
  if (resultado === undefined) {
    return undefined;
  }
  return parseTsc(resultado.stdout, resultado.stderr);
}

export const getDiagnosticsTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const cwd = context.workspace.root;
    const paths = pathsDeInput(input.paths);
    const diagnosticos: DiagnosticoLinha[] = [];
    let biomeDisponivel = false;
    let tscDisponivel = false;

    const biome = await rodarBiome(cwd, paths);
    if (biome !== undefined) {
      biomeDisponivel = true;
      diagnosticos.push(...biome);
    }

    const tsc = await rodarTsc(cwd);
    if (tsc !== undefined) {
      tscDisponivel = true;
      diagnosticos.push(...tsc);
    }

    if (!biomeDisponivel && !tscDisponivel) {
      return textResult(
        "Ferramentas de diagnóstico indisponíveis (Biome e TypeScript não encontrados ou falharam).",
      );
    }

    return textResult(formatar(diagnosticos));
  },
};
