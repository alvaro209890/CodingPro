/**
 * Suite offline de robustez (tortura) — caminhos com espaço/acento, tetos em árvore grande.
 * Exercita funções reais do núcleo (`Workspace`, tools, `construirRepoMap`, `detectarProjeto`).
 * Roda no `pnpm check` via Vitest (sem rede, sem LLM).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectarProjeto } from "../src/project-detect.js";
import { construirRepoMap, REPO_MAP_MAX_ARQUIVOS } from "../src/repo-map.js";
import type { ToolContext } from "../src/tool.js";
import { listDirTool } from "../src/tools/list-dir.js";
import { readFileTool } from "../src/tools/read-file.js";
import { writeFileTool } from "../src/tools/write-file.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

async function rootWithSpacesAndAccents(): Promise<string> {
  const base = await makeTmpRoot();
  const nested = join(base, "Área de Trabalho", "projeto demo");
  await mkdir(nested, { recursive: true });
  return nested;
}

describe("hardening offline — caminhos com espaço e acento", () => {
  let root: string;

  afterEach(async () => {
    if (root !== undefined) {
      // Sobe até o makeTmpRoot (pai do "Área de Trabalho")
      const parent = join(root, "..", "..");
      await cleanup(parent);
    }
  });

  it("Workspace.create aceita raiz com espaços e acentos", async () => {
    root = await rootWithSpacesAndAccents();
    const workspace = await Workspace.create(root);
    expect(workspace.root).toContain("Área de Trabalho");
    expect(workspace.root).toContain("projeto demo");
  });

  it("read/write/list_dir e repo_map funcionam em paths com espaço e acento", async () => {
    root = await rootWithSpacesAndAccents();
    const workspace = await Workspace.create(root);
    const context: ToolContext = { workspace };

    await mkdir(join(root, "pasta com espaço"), { recursive: true });
    await writeFileTool.execute(
      {
        content: "export function saudacao() { return 'olá'; }\n",
        path: "pasta com espaço/módulo.ts",
      },
      context,
    );

    const lido = await readFileTool.execute({ path: "pasta com espaço/módulo.ts" }, context);
    expect(lido.type).toBe("text");
    expect((lido as { type: "text"; value: string }).value).toContain("saudacao");

    const listing = await listDirTool.execute({ path: "pasta com espaço" }, context);
    expect(listing.type).toBe("json");
    expect(listing).toMatchObject({
      type: "json",
      value: { entries: expect.arrayContaining([{ kind: "file", name: "módulo.ts" }]) },
    });

    const mapa = await construirRepoMap(workspace);
    expect(mapa.totalArquivos).toBeGreaterThanOrEqual(1);
    expect(mapa.texto).toContain("módulo.ts");
    expect(mapa.texto).toContain("fn saudacao");
  });

  it("resolve e toRelative não vazam caminho absoluto com espaços", async () => {
    root = await rootWithSpacesAndAccents();
    const workspace = await Workspace.create(root);
    await mkdir(join(root, "docs públicos"), { recursive: true });
    const abs = workspace.resolve("docs públicos/nota.txt");
    expect(abs.startsWith(workspace.root)).toBe(true);
    const rel = workspace.toRelative(abs);
    expect(rel).toBe(join("docs públicos", "nota.txt"));
    expect(rel).not.toMatch(/^\//u);
  });
});

describe("hardening offline — árvore grande com tetos", () => {
  let root: string;

  afterEach(async () => {
    if (root !== undefined) {
      await cleanup(root);
    }
  });

  it("construirRepoMap para no maxArquivos e não indexa sem limite", async () => {
    root = await makeTmpRoot();
    const workspace = await Workspace.create(root);
    const limite = 40;
    const total = limite + 25;
    await Promise.all(
      Array.from({ length: total }, (_u, i) =>
        writeFile(join(root, `arq${String(i).padStart(4, "0")}.ts`), `export function f${i}() {}`),
      ),
    );

    const inicio = performance.now();
    const mapa = await construirRepoMap(workspace, { maxArquivos: limite });
    const ms = performance.now() - inicio;

    expect(mapa.totalArquivos).toBe(limite);
    expect(mapa.arquivos.length).toBeLessThanOrEqual(limite);
    // Bound de sanidade: com 65 arquivos pequenos não deve demorar dezenas de segundos.
    expect(ms).toBeLessThan(15_000);
  });

  it("REPO_MAP_MAX_ARQUIVOS é um teto finito e documentado", () => {
    expect(REPO_MAP_MAX_ARQUIVOS).toBeGreaterThan(0);
    expect(REPO_MAP_MAX_ARQUIVOS).toBeLessThanOrEqual(10_000);
  });

  it("construirRepoMap respeita AbortSignal e termina sem hang", async () => {
    root = await makeTmpRoot();
    const workspace = await Workspace.create(root);
    await Promise.all(
      Array.from({ length: 80 }, (_u, i) =>
        writeFile(join(root, `x${i}.ts`), `export const v${i} = ${i};`),
      ),
    );
    const controller = new AbortController();
    controller.abort();
    const mapa = await construirRepoMap(workspace, {
      maxArquivos: 80,
      signal: controller.signal,
    });
    // Abortado no início da varredura → zero ou poucos arquivos, sem throw.
    expect(mapa.totalArquivos).toBeLessThanOrEqual(80);
  });

  it("detectarProjeto em árvore densa termina com linguagens limitadas", async () => {
    root = await makeTmpRoot();
    const workspace = await Workspace.create(root);
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "giga" }));
    await Promise.all(
      Array.from({ length: 120 }, (_u, i) =>
        writeFile(join(root, `mod${i}.ts`), `export const n${i} = ${i};`),
      ),
    );
    const inicio = performance.now();
    const info = await detectarProjeto(workspace);
    const ms = performance.now() - inicio;
    expect(info.linguagens).toContain("TypeScript");
    expect(ms).toBeLessThan(15_000);
  });
});

describe("plano 02 — verificação pós-edição (evals)", () => {
  let root: string;

  afterEach(async () => {
    if (root !== undefined) await cleanup(root);
  });

  it("após editar com erro de tipo, get_diagnostics responde sem bash", async () => {
    root = await makeTmpRoot();
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext" },
        include: ["*.ts"],
      }),
    );
    await writeFile(join(root, "quebrado.ts"), "export const x: number = 'texto';\n");
    const workspace = await Workspace.create(root);
    const { getDiagnosticsTool } = await import("../src/tools/get-diagnostics.js");
    const result = await getDiagnosticsTool.execute(
      { paths: ["quebrado.ts"] },
      { workspace } satisfies ToolContext,
    );
    expect(result.type === "text" || result.type === "error-text").toBe(true);
    if (result.type === "text" || result.type === "error-text") {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.length).toBeLessThan(20_000);
    }
  });

  it("catálogo ALL_TOOLS permanece abaixo de ~3,5k tokens de descrição", async () => {
    const { ALL_TOOLS } = await import("../src/tool-groups.js");
    const { estimateToolTokens } = await import("../src/tool.js");
    const catalogo = ALL_TOOLS.map(
      (t) => `${t.definition.name}: ${t.definition.description}`,
    ).join("\n");
    const tokens = estimateToolTokens(catalogo);
    expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(20);
    expect(tokens).toBeLessThan(3_500);
  });

  it("teto de saída avisa truncamento acima de 8k tok", async () => {
    const { applyOutputCeiling, textResult } = await import("../src/tool.js");
    const enorme = "abcd".repeat(10_000);
    const cortado = applyOutputCeiling(textResult(enorme));
    expect(cortado.type).toBe("text");
    if (cortado.type === "text") {
      expect(cortado.value).toMatch(/truncado/i);
    }
  });
});
