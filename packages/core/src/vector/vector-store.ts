/**
 * Loja SQLite local (node:sqlite) para índice de código:
 * - tabela `files` (mtime/size p/ incremental)
 * - tabela `chunks` + embeddings BLOB
 * - FTS5 em `chunks_fts` para recuperação léxica rápida
 *
 * 100% local — sem rede, sem sqlite-vss nativo.
 *
 * `node:sqlite` é carregado sob demanda (não no top-level) para o core poder
 * importar em runtimes sem o built-in (ex.: Electron 34 / Node 20).
 */

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CoreError } from "../errors.js";
import type { CodeChunk } from "./chunking.js";
import {
  blobParaEmbedding,
  cosseno,
  EMBEDDING_DIM,
  embeddingParaBlob,
  embedTexto,
} from "./embeddings.js";

export const VECTOR_DB_FILENAME = "vector-index.sqlite";
export const VECTOR_SCHEMA_VERSION = "1";

/** Superfície mínima do DatabaseSync usada aqui (evita import estático de node:sqlite). */
interface SqliteStatement {
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  };
  all(...params: unknown[]): unknown[];
}

interface SqliteDatabase {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

type SqliteDatabaseCtor = new (path: string) => SqliteDatabase;

let cachedDatabaseSync: SqliteDatabaseCtor | undefined;

async function carregarDatabaseSync(): Promise<SqliteDatabaseCtor> {
  if (cachedDatabaseSync !== undefined) {
    return cachedDatabaseSync;
  }
  try {
    const mod = (await import("node:sqlite")) as { DatabaseSync: SqliteDatabaseCtor };
    cachedDatabaseSync = mod.DatabaseSync;
    return cachedDatabaseSync;
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new CoreError(
      "execution-failed",
      `Busca vetorial indisponível neste runtime (node:sqlite): ${detail}. Use Node.js ≥ 22.5 ou a CLI CodingPro.`,
    );
  }
}

export function isNodeSqliteDisponivel(): boolean {
  try {
    const req = createRequire(import.meta.url);
    req("node:sqlite");
    return true;
  } catch {
    return false;
  }
}

export interface ChunkHit {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly content: string;
  readonly score: number;
  readonly source: "fts" | "vector" | "hybrid";
}

export interface IndexFileRecord {
  readonly path: string;
  readonly mtimeMs: number;
  readonly size: number;
}

export interface VectorStoreStats {
  readonly files: number;
  readonly chunks: number;
  readonly path: string;
}

function hashConteudo(texto: string): string {
  return createHash("sha256").update(texto).digest("hex").slice(0, 32);
}

/** Escapa query FTS5 simples (aspas e tokens). */
export function sanitizarQueryFts(query: string): string {
  const limpa = query
    .replaceAll('"', " ")
    .replaceAll(/[^\p{L}\p{N}_\s.-]/gu, " ")
    .trim();
  if (limpa.length === 0) {
    return '""';
  }
  // tokens AND para FTS5
  const toks = limpa
    .split(/\s+/u)
    .filter((t) => t.length >= 2)
    .slice(0, 12);
  if (toks.length === 0) {
    return `"${limpa.slice(0, 40)}"`;
  }
  return toks.map((t) => `"${t}"`).join(" ");
}

export class VectorStore {
  private constructor(
    readonly dbPath: string,
    private readonly db: SqliteDatabase,
  ) {}

  static async open(codingproDir: string): Promise<VectorStore> {
    await mkdir(codingproDir, { recursive: true });
    const dbPath = join(codingproDir, VECTOR_DB_FILENAME);
    const DatabaseSync = await carregarDatabaseSync();
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
    const store = new VectorStore(dbPath, db);
    store.migrate();
    return store;
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY NOT NULL,
        mtime_ms REAL NOT NULL,
        size INTEGER NOT NULL,
        lang TEXT,
        indexed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding BLOB,
        UNIQUE(path, chunk_index)
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
    `);
    // FTS5: recria se não existir
    const fts = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'")
      .get() as { name?: string } | undefined;
    if (fts?.name === undefined) {
      this.db.exec(`
        CREATE VIRTUAL TABLE chunks_fts USING fts5(
          content,
          path UNINDEXED,
          chunk_id UNINDEXED,
          tokenize = 'unicode61'
        );
      `);
    }
    this.db
      .prepare(
        "INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(VECTOR_SCHEMA_VERSION);
    this.db
      .prepare(
        "INSERT INTO meta(key, value) VALUES ('embedding_dim', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(String(EMBEDDING_DIM));
  }

  stats(): VectorStoreStats {
    const files = (this.db.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number }).n;
    const chunks = (this.db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n;
    return { chunks, files, path: this.dbPath };
  }

  /** Mapa path → mtime/size atuais no índice. */
  listarArquivosIndexados(): Map<string, IndexFileRecord> {
    const rows = this.db.prepare("SELECT path, mtime_ms AS mtimeMs, size FROM files").all() as {
      path: string;
      mtimeMs: number;
      size: number;
    }[];
    const map = new Map<string, IndexFileRecord>();
    for (const r of rows) {
      map.set(r.path, { mtimeMs: r.mtimeMs, path: r.path, size: r.size });
    }
    return map;
  }

  removerArquivo(path: string): void {
    const ids = this.db.prepare("SELECT id FROM chunks WHERE path = ?").all(path) as {
      id: number;
    }[];
    for (const { id } of ids) {
      this.db.prepare("DELETE FROM chunks_fts WHERE chunk_id = ?").run(String(id));
    }
    this.db.prepare("DELETE FROM chunks WHERE path = ?").run(path);
    this.db.prepare("DELETE FROM files WHERE path = ?").run(path);
  }

  /** Substitui todos os chunks de um arquivo (transação). */
  upsertArquivo(
    path: string,
    mtimeMs: number,
    size: number,
    lang: string | undefined,
    chunks: readonly CodeChunk[],
  ): void {
    this.db.exec("BEGIN");
    try {
      this.removerArquivo(path);
      const insFile = this.db.prepare(
        "INSERT INTO files(path, mtime_ms, size, lang, indexed_at) VALUES (?, ?, ?, ?, ?)",
      );
      insFile.run(path, mtimeMs, size, lang ?? null, new Date().toISOString());

      const insChunk = this.db.prepare(
        `INSERT INTO chunks(path, chunk_index, start_line, end_line, content, content_hash, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const insFts = this.db.prepare(
        "INSERT INTO chunks_fts(content, path, chunk_id) VALUES (?, ?, ?)",
      );

      for (const ch of chunks) {
        const hash = hashConteudo(ch.content);
        const emb = embeddingParaBlob(embedTexto(ch.content));
        const info = insChunk.run(
          path,
          ch.chunkIndex,
          ch.startLine,
          ch.endLine,
          ch.content,
          hash,
          emb,
        );
        const id = Number(info.lastInsertRowid);
        insFts.run(ch.content, path, String(id));
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * Busca híbrida: FTS5 (léxico) + cosseno nos embeddings (vetorial local).
   * Score final: 0.55 * vec + 0.45 * fts (normalizados).
   */
  buscar(query: string, topK = 8): ChunkHit[] {
    const k = Math.max(1, Math.min(30, Math.trunc(topK)));
    const qEmb = embedTexto(query);
    const ftsQ = sanitizarQueryFts(query);

    const ftsScores = new Map<number, number>();
    try {
      const ftsRows = this.db
        .prepare(
          `SELECT chunk_id AS id, bm25(chunks_fts) AS rank
           FROM chunks_fts
           WHERE chunks_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(ftsQ, k * 4) as { id: string; rank: number }[];
      // bm25: menor é melhor → inverter
      let maxR = 0;
      for (const r of ftsRows) {
        maxR = Math.max(maxR, Math.abs(r.rank));
      }
      for (const r of ftsRows) {
        const id = Number.parseInt(r.id, 10);
        if (!Number.isFinite(id)) {
          continue;
        }
        const s = maxR > 0 ? 1 - Math.abs(r.rank) / (maxR + 1e-6) : 0.5;
        ftsScores.set(id, s);
      }
    } catch {
      // query FTS inválida → só vetorial
    }

    // Candidatos: todos os chunks dos hits FTS + amostra por score vetorial global limitado
    const candidateIds = new Set<number>(ftsScores.keys());
    const all = this.db
      .prepare(
        "SELECT id, path, start_line AS startLine, end_line AS endLine, content, embedding FROM chunks LIMIT 20000",
      )
      .all() as {
      id: number;
      path: string;
      startLine: number;
      endLine: number;
      content: string;
      embedding: Buffer | Uint8Array | null;
    }[];

    const scored: ChunkHit[] = [];
    for (const row of all) {
      let vecScore = 0;
      if (row.embedding !== null && row.embedding !== undefined) {
        try {
          const emb = blobParaEmbedding(row.embedding);
          vecScore = (cosseno(qEmb, emb) + 1) / 2; // [0,1]
        } catch {
          vecScore = 0;
        }
      }
      const fts = ftsScores.get(row.id) ?? 0;
      // se nem FTS nem vec, ignora (acelera)
      if (fts === 0 && vecScore < 0.55 && candidateIds.size > 0 && !candidateIds.has(row.id)) {
        // ainda avalia todos se poucos; se muitos e score baixo e não-FTS, skip
        if (all.length > 2_000 && vecScore < 0.58) {
          continue;
        }
      }
      const hybrid = 0.55 * vecScore + 0.45 * fts;
      const source: ChunkHit["source"] =
        fts > 0 && vecScore > 0 ? "hybrid" : fts > 0 ? "fts" : "vector";
      scored.push({
        content: row.content,
        endLine: row.endLine,
        path: row.path,
        score: hybrid,
        source,
        startLine: row.startLine,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    // dedupe por path+startLine
    const seen = new Set<string>();
    const out: ChunkHit[] = [];
    for (const h of scored) {
      const key = `${h.path}:${h.startLine}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(h);
      if (out.length >= k) {
        break;
      }
    }
    return out;
  }
}

export function caminhoDbPadrao(workspaceRoot: string): string {
  return join(workspaceRoot, ".codingpro", VECTOR_DB_FILENAME);
}

export function dirCodingpro(workspaceRoot: string): string {
  return dirname(caminhoDbPadrao(workspaceRoot));
}
