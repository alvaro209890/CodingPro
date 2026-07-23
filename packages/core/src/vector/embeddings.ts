/**
 * Embeddings **100% locais** (sem rede, sem modelo externo).
 *
 * Técnica: projeção assinada de n-gramas/tokens em vetor denso de dimensão fixa
 * (bag-of-features + hashing trick), L2-normalizado. Bom o bastante para similaridade
 * lexical-semântica leve em código; upgrade futuro: ONNX/transformers locais.
 */

export const EMBEDDING_DIM = 256;

const IDENT = /[A-Za-z_][\w$]{1,}|[\u00C0-\u024F][\w]{1,}/gu;

/** Tokens + n-gramas de camelCase/snake_case. */
export function tokenizarCodigo(texto: string): string[] {
  const out: string[] = [];
  const matches = texto.match(IDENT) ?? [];
  for (const raw of matches) {
    const t = raw.toLowerCase();
    if (t.length < 2) {
      continue;
    }
    out.push(t);
    // split camelCase / snake
    const parts = t.split(/_+/u).flatMap((p) => p.split(/(?<=[a-z])(?=[A-Z])/u));
    for (const p of parts) {
      const s = p.toLowerCase();
      if (s.length >= 2 && s !== t) {
        out.push(s);
      }
    }
  }
  return out;
}

/** FNV-1a 32-bit estável (sem deps). */
export function hashToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Gera embedding Float32 L2-normalizado. */
export function embedTexto(texto: string, dim = EMBEDDING_DIM): Float32Array {
  const vec = new Float32Array(dim);
  const tokens = tokenizarCodigo(texto);
  if (tokens.length === 0) {
    return vec;
  }
  for (const tok of tokens) {
    const h = hashToken(tok);
    const i = h % dim;
    // sinal estável pelo bit alto
    const sign = (h & 0x8000_0000) === 0 ? 1 : -1;
    // peso log-ish por repetição implícita (cada ocorrência soma)
    vec[i] = (vec[i] ?? 0) + sign;
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i += 1) {
    norm += (vec[i] ?? 0) ** 2;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i += 1) {
      vec[i] = (vec[i] ?? 0) / norm;
    }
  }
  return vec;
}

/** Similaridade de cosseno em [-1, 1]; vetores já normalizados → produto escalar. */
export function cosseno(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    s += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return s;
}

export function embeddingParaBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function blobParaEmbedding(blob: Buffer | Uint8Array): Float32Array {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  // copia alinhada
  const copy = Buffer.from(buf);
  return new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 4));
}
