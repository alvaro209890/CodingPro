import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoreError } from "../src/errors.js";
import { MemoryStore } from "../src/memory-store.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("MemoryStore", () => {
  let root: string;
  let dir: string;
  let store: MemoryStore;

  beforeEach(async () => {
    root = await makeTmpRoot();
    dir = join(root, "memory");
    store = MemoryStore.create(dir);
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("não cria o diretório até a primeira escrita", async () => {
    expect(await store.list()).toEqual([]);
    expect(await store.indice()).toBe("");
    await expect(readFile(join(dir, "MEMORY.md"), "utf8")).rejects.toThrow();
  });

  it("grava um fato, gera o índice e o lê de volta", async () => {
    const m = await store.remember("O usuário prefere respostas curtas", "user");
    expect(m.strength).toBe(1);
    expect(await store.list()).toHaveLength(1);
    expect(await store.indice()).toContain(m.name);
    expect((await store.get(m.name))?.body).toBe("O usuário prefere respostas curtas");
  });

  it("reforça em vez de duplicar quando o slug bate", async () => {
    const a = await store.remember("Deploy no Render é manual", "project", "deploy-render");
    const b = await store.remember(
      "Deploy no Render é manual (autoDeploy off)",
      "project",
      "deploy-render",
    );
    expect(b.strength).toBe(2);
    expect(b.created).toBe(a.created);
    expect(await store.list()).toHaveLength(1);
  });

  it("recusa valores de segredo", async () => {
    await expect(store.remember("token: abcd1234efgh5678", "reference")).rejects.toBeInstanceOf(
      CoreError,
    );
    await expect(store.remember("", "user")).rejects.toBeInstanceOf(CoreError);
  });

  it("forget arquiva em _archive e regenera o índice", async () => {
    await store.remember("fato descartável", "project", "descartavel");
    expect(await store.forget("descartavel")).toBe(true);
    expect(await store.list()).toEqual([]);
    expect(await readFile(join(dir, "_archive", "descartavel.md"), "utf8")).toContain(
      "descartável",
    );
    expect(await store.forget("inexistente")).toBe(false);
  });

  it("list ignora MEMORY.md, _archive e arquivos inválidos", async () => {
    await store.remember("válido", "project", "valido");
    await writeFile(join(dir, "solto.md"), "sem frontmatter", "utf8");
    await writeFile(join(dir, "_nota.md"), "---\ntype: user\n---\nx", "utf8");
    const lista = await store.list();
    expect(lista.map((m) => m.name)).toEqual(["valido"]);
  });

  it("buscar devolve as memórias relevantes", async () => {
    await store.remember("Pagamentos usam Pagar.me em modo live", "project", "pagamentos");
    await store.remember("O mini-mapa usa OSRM via proxy", "project", "mini-mapa");
    const r = await store.buscar("como funciona o pagamento?");
    expect(r[0]?.name).toBe("pagamentos");
  });
});
