/**
 * Indexação incremental do repositório → VectorStore.
 * Varre arquivos de código, fragmenta, gera embeddings locais e grava SQLite.
 */

import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readFileWithin } from "../fs-safe.js";
import { linguagemDeArquivo } from "../symbols.js";
import type { Workspace } from "../workspace.js";
import { fragmentarCodigo } from "./chunking.js";
import { dirCodingpro, type VectorStore, VectorStore as VS } from "./vector-store.js";

const IGNORAR_DIRS = new Set([
  ".cache",
  ".codingpro",
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
  "venv",
]);

export const VECTOR_MAX_ARQUIVOS = 3_000;
export const VECTOR_MAX_FILE_BYTES = 512_000;
const MAX_PROFUNDIDADE = 14;

export interface IndexProgresso {
  readonly phase: "scan" | "index" | "done";
  readonly path?: string;
  readonly current: number;
  readonly total: number;
  readonly updated: number;
  readonly removed: number;
}

export interface IndexResult {
  readonly updated: number;
  readonly removed: number;
  readonly unchanged: number;
  readonly files: number;
  readonly chunks: number;
  readonly dbPath: string;
}

async function coletarArquivos(
  workspace: Workspace,
  maxArquivos: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const relativos: string[] = [];
  const fila: { rel: string; profundidade: number }[] = [{ profundidade: 0, rel: "." }];
  while (fila.length > 0 && relativos.length < maxArquivos) {
    if (signal?.aborted === true) {
      break;
    }
    const atual = fila.shift();
    if (atual === undefined) {
      break;
    }
    const absolute = atual.rel === "." ? workspace.root : join(workspace.root, atual.rel);
    let entradas: Dirent[];
    try {
      entradas = await readdir(absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entrada of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entrada.isSymbolicLink()) {
        continue;
      }
      const rel = atual.rel === "." ? entrada.name : `${atual.rel}/${entrada.name}`;
      if (entrada.isDirectory()) {
        if (!IGNORAR_DIRS.has(entrada.name) && atual.profundidade < MAX_PROFUNDIDADE) {
          fila.push({ profundidade: atual.profundidade + 1, rel });
        }
      } else if (entrada.isFile() && linguagemDeArquivo(entrada.name) !== undefined) {
        relativos.push(rel.replaceAll("\\", "/"));
        if (relativos.length >= maxArquivos) {
          break;
        }
      }
    }
  }
  return relativos;
}

export interface IndexarOptions {
  readonly maxArquivos?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (p: IndexProgresso) => void;
  /** Store já aberto; se ausente, abre `.codingpro/vector-index.sqlite`. */
  readonly store?: VectorStore;
}

/**
 * Atualiza o índice de forma incremental (mtime + size).
 * Remove do índice arquivos que sumiram do disco.
 */
export async function indexarRepositorio(
  workspace: Workspace,
  options: IndexarOptions = {},
): Promise<IndexResult> {
  const maxArquivos = Math.max(1, options.maxArquivos ?? VECTOR_MAX_ARQUIVOS);
  const ownStore = options.store === undefined;
  const store = options.store ?? (await VS.open(dirCodingpro(workspace.root)));

  try {
    options.onProgress?.({ current: 0, phase: "scan", removed: 0, total: 0, updated: 0 });
    const paths = await coletarArquivos(workspace, maxArquivos, options.signal);
    const indexed = store.listarArquivosIndexados();
    const vivos = new Set(paths);

    let removed = 0;
    for (const path of indexed.keys()) {
      if (!vivos.has(path)) {
        store.removerArquivo(path);
        removed += 1;
      }
    }

    let updated = 0;
    let unchanged = 0;
    let i = 0;
    for (const rel of paths) {
      if (options.signal?.aborted === true) {
        break;
      }
      i += 1;
      options.onProgress?.({
        current: i,
        path: rel,
        phase: "index",
        removed,
        total: paths.length,
        updated,
      });

      const absolute = workspace.resolve(rel);
      let st: Awaited<ReturnType<typeof stat>>;
      try {
        st = await stat(absolute);
      } catch {
        continue;
      }
      const prev = indexed.get(rel);
      if (prev !== undefined && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
        unchanged += 1;
        continue;
      }

      let texto: string;
      try {
        const bytes = await readFileWithin(workspace, absolute, VECTOR_MAX_FILE_BYTES);
        texto = bytes.toString("utf8");
      } catch {
        continue;
      }
      // pula binários grosseiros
      if (texto.includes("\0")) {
        continue;
      }

      const chunks = fragmentarCodigo(rel, texto);
      if (chunks.length === 0) {
        continue;
      }
      const lang = linguagemDeArquivo(rel);
      store.upsertArquivo(rel, st.mtimeMs, st.size, lang, chunks);
      updated += 1;
    }

    const st = store.stats();
    options.onProgress?.({
      current: paths.length,
      phase: "done",
      removed,
      total: paths.length,
      updated,
    });
    return {
      chunks: st.chunks,
      dbPath: st.path,
      files: st.files,
      removed,
      unchanged,
      updated,
    };
  } finally {
    if (ownStore) {
      store.close();
    }
  }
}

/**
 * Garante índice razoavelmente fresco e devolve store aberto (caller deve `close`).
 * Reindexa se vazio ou se `force`.
 */
export async function abrirStoreComIndice(
  workspace: Workspace,
  options: {
    force?: boolean;
    signal?: AbortSignal;
    onProgress?: IndexarOptions["onProgress"];
  } = {},
): Promise<{ store: VectorStore; result?: IndexResult }> {
  const store = await VS.open(dirCodingpro(workspace.root));
  const st = store.stats();
  if (options.force === true || st.chunks === 0) {
    const result = await indexarRepositorio(workspace, {
      store,
      ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    return { result, store };
  }
  return { store };
}
