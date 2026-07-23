import { describe, expect, it } from "vitest";
import {
  blobParaEmbedding,
  cosseno,
  EMBEDDING_DIM,
  embedTexto,
  embeddingParaBlob,
  hashToken,
  tokenizarCodigo,
} from "../src/vector/embeddings.js";

describe("embeddings locais", () => {
  it("tokeniza identificadores e camelCase", () => {
    const t = tokenizarCodigo("validatePaymentAmount payment_amount");
    expect(t.some((x) => x.includes("payment"))).toBe(true);
    expect(t.some((x) => x.includes("validate"))).toBe(true);
    expect(tokenizarCodigo("a")).toEqual([]);
  });

  it("hashToken é estável", () => {
    expect(hashToken("auth")).toBe(hashToken("auth"));
    expect(hashToken("auth")).not.toBe(hashToken("payment"));
  });

  it("embeddings normalizados e similares para textos parecidos", () => {
    const a = embedTexto("function authenticateUser(token) { return verify(token); }");
    const b = embedTexto("function authenticateUser(jwt) { return verify(jwt); }");
    const c = embedTexto("SELECT * FROM orders WHERE total > 10");
    expect(a.length).toBe(EMBEDDING_DIM);
    let n = 0;
    for (let i = 0; i < a.length; i += 1) {
      n += (a[i] ?? 0) ** 2;
    }
    expect(n).toBeCloseTo(1, 5);
    expect(cosseno(a, b)).toBeGreaterThan(cosseno(a, c));
  });

  it("texto sem tokens → vetor zero", () => {
    const z = embedTexto("   \n\t  ");
    expect([...z].every((x) => x === 0)).toBe(true);
  });

  it("roundtrip blob", () => {
    const v = embedTexto("hello world auth");
    const back = blobParaEmbedding(embeddingParaBlob(v));
    expect(back.length).toBe(v.length);
    expect(cosseno(v, back)).toBeCloseTo(1, 5);
  });
});
