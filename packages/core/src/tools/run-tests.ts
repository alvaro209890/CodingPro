import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { JsonObject, JsonValue, Tool, ToolResult } from "@codingpro/llm";
import { detectarProjeto } from "../project-detect.js";
import { type ExecutableTool, type ToolContext, errorResult, textResult, truncateToolOutput } from "../tool.js";

const execFileAsync = promisify(execFile);
const RUN_TESTS_DEFAULT_TIMEOUT_MS = 120_000;
const RUN_TESTS_MAX_TIMEOUT_MS = 180_000;
const RUN_TESTS_OUTPUT_BUDGET_TOKENS = 2000;
const MAX_FALHAS = 15;

const definition: Tool = {
  description:
    "Roda os testes do projeto e devolve um resumo estruturado com falhas (nome, arquivo:linha, " +
    "trecho do erro). Efeito colateral: execução.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      filter: {
        description: "Filtro de nome de teste (repassado ao runner quando suportado).",
        type: "string",
      },
      timeoutMs: {
        description: "Tempo máximo em ms (teto de 180000).",
        type: "integer",
      },
    },
    type: "object",
  },
  name: "run_tests",
};

interface FalhaTeste {
  readonly nome: string;
  readonly arquivo?: string;
  readonly linha?: number;
  readonly erro: string;
}

function clampTimeout(value: JsonValue | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return RUN_TESTS_DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.max(1, Math.trunc(value)), RUN_TESTS_MAX_TIMEOUT_MS);
}

function textoOpcional(valor: JsonValue | undefined): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

interface ComandoTeste {
  readonly comando: string;
  readonly args: readonly string[];
}

function montarComando(
  info: Awaited<ReturnType<typeof detectarProjeto>>,
  filter?: string,
): ComandoTeste {
  const scriptTest = info.scripts.test;
  if (scriptTest !== undefined) {
    const gerenciador = info.gerenciador?.toLowerCase();
    if (gerenciador === "pnpm") {
      const args = ["test"];
      if (filter !== undefined) {
        args.push("--", filter);
      }
      return { args, comando: "pnpm" };
    }
    if (gerenciador === "yarn") {
      const args = ["test"];
      if (filter !== undefined) {
        args.push(filter);
      }
      return { args, comando: "yarn" };
    }
    const args = ["test"];
    if (filter !== undefined) {
      args.push("--", filter);
    }
    return { args, comando: "npm" };
  }

  const ferramenta = info.ferramentaTestes?.toLowerCase();
  if (ferramenta === "vitest") {
    const args = ["--yes", "vitest", "run", "--reporter=json"];
    if (filter !== undefined) {
      args.push("-t", filter);
    }
    return { args, comando: "npx" };
  }
  if (ferramenta === "jest") {
    const args = ["--yes", "jest", "--json"];
    if (filter !== undefined) {
      args.push("-t", filter);
    }
    return { args, comando: "npx" };
  }
  if (ferramenta === "pytest") {
    const args = ["pytest", "-q"];
    if (filter !== undefined) {
      args.push("-k", filter);
    }
    return { args, comando: "python" };
  }

  return { args: ["test"], comando: "npm" };
}

function parseVitest(stdout: string): { falhas: FalhaTeste[]; passou: number; falhou: number } | undefined {
  const falhas: FalhaTeste[] = [];
  try {
    const json = JSON.parse(stdout) as {
      numPassedTests?: number;
      numFailedTests?: number;
      testResults?: Array<{
        name?: string;
        assertionResults?: Array<{
          status?: string;
          title?: string;
          failureMessages?: string[];
          location?: { line?: number; column?: number };
        }>;
      }>;
    };
    if (!Array.isArray(json.testResults) && json.numPassedTests === undefined) {
      return undefined;
    }
    const passou = json.numPassedTests ?? 0;
    const falhou = json.numFailedTests ?? 0;
    for (const suite of json.testResults ?? []) {
      const arquivo = suite.name;
      for (const teste of suite.assertionResults ?? []) {
        if (teste.status !== "failed") {
          continue;
        }
        falhas.push({
          ...(arquivo === undefined ? {} : { arquivo }),
          erro: (teste.failureMessages ?? []).join("\n").slice(0, 500),
          ...(teste.location?.line === undefined ? {} : { linha: teste.location.line }),
          nome: teste.title ?? "teste sem nome",
        });
      }
    }
    return { falhas, falhou, passou };
  } catch {
    return undefined;
  }
}

function parseJest(stdout: string): { falhas: FalhaTeste[]; passou: number; falhou: number } | undefined {
  const falhas: FalhaTeste[] = [];
  try {
    const json = JSON.parse(stdout) as {
      numPassedTests?: number;
      numFailedTests?: number;
      testResults?: Array<{
        name?: string;
        assertionResults?: Array<{
          status?: string;
          title?: string;
          failureMessages?: string[];
          location?: { line?: number };
        }>;
      }>;
    };
    if (!Array.isArray(json.testResults) && json.numPassedTests === undefined) {
      return undefined;
    }
    const passou = json.numPassedTests ?? 0;
    const falhou = json.numFailedTests ?? 0;
    for (const suite of json.testResults ?? []) {
      const arquivo = suite.name;
      for (const teste of suite.assertionResults ?? []) {
        if (teste.status !== "failed") {
          continue;
        }
        falhas.push({
          ...(arquivo === undefined ? {} : { arquivo }),
          erro: (teste.failureMessages ?? []).join("\n").slice(0, 500),
          ...(teste.location?.line === undefined ? {} : { linha: teste.location.line }),
          nome: teste.title ?? "teste sem nome",
        });
      }
    }
    return { falhas, falhou, passou };
  } catch {
    return undefined;
  }
}

function parseSaidaBruta(stdout: string, stderr: string): { falhas: FalhaTeste[]; passou: number; falhou: number } {
  const texto = `${stdout}\n${stderr}`.trim();
  const falhou = /fail|falhou|failed/i.test(texto) ? 1 : 0;
  const passou = falhou === 0 ? 1 : 0;
  if (falhou === 0) {
    return { falhas: [], falhou: 0, passou };
  }
  return {
    falhas: [{ erro: texto.slice(0, 1000), nome: "saída do runner" }],
    falhou: 1,
    passou: 0,
  };
}

function formatarResumo(
  passou: number,
  falhou: number,
  falhas: readonly FalhaTeste[],
): string {
  if (falhou === 0 && falhas.length === 0) {
    const total = passou > 0 ? passou : passou + falhou;
    return `Todos os testes passaram (${total}).`;
  }
  const linhas = [
    `Resultado: ${passou} passaram, ${falhou} falharam.`,
    "",
    "Falhas:",
  ];
  for (const falha of falhas.slice(0, MAX_FALHAS)) {
    const local =
      falha.arquivo !== undefined
        ? `${falha.arquivo}${falha.linha !== undefined ? `:${falha.linha}` : ""}`
        : "?";
    linhas.push(`- ${falha.nome} (${local})`);
    linhas.push(`  ${falha.erro.split("\n")[0] ?? ""}`);
  }
  if (falhas.length > MAX_FALHAS) {
    linhas.push(`…[${falhas.length - MAX_FALHAS} falhas omitidas]…`);
  }
  const { text } = truncateToolOutput(linhas.join("\n"), RUN_TESTS_OUTPUT_BUDGET_TOKENS);
  return text;
}

export const runTestsTool: ExecutableTool = {
  definition,
  sideEffect: "exec",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const cwd = context.workspace.root;
    const filter = textoOpcional(input.filter);
    const timeoutMs = clampTimeout(input.timeoutMs);
    const info = await detectarProjeto(context.workspace);
    const { comando, args } = montarComando(info, filter);

    let stdout = "";
    let stderr = "";
    try {
      const resultado = await execFileAsync(comando, [...args], {
        cwd,
        maxBuffer: 4_000_000,
        timeout: timeoutMs,
      });
      stdout = resultado.stdout;
      stderr = resultado.stderr;
    } catch (error) {
      const parcial = error as { stdout?: string; stderr?: string; message?: string };
      stdout = parcial.stdout ?? "";
      stderr = parcial.stderr ?? parcial.message ?? "";
      if (stdout === "" && stderr === "") {
        return errorResult("Não foi possível executar os testes do projeto.");
      }
    }

    const saida = stdout.trim();
    const isJsonReporter = args.includes("--reporter=json") || args.includes("--json");
    const parsed =
      (isJsonReporter ? (parseVitest(saida) ?? parseJest(saida)) : undefined) ??
      parseSaidaBruta(stdout, stderr);

    return textResult(formatarResumo(parsed.passou, parsed.falhou, parsed.falhas));
  },
};
