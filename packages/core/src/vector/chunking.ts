/**
 * Fragmentação (chunking) de código para indexação local.
 * Estratégia: preferir blocos por declaração (função/classe/tipo); fallback janela de linhas.
 * Puro e sem IO.
 */

import { type Linguagem, linguagemDeArquivo } from "../symbols.js";

export interface CodeChunk {
  readonly path: string;
  readonly chunkIndex: number;
  readonly startLine: number; // 1-based
  readonly endLine: number; // 1-based inclusive
  readonly content: string;
  readonly lang?: Linguagem;
}

export const CHUNK_MAX_CHARS = 2_400;
export const CHUNK_WINDOW_LINES = 50;
export const CHUNK_OVERLAP_LINES = 8;
export const CHUNK_MAX_PER_FILE = 80;

/** Início de declaração “forte” por linguagem (heurística de linha). */
function isHeaderLine(lang: Linguagem | undefined, line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.startsWith("//") || t.startsWith("#") || t.startsWith("*")) {
    return false;
  }
  switch (lang) {
    case "ts":
      return /^(export\s+)?(async\s+)?(function|class|interface|type|enum|const|let|var)\b/u.test(
        t,
      );
    case "python":
      return /^(async\s+)?(def|class)\b/u.test(t);
    case "go":
      return /^(func|type|const|var)\b/u.test(t);
    case "java":
      return /^(public|private|protected|internal|open|fun|class|interface|object|data|enum)\b/u.test(
        t,
      );
    case "sql":
      return /^(CREATE|ALTER|CREATE\s+OR\s+REPLACE)\b/iu.test(t);
    default:
      return /^(export\s+)?(function|class|def|func|type)\b/u.test(t);
  }
}

function flush(
  path: string,
  lang: Linguagem | undefined,
  lines: readonly string[],
  startIdx: number,
  endIdx: number,
  chunkIndex: number,
): CodeChunk | undefined {
  if (endIdx < startIdx) {
    return undefined;
  }
  const slice = lines.slice(startIdx, endIdx + 1);
  let content = slice.join("\n").trimEnd();
  if (content.trim().length === 0) {
    return undefined;
  }
  if (content.length > CHUNK_MAX_CHARS) {
    content = `${content.slice(0, CHUNK_MAX_CHARS)}\n…`;
  }
  return {
    chunkIndex,
    content,
    endLine: endIdx + 1,
    ...(lang === undefined ? {} : { lang }),
    path,
    startLine: startIdx + 1,
  };
}

/**
 * Fragmenta o conteúdo de um arquivo em chunks indexáveis.
 * `path` é relativo ao workspace (só metadado).
 */
export function fragmentarCodigo(path: string, texto: string): CodeChunk[] {
  const lang = linguagemDeArquivo(path);
  const lines = texto.replaceAll("\r\n", "\n").split("\n");
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
    return [];
  }

  // Arquivos curtos: um único chunk
  if (lines.length <= CHUNK_WINDOW_LINES && texto.length <= CHUNK_MAX_CHARS) {
    const c = flush(path, lang, lines, 0, lines.length - 1, 0);
    return c === undefined ? [] : [c];
  }

  const headers: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isHeaderLine(lang, lines[i] ?? "")) {
      headers.push(i);
    }
  }

  const out: CodeChunk[] = [];
  let idx = 0;

  if (headers.length >= 2) {
    for (let h = 0; h < headers.length && out.length < CHUNK_MAX_PER_FILE; h += 1) {
      const start = headers[h] as number;
      const endExclusive =
        h + 1 < headers.length ? (headers[h + 1] as number) : Math.min(lines.length, start + 120);
      const end = Math.min(lines.length - 1, endExclusive - 1);
      // Se o bloco for enorme, recorta em janelas
      if (end - start + 1 > CHUNK_WINDOW_LINES * 2) {
        for (
          let s = start;
          s <= end && out.length < CHUNK_MAX_PER_FILE;
          s += CHUNK_WINDOW_LINES - CHUNK_OVERLAP_LINES
        ) {
          const e = Math.min(end, s + CHUNK_WINDOW_LINES - 1);
          const c = flush(path, lang, lines, s, e, idx);
          if (c !== undefined) {
            out.push(c);
            idx += 1;
          }
        }
      } else {
        const c = flush(path, lang, lines, start, end, idx);
        if (c !== undefined) {
          out.push(c);
          idx += 1;
        }
      }
    }
    return out;
  }

  // Fallback: janela deslizante
  for (
    let s = 0;
    s < lines.length && out.length < CHUNK_MAX_PER_FILE;
    s += CHUNK_WINDOW_LINES - CHUNK_OVERLAP_LINES
  ) {
    const e = Math.min(lines.length - 1, s + CHUNK_WINDOW_LINES - 1);
    const c = flush(path, lang, lines, s, e, idx);
    if (c !== undefined) {
      out.push(c);
      idx += 1;
    }
    if (e >= lines.length - 1) {
      break;
    }
  }
  return out;
}
