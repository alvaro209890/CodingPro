import type { JsonObject, JsonValue, Tool, ToolResult } from "@codingpro/llm";
import { construirRepoMap } from "../repo-map.js";
import type { ExecutableTool, ToolContext } from "../tool.js";
import { textResult } from "../tool.js";

/**
 * Expõe o repo map ao modelo: uma visão de alto nível do projeto (arquivos + assinaturas),
 * ranqueada por importância, para responder "onde X é tratado?" sem grep cego. Só lê.
 */

const definition: Tool = {
  description:
    "Mapa de alto nível do projeto: os arquivos de código mais importantes e suas assinaturas " +
    "(funções, classes, tipos), ranqueados por quantas vezes são referenciados. Use `foco` com " +
    "caminhos de arquivos relevantes ao pedido para priorizá-los e aos seus vizinhos.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      foco: {
        description: "Caminhos relativos a priorizar no ranking.",
        items: { type: "string" },
        type: "array",
      },
      maxTokens: { description: "Orçamento aproximado de tokens do mapa.", type: "integer" },
    },
    type: "object",
  },
  name: "repo_map",
};

function focoDe(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const paths = value.filter((v): v is string => typeof v === "string");
  return paths.length === 0 ? undefined : paths;
}

export const repoMapTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const foco = focoDe(input.foco);
    const orcamento = typeof input.maxTokens === "number" ? Math.trunc(input.maxTokens) : undefined;
    const mapa = await construirRepoMap(context.workspace, {
      ...(foco === undefined ? {} : { foco }),
      ...(orcamento === undefined ? {} : { orcamentoTokens: orcamento }),
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    const rodape = mapa.truncado
      ? `\n\n(mapa truncado; ${mapa.totalArquivos} arquivos indexados no total)`
      : "";
    return textResult(mapa.texto + rodape);
  },
};
