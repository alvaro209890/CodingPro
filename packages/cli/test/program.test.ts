import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { criarPrograma, executarCli, executarPrograma, type CliIo } from "../src/program.js";

function capturarSaida(): { io: CliIo; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];

  return {
    io: {
      stderr: (texto) => stderr.push(texto),
      stdout: (texto) => stdout.push(texto),
    },
    stderr,
    stdout,
  };
}

describe("CLI", () => {
  it.each([
    { argumentos: ["--ajuda"] },
    { argumentos: ["--help"] },
    { argumentos: ["-h"] },
    { argumentos: [] },
  ])("exibe ajuda em pt-BR com $argumentos", async ({ argumentos }) => {
    const captura = capturarSaida();

    await expect(executarCli(argumentos, captura.io)).resolves.toBe(0);
    expect(captura.stderr).toEqual([]);
    expect(captura.stdout.join("")).toContain("Uso: codingpro");
    expect(captura.stdout.join("")).toContain("[opções]");
    expect(captura.stdout.join("")).toContain("Opções:");
    expect(captura.stdout.join("")).not.toContain("[options]");
    expect(captura.stdout.join("")).not.toContain("Options:");
  });

  it.each([["--versao"], ["--version"], ["-v"]])(
    "exibe a versão do pacote com %s",
    async (opcao) => {
      const captura = capturarSaida();
      const manifesto = JSON.parse(
        await readFile(new URL("../package.json", import.meta.url), "utf8"),
      ) as { version: string };

      await expect(executarCli([opcao], captura.io)).resolves.toBe(0);
      expect(captura.stderr).toEqual([]);
      expect(captura.stdout.join("").trim()).toBe(manifesto.version);
    },
  );

  it("mapeia os dois nomes do binário para o mesmo artefato", async () => {
    const manifesto = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { bin: { codingpro: string; cpro: string } };

    expect(manifesto.bin.codingpro).toBe("./dist/index.mjs");
    expect(manifesto.bin.cpro).toBe(manifesto.bin.codingpro);
  });

  it("rejeita opção desconhecida com erro em pt-BR", async () => {
    const captura = capturarSaida();

    await expect(executarCli(["--inexistente"], captura.io)).resolves.toBe(1);
    expect(captura.stdout).toEqual([]);
    expect(captura.stderr.join("")).toContain("erro: opção desconhecida '--inexistente'");
    expect(captura.stderr.join("")).not.toContain("unknown option");
  });

  it("cria o programa sem encerrar nem escrever no processo", () => {
    const captura = capturarSaida();

    const programa = criarPrograma(captura.io);

    expect(programa.name()).toBe("codingpro");
    expect(captura.stdout).toEqual([]);
    expect(captura.stderr).toEqual([]);
  });

  it("propaga erros inesperados da aplicação", async () => {
    const captura = capturarSaida();
    const falha = new Error("falha inesperada");
    const programa = criarPrograma(captura.io).action(() => {
      throw falha;
    });

    await expect(executarPrograma(programa, [])).rejects.toBe(falha);
  });
});
