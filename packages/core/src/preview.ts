import type { JsonObject } from "@codingpro/llm";
import { diffLinhas, type FormatarDiffOptions, formatarDiff } from "./diff.js";
import { CoreError } from "./errors.js";
import { readFileWithin } from "./fs-safe.js";
import { aplicarEdicoes, EDIT_FILE_MAX_BYTES, parseEditBlocks } from "./tools/edit-file.js";
import type { Workspace } from "./workspace.js";

/** Estado antes/depois de uma escrita, para prévia de diff na aprovação. */
export interface PreviaEscrita {
  readonly path: string;
  readonly antes: string;
  readonly depois: string;
}

/** Acima disto a prévia não roda o diff (custo O(n·m)); mostra só um resumo. */
export const PREVIA_MAX_LINHAS = 2000;

async function lerOuVazio(workspace: Workspace, absolute: string): Promise<string> {
  try {
    return (await readFileWithin(workspace, absolute, EDIT_FILE_MAX_BYTES)).toString("utf8");
  } catch (error) {
    if (error instanceof CoreError && error.code === "not-found") {
      return "";
    }
    throw error;
  }
}

/**
 * Calcula o antes/depois de uma escrita (`write_file` ou `edit_file`) para pré-visualizar o diff
 * antes da aprovação. Best-effort: qualquer problema (input inválido, match que falha, arquivo
 * ausente para editar) devolve `undefined` — a prévia é opcional e nunca bloqueia a aprovação.
 */
export async function resolverPreviaDeEscrita(
  workspace: Workspace,
  toolName: string,
  input: JsonObject,
): Promise<PreviaEscrita | undefined> {
  try {
    const path = typeof input.path === "string" ? input.path : undefined;
    if (path === undefined) {
      return undefined;
    }
    const absolute = workspace.resolve(path);
    const rel = workspace.toRelative(absolute);

    if (toolName === "write_file") {
      if (typeof input.content !== "string") {
        return undefined;
      }
      return { antes: await lerOuVazio(workspace, absolute), depois: input.content, path: rel };
    }
    if (toolName === "edit_file") {
      const edits = parseEditBlocks(input.edits);
      const antes = await lerOuVazio(workspace, absolute);
      const resultado = aplicarEdicoes(antes, edits, rel);
      if ("erro" in resultado) {
        return undefined;
      }
      return { antes, depois: resultado.texto, path: rel };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Renderiza a prévia como um bloco pt-BR: cabeçalho com o caminho + diff unificado enxuto.
 * Devolve `undefined` quando não há alteração ou quando o arquivo é grande demais para diferenciar.
 */
export function formatarPreviaDeEscrita(
  previa: PreviaEscrita,
  options?: FormatarDiffOptions,
): string | undefined {
  if (previa.antes === previa.depois) {
    return undefined;
  }
  const linhasAntes = previa.antes.length === 0 ? 0 : previa.antes.split("\n").length;
  const linhasDepois = previa.depois.length === 0 ? 0 : previa.depois.split("\n").length;
  if (Math.max(linhasAntes, linhasDepois) > PREVIA_MAX_LINHAS) {
    return `── ${previa.path} ── arquivo grande (${linhasAntes}→${linhasDepois} linhas), prévia omitida`;
  }
  const corpo = formatarDiff(diffLinhas(previa.antes, previa.depois), options);
  return `── ${previa.path} ──\n${corpo}`;
}
