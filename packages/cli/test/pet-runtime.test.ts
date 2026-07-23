import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { estadoInicialPet } from "../src/pet.js";
import {
  arquivoPetPadrao,
  carregarEstadoPet,
  petHabilitado,
  salvarEstadoPet,
} from "../src/pet-runtime.js";

let raiz: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), "codingpro-pet-"));
});

afterEach(async () => {
  await rm(raiz, { force: true, recursive: true });
});

describe("arquivoPetPadrao", () => {
  it("aponta para ~/.codingpro/pet.json", () => {
    expect(arquivoPetPadrao("/home/x")).toBe(join("/home/x", ".codingpro", "pet.json"));
  });
});

describe("carregar/salvar estado", () => {
  it("salva e relê o estado (round-trip)", async () => {
    const arquivo = join(raiz, "sub", "pet.json");
    const estado = { ...estadoInicialPet(), nivel: 2, xp: 60 };
    await salvarEstadoPet(arquivo, estado);
    const lido = await carregarEstadoPet(arquivo);
    expect(lido.xp).toBe(60);
    expect(lido.nivel).toBe(2);
  });

  it("arquivo ausente → estado inicial", async () => {
    expect((await carregarEstadoPet(join(raiz, "nao-existe.json"))).xp).toBe(0);
  });

  it("JSON corrompido → estado inicial", async () => {
    const arquivo = join(raiz, "pet.json");
    await writeFile(arquivo, "{ isto não é json", "utf8");
    expect((await carregarEstadoPet(arquivo)).xp).toBe(0);
  });

  it("salvar em caminho impossível não lança", async () => {
    await expect(salvarEstadoPet("/", estadoInicialPet())).resolves.toBeUndefined();
  });
});

describe("petHabilitado", () => {
  const escreverSettings = async (dir: string, conteudo: string): Promise<void> => {
    await mkdir(join(dir, ".codingpro"), { recursive: true });
    await writeFile(join(dir, ".codingpro", "settings.json"), conteudo, "utf8");
  };

  it("padrão é ligado quando não há settings nem env", async () => {
    const home = await mkdtemp(join(tmpdir(), "codingpro-home-"));
    try {
      expect(await petHabilitado(raiz, home, {})).toBe(true);
    } finally {
      await rm(home, { force: true, recursive: true });
    }
  });

  it("env CODINGPRO_PET vence tudo", async () => {
    await escreverSettings(raiz, '{ "pet": true }');
    expect(await petHabilitado(raiz, raiz, { CODINGPRO_PET: "0" })).toBe(false);
    expect(await petHabilitado(raiz, raiz, { CODINGPRO_PET: "on" })).toBe(true);
  });

  it("settings do projeto vence o global", async () => {
    const home = await mkdtemp(join(tmpdir(), "codingpro-home-"));
    try {
      await escreverSettings(home, '{ "pet": true }');
      await escreverSettings(raiz, '{ "pet": false }');
      expect(await petHabilitado(raiz, home, {})).toBe(false);
    } finally {
      await rm(home, { force: true, recursive: true });
    }
  });

  it("cai no global quando o projeto não define pet", async () => {
    const home = await mkdtemp(join(tmpdir(), "codingpro-home-"));
    try {
      await escreverSettings(home, '{ "pet": false }');
      expect(await petHabilitado(raiz, home, {})).toBe(false);
    } finally {
      await rm(home, { force: true, recursive: true });
    }
  });
});
