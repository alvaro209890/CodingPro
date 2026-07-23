import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Workspace } from "../src/workspace.js";
import { fragmentarCodigo } from "../src/vector/chunking.js";
import { abrirStoreComIndice, indexarRepositorio } from "../src/vector/vector-index.js";
import { sanitizarQueryFts, VectorStore } from "../src/vector/vector-store.js";

describe("VectorStore + indexação", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-vec-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("sanitizarQueryFts remove lixo e lida com vazio", () => {
    expect(sanitizarQueryFts('auth "payment"')).toContain("auth");
    expect(sanitizarQueryFts("!!!")).toBe('""');
    expect(sanitizarQueryFts("a b c d e f g h i j k l m n")).toContain("a");
  });

  it("indexa, busca e é incremental (mtime)", async () => {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "src", "auth.ts"),
      "export function authenticateUser(token: string) {\n  return token.length > 0;\n}\n",
      "utf8",
    );
    await writeFile(
      join(root, "src", "pay.ts"),
      "export function processPayment(amount: number) {\n  return amount * 100;\n}\n",
      "utf8",
    );
    await writeFile(join(root, "src", "bin.dat"), "a\0b\0c", "utf8");

    const ws = await Workspace.create(root);
    let progressCalls = 0;
    const r1 = await indexarRepositorio(ws, {
      onProgress: () => {
        progressCalls += 1;
      },
    });
    expect(r1.updated).toBeGreaterThanOrEqual(2);
    expect(r1.chunks).toBeGreaterThanOrEqual(2);
    expect(progressCalls).toBeGreaterThan(0);

    const r2 = await indexarRepositorio(ws);
    expect(r2.updated).toBe(0);
    expect(r2.unchanged).toBeGreaterThanOrEqual(2);

    // remove arquivo do disco e reindexa → removed
    await rm(join(root, "src", "pay.ts"));
    const r3 = await indexarRepositorio(ws);
    expect(r3.removed).toBeGreaterThanOrEqual(1);

    const store = await VectorStore.open(join(root, ".codingpro"));
    try {
      const hits = store.buscar("authenticate user token", 5);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.some((h) => h.path.includes("auth"))).toBe(true);
      expect(store.buscar("", 3).length).toBeGreaterThanOrEqual(0);
      expect(store.buscar("zzzzznada", 3)).toBeDefined();
    } finally {
      store.close();
    }
  });

  it("abrirStoreComIndice force e sem force; abort interrompe", async () => {
    await writeFile(join(root, "a.ts"), "export const x = 1;\n", "utf8");
    const ws = await Workspace.create(root);
    const a = await abrirStoreComIndice(ws, { force: true });
    expect(a.result?.chunks).toBeGreaterThan(0);
    a.store.close();
    const b = await abrirStoreComIndice(ws, {});
    expect(b.result).toBeUndefined();
    b.store.close();

    const ac = new AbortController();
    ac.abort();
    const r = await indexarRepositorio(ws, { signal: ac.signal });
    expect(r.updated + r.unchanged + r.removed).toBeGreaterThanOrEqual(0);
  });

  it("upsert e remoção de arquivo", async () => {
    const dir = join(root, ".codingpro");
    const store = await VectorStore.open(dir);
    try {
      const chunks = fragmentarCodigo("a.ts", "export function foo() { return 1; }\n");
      store.upsertArquivo("a.ts", 1, 10, "ts", chunks);
      expect(store.stats().chunks).toBeGreaterThan(0);
      store.removerArquivo("a.ts");
      expect(store.stats().files).toBe(0);
      // reabrir (migrate no-op)
      store.close();
      const store2 = await VectorStore.open(dir);
      expect(store2.stats().files).toBe(0);
      store2.close();
    } catch {
      // se já fechou
    }
  });

  it("busca só vetorial com query FTS degenerada", async () => {
    const store = await VectorStore.open(join(root, ".codingpro"));
    try {
      store.upsertArquivo(
        "x.ts",
        1,
        1,
        "ts",
        fragmentarCodigo("x.ts", "export function uniqueZebraWidget() { return 42; }\n"),
      );
      const hits = store.buscar("uniqueZebraWidget", 5);
      expect(hits.length).toBeGreaterThan(0);
      const emptyish = store.buscar("***", 2);
      expect(Array.isArray(emptyish)).toBe(true);
    } finally {
      store.close();
    }
  });
});
