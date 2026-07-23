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
} from "../src/quality.js";

let raiz = "";

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), "codingpro-qualidade-"));
});

afterEach(async () => {
  await rm(raiz, { force: true, recursive: true });
});

const ioMudo = { progresso: () => {} };

function ioGravador(): { progresso: (t: string) => void; texto: () => string } {
  const partes: string[] = [];
  return { progresso: (t) => partes.push(t), texto: () => partes.join("") };
}

describe("contarProblemas", () => {
  it("saída vazia ou só espaço não tem problema", () => {
    expect(contarProblemas("")).toBe(0);
    expect(contarProblemas("   \n  ")).toBe(0);
  });

  it("conta uma por linha não vazia", () => {
    expect(contarProblemas("erro 1\nerro 2\n\nerro 3")).toBe(3);
  });
});

describe("normalizarArquivos", () => {
  it("remove duplicados preservando a ordem", () => {
    expect(normalizarArquivos(["a.ts", "b.ts", "a.ts"])).toEqual(["a.ts", "b.ts"]);
  });

  it("normaliza barras do Windows", () => {
    expect(normalizarArquivos(["src\\pasta\\x.ts"])).toEqual(["src/pasta/x.ts"]);
  });

  it("bloqueia caminho absoluto, escape de diretório e byte nulo", () => {
    expect(
      normalizarArquivos(["/etc/passwd", "../fora.ts", "a/../../b.ts", "x\0y.ts", "  ", ""]),
    ).toEqual([]);
  });

  it("deixa passar caminho relativo normal com ponto", () => {
    expect(normalizarArquivos(["./src/a.ts", "src/.oculto.ts"])).toEqual([
      "./src/a.ts",
      "src/.oculto.ts",
    ]);
  });
});

describe("projetoUsaBiome", () => {
  it("false quando não há config", async () => {
    expect(await projetoUsaBiome(raiz)).toBe(false);
  });

  it("aceita biome.json e biome.jsonc", async () => {
    await writeFile(join(raiz, "biome.jsonc"), "{}");
    expect(await projetoUsaBiome(raiz)).toBe(true);
  });
});

describe("lerOpcoesQualidadeEnv", () => {
  it("por padrão auto-corrige e permite 1 turno de reparo", () => {
    expect(lerOpcoesQualidadeEnv({})).toEqual({ autoFix: true, maxRepairTurns: 1 });
  });

  it("desliga o auto-fix com as formas usuais de 'não'", () => {
    for (const valor of ["0", "false", "off", "no", "FALSE", " Off "]) {
      expect(lerOpcoesQualidadeEnv({ CODINGPRO_QUALITY_AUTOFIX: valor }).autoFix).toBe(false);
    }
  });

  it("limita os turnos de reparo a 2 — reparo infinito queima tokens", () => {
    expect(lerOpcoesQualidadeEnv({ CODINGPRO_QUALITY_MAX_REPAIR: "99" }).maxRepairTurns).toBe(2);
    expect(lerOpcoesQualidadeEnv({ CODINGPRO_QUALITY_MAX_REPAIR: "0" }).maxRepairTurns).toBe(0);
    expect(lerOpcoesQualidadeEnv({ CODINGPRO_QUALITY_MAX_REPAIR: "abc" }).maxRepairTurns).toBe(1);
    expect(lerOpcoesQualidadeEnv({ CODINGPRO_QUALITY_MAX_REPAIR: "-3" }).maxRepairTurns).toBe(1);
  });
});

describe("corrigirQualidade", () => {
  it("ignora quando não há arquivos", async () => {
    const r = await corrigirQualidade(raiz, [], ioMudo, { runner: async () => "" });
    expect(r).toMatchObject({ ignorado: true, limpo: true, problemas: 0 });
  });

  it("ignora quando o projeto não usa biome — não é papel nosso impor linter", async () => {
    let chamou = false;
    await corrigirQualidade(raiz, ["a.ts"], ioMudo, {
      runner: async () => {
        chamou = true;
        return "";
      },
    });
    expect(chamou).toBe(false);
  });

  it("auto-corrige e reporta limpo", async () => {
    await writeFile(join(raiz, "biome.json"), "{}");
    const chamadas: string[][] = [];
    const runner: RunnerBiome = async (_r, args) => {
      chamadas.push([...args]);
      return "";
    };

    const io = ioGravador();
    const r = await corrigirQualidade(raiz, ["src/a.ts"], io, { runner });

    expect(chamadas[0]).toContain("--write");
    expect(chamadas[1]).not.toContain("--write");
    expect(r).toMatchObject({ autoCorrigiu: true, ignorado: false, limpo: true, problemas: 0 });
    expect(io.texto()).toContain("limpo");
  });

  it("com autoFix desligado, não passa --write", async () => {
    await writeFile(join(raiz, "biome.json"), "{}");
    const chamadas: string[][] = [];
    await corrigirQualidade(raiz, ["src/a.ts"], ioMudo, {
      autoFix: false,
      runner: async (_r, args) => {
        chamadas.push([...args]);
        return "";
      },
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).not.toContain("--write");
  });

  it("reporta o diagnóstico quando o linter ainda reclama", async () => {
    await writeFile(join(raiz, "biome.json"), "{}");
    const runner: RunnerBiome = async (_r, args) =>
      args.includes("--write") ? "" : "src/a.ts:1 erro X\nsrc/a.ts:2 erro Y";

    const io = ioGravador();
    const r = await corrigirQualidade(raiz, ["src/a.ts"], io, { runner });

    expect(r.limpo).toBe(false);
    expect(r.problemas).toBe(2);
    expect(r.diagnostico).toContain("erro X");
    expect(io.texto()).toContain("2 problema(s)");
  });

  it("biome ausente (ENOENT) é ignorado em vez de quebrar o turno", async () => {
    await writeFile(join(raiz, "biome.json"), "{}");
    const r = await corrigirQualidade(raiz, ["src/a.ts"], ioMudo, {
      runner: async () => {
        const erro = new Error("not found") as NodeJS.ErrnoException;
        erro.code = "ENOENT";
        throw erro;
      },
    });
    expect(r).toMatchObject({ ignorado: true, limpo: true });
  });

  it("saída de erro do biome (exit != 0) vira diagnóstico, não exceção", async () => {
    await writeFile(join(raiz, "biome.json"), "{}");
    const r = await corrigirQualidade(raiz, ["src/a.ts"], ioMudo, {
      autoFix: false,
      runner: async () => {
        const erro = new Error("lint falhou") as Error & { stdout?: string };
        erro.stdout = "src/a.ts:1 problema";
        throw erro;
      },
    });
    expect(r.limpo).toBe(false);
    expect(r.diagnostico).toContain("problema");
  });

  it("verificarQualidade é o atalho sem auto-fix", async () => {
    await writeFile(join(raiz, "biome.json"), "{}");
    const chamadas: string[][] = [];
    await verificarQualidade(raiz, ["a.ts"], ioMudo, async (_r, args) => {
      chamadas.push([...args]);
      return "";
    });
    expect(chamadas.every((c) => !c.includes("--write"))).toBe(true);
  });
});

describe("promptReparoQualidade", () => {
  it("cita os arquivos e o diagnóstico, e limita o escopo do conserto", () => {
    const prompt = promptReparoQualidade("src/a.ts:1 erro", ["src/a.ts"]);
    expect(prompt).toContain("src/a.ts");
    expect(prompt).toContain("erro");
    expect(prompt).toContain("apenas");
  });

  it("sem arquivos, ainda produz um prompt utilizável", () => {
    expect(promptReparoQualidade("", [])).toContain("(arquivos do turno)");
  });
});
