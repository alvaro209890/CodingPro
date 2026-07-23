import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { construirRepoMap } from "../src/repo-map.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("construirRepoMap", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await makeTmpRoot();
    workspace = await Workspace.create(root);
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("indexa arquivos de código e lista assinaturas", async () => {
    await writeFile(join(root, "a.ts"), "export function alfa() {}\nexport class Beta {}");
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "b.py"), "def gama():\n    pass");
    const mapa = await construirRepoMap(workspace);
    expect(mapa.totalArquivos).toBe(2);
    expect(mapa.texto).toContain("a.ts");
    expect(mapa.texto).toContain("fn alfa");
    expect(mapa.texto).toContain("classe Beta");
    expect(mapa.texto).toContain(join("src", "b.py"));
  });

  it("ranqueia mais alto o arquivo cujos símbolos são mais referenciados", async () => {
    await writeFile(
      join(root, "core.ts"),
      "export function usada() {}\nexport function tambem() {}",
    );
    await writeFile(join(root, "u1.ts"), "import { usada } from './core';\nusada(); tambem();");
    await writeFile(join(root, "u2.ts"), "import { usada } from './core';\nusada();");
    await writeFile(join(root, "solto.ts"), "export function ninguemChama() {}");
    const mapa = await construirRepoMap(workspace);
    expect(mapa.arquivos[0]?.caminho).toBe("core.ts");
    const scoreCore = mapa.arquivos.find((a) => a.caminho === "core.ts")?.score ?? 0;
    const scoreSolto = mapa.arquivos.find((a) => a.caminho === "solto.ts")?.score ?? 0;
    expect(scoreCore).toBeGreaterThan(scoreSolto);
  });

  it("prioriza arquivos em foco", async () => {
    await writeFile(join(root, "popular.ts"), "export function x() {}");
    await writeFile(join(root, "user.ts"), "x(); x(); x();");
    await writeFile(join(root, "obscuro.ts"), "export function y() {}");
    const mapa = await construirRepoMap(workspace, { foco: ["obscuro.ts"] });
    expect(mapa.arquivos[0]?.caminho).toBe("obscuro.ts");
  });

  it("respeita o orçamento de tokens e marca truncado", async () => {
    for (let i = 0; i < 40; i += 1) {
      await writeFile(join(root, `f${i}.ts`), `export function funcaoComNomeLongo${i}() {}`);
    }
    const mapa = await construirRepoMap(workspace, { orcamentoTokens: 20 });
    expect(mapa.truncado).toBe(true);
    expect(mapa.arquivos.length).toBeLessThan(40);
  });

  it("ignora node_modules e .git", async () => {
    await writeFile(join(root, "real.ts"), "export function real() {}");
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(root, "node_modules", "pkg", "index.ts"), "export function fake() {}");
    const mapa = await construirRepoMap(workspace);
    expect(mapa.totalArquivos).toBe(1);
    expect(mapa.texto).not.toContain("fake");
  });

  it("projeto sem código indexável devolve mensagem clara", async () => {
    await writeFile(join(root, "README.md"), "# só docs");
    const mapa = await construirRepoMap(workspace);
    expect(mapa.totalArquivos).toBe(0);
    expect(mapa.texto).toContain("nenhum arquivo");
  });

  it("usa o cache incremental entre construções (mtime+size)", async () => {
    await writeFile(join(root, "a.ts"), "export function alfa() {}");
    const cacheDir = join(root, ".codingpro");
    const primeira = await construirRepoMap(workspace, { cacheDir });
    expect(primeira.totalArquivos).toBe(1);
    // Segunda construção lê o cache do disco; o mapa é idêntico.
    const segunda = await construirRepoMap(workspace, { cacheDir });
    expect(segunda.texto).toBe(primeira.texto);
  });

  it("aborta cedo com signal já abortado", async () => {
    await writeFile(join(root, "a.ts"), "export function alfa() {}");
    const mapa = await construirRepoMap(workspace, { signal: AbortSignal.abort() });
    expect(mapa.totalArquivos).toBe(0);
  });
});
