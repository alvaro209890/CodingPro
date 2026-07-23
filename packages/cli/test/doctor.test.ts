import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  coletarSondas,
  formatarRelatorioDoctor,
  montarDiagnosticos,
  rodarDoctor,
  type SondasDoctor,
  verificarProvider,
  verificarVersaoNode,
} from "../src/doctor.js";

const SONDAS_OK: SondasDoctor = {
  binResolvivel: true,
  chaveEnvPresente: true,
  gitDisponivel: true,
  podeEscrever: true,
  providerNoSettings: false,
  versaoNode: "v24.18.0",
};

describe("doctor — funções puras", () => {
  it("valida a versão do Node", () => {
    expect(verificarVersaoNode("v24.0.0").ok).toBe(true);
    expect(verificarVersaoNode("v22.9.0").ok).toBe(false);
    expect(verificarVersaoNode("lixo").ok).toBe(false);
  });

  it("provider ok se env OU settings", () => {
    expect(verificarProvider(true, false).ok).toBe(true);
    expect(verificarProvider(false, true).ok).toBe(true);
    expect(verificarProvider(false, false).ok).toBe(false);
  });

  it("exit 0 quando nenhum crítico falha", () => {
    const r = formatarRelatorioDoctor(montarDiagnosticos(SONDAS_OK));
    expect(r.exitCode).toBe(0);
    expect(r.texto).toContain("✓ Node.js >= 24");
    expect(r.texto).toContain("Tudo certo");
  });

  it("exit 1 quando um crítico falha; git ausente é só aviso", () => {
    const r = formatarRelatorioDoctor(
      montarDiagnosticos({ ...SONDAS_OK, chaveEnvPresente: false, gitDisponivel: false }),
    );
    expect(r.exitCode).toBe(1);
    expect(r.texto).toContain("✗ Provider DeepSeek");
    expect(r.texto).toContain("problemas críticos");
  });
});

describe("doctor — coleta e execução (IO)", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "codingpro-doctor-"));
  });

  afterEach(async () => {
    await rm(home, { force: true, recursive: true });
  });

  it("coletarSondas detecta provider no settings e escrita ok", async () => {
    await mkdir(join(home, ".codingpro"), { recursive: true });
    await writeFile(
      join(home, ".codingpro", "settings.json"),
      JSON.stringify({ provider: "deepseek" }),
      "utf8",
    );
    const s = await coletarSondas(home, home, {});
    expect(s.providerNoSettings).toBe(true);
    expect(s.podeEscrever).toBe(true);
    expect(s.chaveEnvPresente).toBe(false);
  });

  it("rodarDoctor imprime o relatório e devolve exit code", async () => {
    let saida = "";
    const codigo = await rodarDoctor({ stdout: (t) => (saida += t) }, home, home, {
      DEEPSEEK_API_KEY: "presente",
    });
    expect(saida).toContain("Diagnóstico do CodingPro");
    expect(typeof codigo).toBe("number");
  });
});
