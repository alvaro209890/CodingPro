import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepoMapCache } from "../src/repo-map-cache.js";
import type { Simbolo } from "../src/symbols.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

const SIMBOLO: Simbolo = {
  assinatura: "export function f() {}",
  linha: 1,
  nome: "f",
  tipo: "função",
};

describe("RepoMapCache", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTmpRoot();
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("devolve símbolos quando mtime e size batem, e invalida quando não", () => {
    const cache = RepoMapCache.emMemoria();
    cache.definir("a.ts", 100, 20, [SIMBOLO]);
    expect(cache.obter("a.ts", 100, 20)).toEqual([SIMBOLO]);
    expect(cache.obter("a.ts", 101, 20)).toBeUndefined();
    expect(cache.obter("a.ts", 100, 21)).toBeUndefined();
    expect(cache.obter("b.ts", 100, 20)).toBeUndefined();
  });

  it("persiste e recarrega do disco", async () => {
    const caminho = join(root, "cache.json");
    const cache = await RepoMapCache.carregar(caminho);
    cache.definir("a.ts", 100, 20, [SIMBOLO]);
    await cache.salvar();

    const recarregado = await RepoMapCache.carregar(caminho);
    expect(recarregado.obter("a.ts", 100, 20)).toEqual([SIMBOLO]);
  });

  it("cache em memória nunca escreve arquivo", async () => {
    const cache = RepoMapCache.emMemoria();
    cache.definir("a.ts", 1, 1, [SIMBOLO]);
    await cache.salvar(); // não deve lançar nem criar nada
    expect(cache.obter("a.ts", 1, 1)).toEqual([SIMBOLO]);
  });

  it("arquivo corrompido vira cache frio", async () => {
    const caminho = join(root, "cache.json");
    await writeFile(caminho, "{ isto não é json", "utf8");
    const cache = await RepoMapCache.carregar(caminho);
    expect(cache.obter("a.ts", 100, 20)).toBeUndefined();
  });

  it("não regrava quando não houve mudança", async () => {
    const caminho = join(root, "cache.json");
    const cache = await RepoMapCache.carregar(caminho);
    await cache.salvar();
    await expect(readFile(caminho, "utf8")).rejects.toThrow();
  });
});
