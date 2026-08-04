import type { JsonObject, JsonValue, Tool, ToolResult } from "@codingpro/llm";
import { gitOk, obterDiff, saidaGit } from "../review.js";
import { type ExecutableTool, type ToolContext, errorResult, textResult } from "../tool.js";

const MAX_DIFF_LINHAS = 400;

const definition: Tool = {
  description:
    "Mostra o diff git do projeto. Por padrão usa --stat (resumo). " +
    "Com stat=false, devolve o patch completo com teto de linhas.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      alvo: {
        description: "Ref git para comparar (ex.: main, HEAD~3). Padrão: working tree.",
        type: "string",
      },
      path: {
        description: "Caminho relativo para limitar o diff a um arquivo ou pasta.",
        type: "string",
      },
      stat: {
        description: "Se true (padrão), devolve apenas --stat; se false, o patch completo.",
        type: "boolean",
      },
    },
    type: "object",
  },
  name: "git_diff",
};

function textoOpcional(valor: JsonValue | undefined): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

function boolOpcional(valor: JsonValue | undefined, padrao: boolean): boolean {
  return typeof valor === "boolean" ? valor : padrao;
}

function argsComPath(base: string[], path?: string): string[] {
  return path === undefined ? base : [...base, "--", path];
}

function limitarLinhas(texto: string, maxLinhas: number): string {
  const linhas = texto.split("\n");
  if (linhas.length <= maxLinhas) {
    return texto;
  }
  const cortadas = linhas.slice(0, maxLinhas);
  const omitidas = linhas.length - maxLinhas;
  return `${cortadas.join("\n")}\n…[${omitidas} linhas omitidas]…`;
}

async function diffStat(
  cwd: string,
  alvo?: string,
  path?: string,
): Promise<string | undefined> {
  const partes: string[] = [];
  const unstaged = alvo
    ? await saidaGit(cwd, argsComPath(["diff", "--stat", alvo], path))
    : await saidaGit(cwd, argsComPath(["diff", "--stat"], path));
  if (unstaged !== undefined && unstaged.trim() !== "") {
    partes.push("## não staged\n" + unstaged.trim());
  }
  const staged = alvo
    ? await saidaGit(cwd, argsComPath(["diff", "--cached", "--stat", alvo], path))
    : await saidaGit(cwd, argsComPath(["diff", "--cached", "--stat"], path));
  if (staged !== undefined && staged.trim() !== "") {
    partes.push("## staged\n" + staged.trim());
  }
  if (partes.length === 0) {
    return "";
  }
  return partes.join("\n\n");
}

export const gitDiffTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const cwd = context.workspace.root;
    if (!(await gitOk(cwd, ["rev-parse", "--is-inside-work-tree"]))) {
      return errorResult("não é um repositório git");
    }

    const alvo = textoOpcional(input.alvo);
    const path = textoOpcional(input.path);
    const stat = boolOpcional(input.stat, true);

    if (stat) {
      const resumo = await diffStat(cwd, alvo, path);
      if (resumo === undefined) {
        return errorResult("não foi possível obter o diff");
      }
      if (resumo === "") {
        return textResult("nenhuma mudança para mostrar");
      }
      return textResult(resumo);
    }

    if (alvo === undefined && path === undefined) {
      const { diff, erro } = await obterDiff(cwd);
      if (erro !== undefined) {
        return errorResult(erro);
      }
      return textResult(limitarLinhas(diff, MAX_DIFF_LINHAS));
    }

    const args = alvo === undefined ? ["diff"] : ["diff", alvo];
    const stdout = await saidaGit(cwd, argsComPath(args, path));
    if (stdout === undefined) {
      return errorResult(`alvo inválido para o diff: ${alvo ?? ""}`.trimEnd());
    }
    const diff = stdout.trim();
    if (diff === "") {
      return textResult("nenhuma mudança para mostrar");
    }
    return textResult(limitarLinhas(diff, MAX_DIFF_LINHAS));
  },
};
