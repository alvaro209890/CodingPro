import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { gitOk, saidaGit } from "../review.js";
import { type ExecutableTool, type ToolContext, errorResult, textResult } from "../tool.js";

const definition: Tool = {
  description:
    "Mostra o estado do working tree git (branch, staged e unstaged) em formato resumido. " +
    "Somente leitura.",
  inputSchema: {
    additionalProperties: false,
    properties: {},
    type: "object",
  },
  name: "git_status",
};

export const gitStatusTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(_input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const cwd = context.workspace.root;
    if (!(await gitOk(cwd, ["rev-parse", "--is-inside-work-tree"]))) {
      return errorResult("não é um repositório git");
    }
    const stdout = await saidaGit(cwd, ["status", "--porcelain=v1", "-b"]);
    if (stdout === undefined) {
      return errorResult("não foi possível obter o status do git");
    }
    const resumo = stdout.trim();
    const linhasArquivo = resumo.split("\n").filter((linha) => !linha.startsWith("##"));
    if (resumo === "" || linhasArquivo.length === 0) {
      return textResult("working tree limpo");
    }
    return textResult(resumo);
  },
};
