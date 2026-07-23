import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carregarNomeTema } from "../src/tema-config.js";

let raiz: string;
let home: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), "codingpro-tema-cfg-"));
  home = await mkdtemp(join(tmpdir(), "codingpro-tema-home-"));
});

afterEach(async () => {
  await rm(raiz, { force: true, recursive: true });
  await rm(home, { force: true, recursive: true });
});

const escreverSettings = async (dir: string, conteudo: string): Promise<void> => {
  await mkdir(join(dir, ".codingpro"), { recursive: true });
  await writeFile(join(dir, ".codingpro", "settings.json"), conteudo, "utf8");
};

describe("carregarNomeTema", () => {
  it("padrão é aurora sem env nem settings", async () => {
    expect(await carregarNomeTema(raiz, home, {})).toBe("aurora");
  });

  it("env CODINGPRO_TEMA vence e é normalizado", async () => {
    await escreverSettings(raiz, '{ "theme": "solar" }');
    expect(await carregarNomeTema(raiz, home, { CODINGPRO_TEMA: "NEON" })).toBe("neon");
    // env inválido cai em aurora
    expect(await carregarNomeTema(raiz, home, { CODINGPRO_TEMA: "zzz" })).toBe("aurora");
  });

  it("settings do projeto vence o global", async () => {
    await escreverSettings(home, '{ "theme": "aurora" }');
    await escreverSettings(raiz, '{ "theme": "mono" }');
    expect(await carregarNomeTema(raiz, home, {})).toBe("mono");
  });

  it("cai no global quando o projeto não define theme", async () => {
    await escreverSettings(home, '{ "theme": "solar" }');
    expect(await carregarNomeTema(raiz, home, {})).toBe("solar");
  });

  it("theme inválido no settings normaliza para aurora", async () => {
    await escreverSettings(raiz, '{ "theme": "banana" }');
    expect(await carregarNomeTema(raiz, home, {})).toBe("aurora");
  });

  it("settings ilegível → aurora", async () => {
    await escreverSettings(raiz, "{ quebrado");
    expect(await carregarNomeTema(raiz, home, {})).toBe("aurora");
  });
});
