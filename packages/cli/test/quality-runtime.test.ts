import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  contarProblemas,
  projetoUsaBiome,
  type RunnerBiome,
  verificarQualidade,
} from "../src/quality-runtime.js";

describe("quality-runtime", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-qa-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("projetoUsaBiome detecta biome.json/biome.jsonc", async () => {
    expect(await projetoUsaBiome(root)).toBe(false);
    await writeFile(join(root, "biome.json"), "{}", "utf8");
    expect(await projetoUsaBiome(root)).toBe(true);
  });

  it("contarProblemas conta linhas não vazias", () => {
    expect(contarProblemas("")).toBe(0);
    expect(contarProblemas("  \n  ")).toBe(0);
    expect(contarProblemas("erro 1\nerro 2\n")).toBe(2);
  });

  it("não roda nada sem arquivos ou sem biome", async () => {
    const chamadas: number[] = [];
    const runner: RunnerBiome = async () => {
      chamadas.push(1);
      return "";
    };
    const io = { progresso: () => {} };
    await verificarQualidade(root, [], io, runner); // sem arquivos
    await verificarQualidade(root, ["a.ts"], io, runner); // sem biome.json
    expect(chamadas).toHaveLength(0);
  });

  it("reporta 'limpo' quando o biome não acha problemas", async () => {
    await writeFile(join(root, "biome.json"), "{}", "utf8");
    let saida = "";
    const runner: RunnerBiome = async () => "";
    await verificarQualidade(root, ["a.ts"], { progresso: (t) => (saida += t) }, runner);
    expect(saida).toContain("verificando");
    expect(saida).toContain("✓ limpo");
  });

  it("reporta problemas quando o biome acha", async () => {
    await writeFile(join(root, "biome.jsonc"), "{}", "utf8");
    let saida = "";
    const runner: RunnerBiome = async () => {
      const erro = new Error("falhou") as Error & { stdout: string };
      erro.stdout = "problema A\nproblema B";
      throw erro;
    };
    await verificarQualidade(root, ["a.ts"], { progresso: (t) => (saida += t) }, runner);
    expect(saida).toContain("✗ 2 problema(s)");
    expect(saida).toContain("problema A");
  });

  it("com o runner padrão, roda de verdade sem quebrar (biome ausente no temp)", async () => {
    await writeFile(join(root, "biome.json"), "{}", "utf8");
    let saida = "";
    // Sem injetar runner: exercita o executor real (pnpm exec biome) no diretório temporário.
    await verificarQualidade(root, ["inexistente.ts"], { progresso: (t) => (saida += t) });
    expect(saida).toContain("verificando");
  }, 30_000);

  it("ENOENT (biome indisponível) é non-blocking", async () => {
    await writeFile(join(root, "biome.json"), "{}", "utf8");
    let saida = "";
    const runner: RunnerBiome = async () => {
      const erro = new Error("not found") as Error & { code: string };
      erro.code = "ENOENT";
      throw erro;
    };
    await verificarQualidade(root, ["a.ts"], { progresso: (t) => (saida += t) }, runner);
    expect(saida).toContain("biome indisponível");
  });
});
