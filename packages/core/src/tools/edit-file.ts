import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { CoreError } from "../errors.js";
import { readFileWithin, writeFileWithin } from "../fs-safe.js";
import { type ExecutableTool, errorResult, textResult, type ToolContext } from "../tool.js";

/** Teto do arquivo resultante da edição: 1 MiB (igual ao write_file). */
export const EDIT_FILE_MAX_BYTES = 1_048_576;
/** Máximo de blocos search/replace por chamada. */
export const EDIT_FILE_MAX_BLOCKS = 64;

/** Um bloco de edição: o trecho exato atual (`search`) e o que o substitui (`replace`). */
export interface EditBlock {
  readonly search: string;
  readonly replace: string;
}

const definition: Tool = {
  description:
    "Edita um arquivo de texto por blocos search/replace. Cada 'search' deve casar exatamente " +
    "uma vez (incluindo indentação). A aplicação é atômica: ou todos os blocos entram, ou nenhum. " +
    "O arquivo precisa ter sido lido com read_file antes.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      edits: {
        description: "Lista de blocos a aplicar em ordem (ao menos um).",
        items: {
          additionalProperties: false,
          properties: {
            replace: { description: "Trecho novo que substitui o encontrado.", type: "string" },
            search: { description: "Trecho exato atual do arquivo a localizar.", type: "string" },
          },
          required: ["search", "replace"],
          type: "object",
        },
        type: "array",
      },
      path: { description: "Caminho do arquivo, relativo à raiz do projeto.", type: "string" },
    },
    required: ["path", "edits"],
    type: "object",
  },
  name: "edit_file",
};

/** Valida e normaliza o campo `edits`; lança `invalid-input` em qualquer desvio. */
export function parseEditBlocks(raw: unknown): EditBlock[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CoreError("invalid-input", "Informe ao menos um bloco de edição.");
  }
  if (raw.length > EDIT_FILE_MAX_BLOCKS) {
    throw new CoreError("invalid-input", `No máximo ${EDIT_FILE_MAX_BLOCKS} blocos por chamada.`);
  }
  return raw.map((item, index) => {
    const bloco = item as { search?: unknown; replace?: unknown };
    if (typeof bloco?.search !== "string" || typeof bloco?.replace !== "string") {
      throw new CoreError(
        "invalid-input",
        `Bloco ${index + 1}: search e replace precisam ser texto.`,
      );
    }
    if (bloco.search.length === 0) {
      throw new CoreError(
        "invalid-input",
        `Bloco ${index + 1}: o trecho 'search' não pode ser vazio.`,
      );
    }
    return { replace: bloco.replace, search: bloco.search };
  });
}

/** Conta ocorrências (literais, sem regex) de `needle` em `haystack`. */
export function contarOcorrencias(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

/** Linha do arquivo mais parecida com a 1ª linha do trecho buscado (dica de match falho). */
export function linhaMaisProxima(conteudo: string, trecho: string): string | undefined {
  const alvo = (trecho.split("\n")[0] ?? "").trim();
  if (alvo.length === 0) {
    return undefined;
  }
  let melhor: string | undefined;
  let melhorPontos = 0;
  for (const linha of conteudo.split("\n")) {
    const candidata = linha.trim();
    if (candidata.length === 0) {
      continue;
    }
    let pontos = 0;
    const limite = Math.min(candidata.length, alvo.length);
    while (pontos < limite && candidata[pontos] === alvo[pontos]) {
      pontos += 1;
    }
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhor = linha;
    }
  }
  return melhorPontos >= 3 ? melhor : undefined;
}

function mensagemMatchFalho(rel: string, indice: number, search: string, conteudo: string): string {
  const proxima = linhaMaisProxima(conteudo, search);
  const dica =
    proxima === undefined
      ? "Releia o arquivo com read_file e copie o trecho exato."
      : `A linha mais parecida é: ${proxima.trim()}`;
  return `Bloco ${indice + 1}: não encontrei o trecho em ${rel}. Confira espaços e indentação. ${dica}`;
}

/**
 * Aplica os blocos em sequência a uma cópia de trabalho. Cada `search` deve casar exatamente
 * uma vez na cópia atual (permite que um bloco edite texto produzido por outro anterior).
 * Substituição literal via split/join — nunca interpreta `$` do replace. Devolve o texto final
 * ou uma mensagem de erro estruturada para o modelo se corrigir.
 */
export function aplicarEdicoes(
  original: string,
  edits: readonly EditBlock[],
  rel: string,
): { texto: string } | { erro: string } {
  let atual = original;
  for (let i = 0; i < edits.length; i += 1) {
    const { search, replace } = edits[i] as EditBlock;
    const ocorrencias = contarOcorrencias(atual, search);
    if (ocorrencias === 0) {
      return { erro: mensagemMatchFalho(rel, i, search, atual) };
    }
    if (ocorrencias > 1) {
      return {
        erro: `Bloco ${i + 1}: o trecho aparece ${ocorrencias} vezes em ${rel}; inclua mais contexto para casar exatamente uma vez.`,
      };
    }
    atual = atual.split(search).join(replace);
  }
  return { texto: atual };
}

export const editFileTool: ExecutableTool = {
  definition,
  sideEffect: "write",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const edits = parseEditBlocks(input.edits);
    const absolute = context.workspace.resolve(input.path);
    const rel = context.workspace.toRelative(absolute);

    if (context.readTracker !== undefined && !context.readTracker.wasRead(rel)) {
      return errorResult(
        `Leia ${rel} com read_file antes de editar — edição às cegas é bloqueada.`,
      );
    }

    const original = (
      await readFileWithin(context.workspace, absolute, EDIT_FILE_MAX_BYTES)
    ).toString("utf8");

    const resultado = aplicarEdicoes(original, edits, rel);
    if ("erro" in resultado) {
      return errorResult(resultado.erro);
    }
    if (resultado.texto === original) {
      return textResult(`Nenhuma mudança: o conteúdo de ${rel} já era o desejado.`);
    }

    // Captura o estado pré-edição antes de gravar, para permitir /undo.
    await context.checkpoints?.capture(rel);
    const bytes = await writeFileWithin(
      context.workspace,
      absolute,
      resultado.texto,
      EDIT_FILE_MAX_BYTES,
    );
    return textResult(`Arquivo editado: ${rel} (${edits.length} bloco(s), ${bytes} bytes).`);
  },
};
