import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { textResult } from "../tool.js";
import type { ExecutableTool, ToolContext } from "../tool.js";
import { abrirStoreComIndice } from "../vector/vector-index.js";
import type { ChunkHit } from "../vector/vector-store.js";

/**
 * Busca semântica/léxica local (SQLite FTS5 + embeddings locais) no repositório.
 * Use quando o repo_map for insuficiente e você precisar de trechos concretos.
 */

const definition: Tool = {
  description:
    "Busca trechos de código semanticamente relevantes no repositório (índice vetorial local " +
    "em .codingpro/vector-index.sqlite + FTS5). Use quando o repo_map não bastar e você " +
    "precisar de pedaços reais de implementação. `query` em linguagem natural ou símbolos. " +
    "Não usa rede. Na 1ª chamada pode indexar (incremental).",
  inputSchema: {
    additionalProperties: false,
    properties: {
      query: {
        description: "Consulta (ex.: 'onde o pagamento é validado', 'auth middleware').",
        type: "string",
      },
      topK: {
        description: "Quantidade de trechos (1–20, padrão 6).",
        type: "integer",
      },
      reindex: {
        description: "Se true, força reindexação incremental antes da busca.",
        type: "boolean",
      },
    },
    required: ["query"],
    type: "object",
  },
  name: "code_search",
};

function formatarHits(hits: readonly ChunkHit[]): string {
  if (hits.length === 0) {
    return "Nenhum trecho relevante encontrado. Tente outros termos ou rode /index.";
  }
  return hits
    .map((h, i) => {
      const head = `${i + 1}. ${h.path}:${h.startLine}-${h.endLine}  (score ${h.score.toFixed(3)} · ${h.source})`;
      const body = h.content
        .split("\n")
        .slice(0, 40)
        .map((l) => `   ${l}`)
        .join("\n");
      return `${head}\n${body}`;
    })
    .join("\n\n");
}

export const codeSearchTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (query.length === 0) {
      return textResult("Informe uma query não vazia.");
    }
    const topK =
      typeof input.topK === "number" && Number.isFinite(input.topK) ? Math.trunc(input.topK) : 6;
    const reindex = input.reindex === true;

    const { store, result } = await abrirStoreComIndice(context.workspace, {
      force: reindex,
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    try {
      const hits = store.buscar(query, topK);
      const cab =
        result === undefined
          ? ""
          : `(índice atualizado: +${result.updated} arquivos, ${result.chunks} chunks)\n\n`;
      return textResult(cab + formatarHits(hits));
    } finally {
      store.close();
    }
  },
};
