import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CheckpointStore } from "../src/checkpoints.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("CheckpointStore", () => {
  let root: string;
  let workspace: Workspace;
  let dir: string;

  beforeEach(async () => {
    root = await makeTmpRoot();
    workspace = await Workspace.create(root);
    dir = join(root, ".codingpro", "checkpoints");
  });

  afterEach(async () => {
    await cleanup(root);
  });

  async function novoStore(maxFileBytes?: number): Promise<CheckpointStore> {
    return CheckpointStore.create(
      dir,
      workspace,
      maxFileBytes === undefined ? undefined : { maxFileBytes },
    );
  }

  it("começa vazio", async () => {
    const store = await novoStore();
    expect(store.list()).toEqual([]);
    expect(store.temRefazer()).toBe(false);
  });

  it("desfaz uma edição de arquivo existente restaurando o conteúdo anterior", async () => {
    await writeFile(join(root, "a.txt"), "antigo");
    const store = await novoStore();
    store.begin("editar a");
    await store.capture("a.txt");
    await writeFile(join(root, "a.txt"), "novo");
    const meta = await store.commit();
    expect(meta?.files).toEqual([{ content: "antigo", path: "a.txt", status: "present" }]);

    const r = await store.undo();
    expect(r.passos).toBe(1);
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("antigo");
  });

  it("desfaz a criação de um arquivo apagando-o (estado anterior ausente)", async () => {
    const store = await novoStore();
    store.begin("criar b");
    await store.capture("b.txt");
    await writeFile(join(root, "b.txt"), "conteúdo");
    await store.commit();
    expect(existsSync(join(root, "b.txt"))).toBe(true);

    await store.undo();
    expect(existsSync(join(root, "b.txt"))).toBe(false);
  });

  it("agrupa múltiplos arquivos de um passo num único checkpoint", async () => {
    await writeFile(join(root, "x.txt"), "x0");
    await writeFile(join(root, "y.txt"), "y0");
    const store = await novoStore();
    store.begin("refatorar");
    await store.capture("x.txt");
    await store.capture("y.txt");
    await writeFile(join(root, "x.txt"), "x1");
    await writeFile(join(root, "y.txt"), "y1");
    const meta = await store.commit();
    expect(meta?.files).toHaveLength(2);

    await store.undo();
    expect(await readFile(join(root, "x.txt"), "utf8")).toBe("x0");
    expect(await readFile(join(root, "y.txt"), "utf8")).toBe("y0");
  });

  it("a primeira captura do passo vence (pré-escrita), mesmo capturando duas vezes", async () => {
    await writeFile(join(root, "a.txt"), "estado-inicial");
    const store = await novoStore();
    store.begin("passo");
    await store.capture("a.txt");
    await writeFile(join(root, "a.txt"), "intermediário");
    await store.capture("a.txt"); // ignorada — já capturado
    await writeFile(join(root, "a.txt"), "final");
    await store.commit();

    await store.undo();
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("estado-inicial");
  });

  it("commit sem capturas não cria checkpoint", async () => {
    const store = await novoStore();
    store.begin("vazio");
    const meta = await store.commit();
    expect(meta).toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  it("captura sem begin explícito abre um passo com rótulo vazio", async () => {
    await writeFile(join(root, "a.txt"), "v0");
    const store = await novoStore();
    await store.capture("a.txt");
    await writeFile(join(root, "a.txt"), "v1");
    const meta = await store.commit();
    expect(meta?.label).toBe("");
    await store.undo();
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("v0");
  });

  it("refaz o que foi desfeito e zera o refazer após nova escrita", async () => {
    await writeFile(join(root, "a.txt"), "v0");
    const store = await novoStore();
    store.begin("t1");
    await store.capture("a.txt");
    await writeFile(join(root, "a.txt"), "v1");
    await store.commit();

    await store.undo();
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("v0");
    expect(store.temRefazer()).toBe(true);

    const r = await store.redo();
    expect(r.passos).toBe(1);
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("v1");

    // Nova escrita invalida o refazer.
    await store.undo();
    store.begin("t2");
    await store.capture("a.txt");
    await writeFile(join(root, "a.txt"), "v2");
    await store.commit();
    expect(store.temRefazer()).toBe(false);
  });

  it("undo N desfaz vários passos e para quando acaba", async () => {
    await writeFile(join(root, "a.txt"), "0");
    const store = await novoStore();
    for (const v of ["1", "2", "3"]) {
      store.begin(`t${v}`);
      await store.capture("a.txt");
      await writeFile(join(root, "a.txt"), v);
      await store.commit();
    }
    const r = await store.undo(10);
    expect(r.passos).toBe(3);
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("0");
    // Nada mais a desfazer.
    expect((await store.undo()).passos).toBe(0);
  });

  it("lista do mais recente para o mais antigo", async () => {
    await writeFile(join(root, "a.txt"), "0");
    const store = await novoStore();
    for (const v of ["1", "2"]) {
      store.begin(`t${v}`);
      await store.capture("a.txt");
      await writeFile(join(root, "a.txt"), v);
      await store.commit();
    }
    const labels = store.list().map((c) => c.label);
    expect(labels).toEqual(["t2", "t1"]);
  });

  it("persiste entre instâncias: um novo store enxerga e desfaz o checkpoint", async () => {
    await writeFile(join(root, "a.txt"), "antigo");
    const a = await novoStore();
    a.begin("editar");
    await a.capture("a.txt");
    await writeFile(join(root, "a.txt"), "novo");
    await a.commit();

    const b = await novoStore();
    expect(b.list()).toHaveLength(1);
    await b.undo();
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("antigo");

    // Após o undo o checkpoint some do disco: um terceiro store não o vê.
    const c = await novoStore();
    expect(c.list()).toEqual([]);
  });

  it("omite arquivos grandes demais e não os corrompe no undo", async () => {
    await writeFile(join(root, "grande.txt"), "conteúdo maior que o teto");
    const store = await novoStore(4);
    store.begin("grande");
    await store.capture("grande.txt");
    const meta = await store.commit();
    expect(meta?.files[0]?.status).toBe("omitido");
    await writeFile(join(root, "grande.txt"), "modificado");
    await store.undo();
    // "omitido" não é restaurado — o arquivo permanece como está.
    expect(await readFile(join(root, "grande.txt"), "utf8")).toBe("modificado");
  });

  it("🏁 marco: desfaz uma refatoração multi-arquivo num passo, em < 2 s", async () => {
    const N = 12;
    for (let k = 0; k < N; k += 1) {
      await writeFile(join(root, `f${k}.txt`), `v0-${k}`);
    }
    const store = await novoStore();
    store.begin("refatoração ampla");
    for (let k = 0; k < N; k += 1) {
      await store.capture(`f${k}.txt`);
    }
    for (let k = 0; k < N; k += 1) {
      await writeFile(join(root, `f${k}.txt`), `v1-${k}`);
    }
    const meta = await store.commit();
    expect(meta?.files).toHaveLength(N);

    const inicio = Date.now();
    const r = await store.undo();
    const decorrido = Date.now() - inicio;

    expect(r.passos).toBe(1);
    for (let k = 0; k < N; k += 1) {
      expect(await readFile(join(root, `f${k}.txt`), "utf8")).toBe(`v0-${k}`);
    }
    expect(decorrido).toBeLessThan(2000);
  });

  it("ignora diretórios de checkpoint corrompidos ao carregar", async () => {
    await mkdir(join(dir, "000001"), { recursive: true });
    await writeFile(join(dir, "000001", "meta.json"), "{ não é json válido");
    await mkdir(join(dir, "lixo"), { recursive: true });
    const store = await novoStore();
    expect(store.list()).toEqual([]);
  });
});
