import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  contarProblemas,
  corrigirQualidade,
  lerOpcoesQualidadeEnv,
  normalizarArquivos,
  projetoUsaBiome,
  promptReparoQualidade,
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

  it("contarProblemas e normalizarArquivos", () => {
    expect(contarProblemas("")).toBe(0);
    expect(contarProblemas("  \n  ")).toBe(0);
    expect(contarProblemas("erro 1\nerro 2\n")).toBe(2);
    expect(normalizarArquivos(["a.ts", "a.ts", " ../x", "/abs", "", "src/b.ts"])).toEqual([
      "a.ts",
      "src/b.ts",
    ]);
  });

  it("não roda nada sem arquivos ou sem biome", async () => {
    const chamadas: number[] = [];
    const runner: RunnerBiome = async () => {
      chamadas.push(1);
      return "";
    };
    const io = { progresso: () => {} };
    const r1 = await corrigirQualidade(root, [], io, { runner });
    const r2 = await corrigirQualidade(root, ["a.ts"], io, { runner });
    expect(r1.ignorado).toBe(true);
    expect(r2.ignorado).toBe(true);
    expect(chamadas).toHaveLength(0);
  });

  it("corrigirQualidade com autoFix: write depois check limpo", async () => {
    await writeFile(join(root, "biome.json"), "{}", "utf8");
    const argsVistos: string[][] = [];
    const runner: RunnerBiome = async (_r, args) => {
      argsVistos.push([...args]);
      return "";
    };
    let saida = "";
    const r = await corrigirQualidade(
      root,
      ["a.ts"],
      { progresso: (t) => (saida += t) },
      { autoFix: true, runner },
    );
    expect(r.limpo).toBe(true);
    expect(r.autoCorrigiu).toBe(true);
    expect(argsVistos[0]?.slice(0, 2)).toEqual(["check", "--write"]);
    expect(argsVistos[1]?.[0]).toBe("check");
    expect(argsVistos[1]?.includes("--write")).toBe(false);
    expect(saida).toContain("formatando");
    expect(saida).toContain("auto-corrigido");
  });

  it("corrigirQualidade residual devolve diagnostico e limpo=false", async () => {
    await writeFile(join(root, "biome.jsonc"), "{}", "utf8");
    const runner: RunnerBiome = async (_r, args) => {
      if (args.includes("--write")) {
        return "";
      }
      const erro = new Error("lint") as Error & { stdout: string };
      erro.stdout = "a.ts:1:1 lint/suspicious/noExplicitAny\n";
      throw erro;
    };
    let saida = "";
    const r = await corrigirQualidade(
      root,
      ["a.ts"],
      { progresso: (t) => (saida += t) },
      { autoFix: true, runner },
    );
    expect(r.limpo).toBe(false);
    expect(r.autoCorrigiu).toBe(true);
    expect(r.problemas).toBeGreaterThan(0);
    expect(r.diagnostico).toContain("noExplicitAny");
    expect(saida).toContain("✗");
  });

  it("verificarQualidade (sem write) reporta limpo", async () => {
    await writeFile(join(root, "biome.json"), "{}", "utf8");
    let saida = "";
    const runner: RunnerBiome = async () => "";
    await verificarQualidade(root, ["a.ts"], { progresso: (t) => (saida += t) }, runner);
    expect(saida).toContain("verificando");
    expect(saida).toContain("✓ limpo");
    expect(saida).not.toContain("formatando");
  });

  it("ENOENT (biome indisponível) é non-blocking", async () => {
    await writeFile(join(root, "biome.json"), "{}", "utf8");
    let saida = "";
    const runner: RunnerBiome = async () => {
      const erro = new Error("not found") as Error & { code: string };
      erro.code = "ENOENT";
      throw erro;
    };
    const r = await corrigirQualidade(
      root,
      ["a.ts"],
      { progresso: (t) => (saida += t) },
      { autoFix: true, runner },
    );
    expect(r.ignorado).toBe(true);
    expect(saida).toContain("biome indisponível");
  });

  it("promptReparoQualidade e lerOpcoesQualidadeEnv", () => {
    const p = promptReparoQualidade("err line", ["a.ts", "b.ts"]);
    expect(p).toContain("Biome");
    expect(p).toContain("a.ts");
    expect(p).toContain("err line");

    expect(lerOpcoesQualidadeEnv({}).autoFix).toBe(true);
    expect(lerOpcoesQualidadeEnv({}).maxRepairTurns).toBe(1);
    expect(lerOpcoesQualidadeEnv({ CODINGPRO_QUALITY_AUTOFIX: "false" }).autoFix).toBe(false);
    expect(lerOpcoesQualidadeEnv({ CODINGPRO_QUALITY_MAX_REPAIR: "2" }).maxRepairTurns).toBe(2);
    expect(lerOpcoesQualidadeEnv({ CODINGPRO_QUALITY_MAX_REPAIR: "99" }).maxRepairTurns).toBe(2);
    expect(lerOpcoesQualidadeEnv({ CODINGPRO_QUALITY_MAX_REPAIR: "0" }).maxRepairTurns).toBe(0);
  });
});
