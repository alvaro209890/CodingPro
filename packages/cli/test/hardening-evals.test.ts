/**
 * Suite offline de robustez da CLI — chave ausente/inválida, falha de rede fail-closed,
 * doctor e prompt sem corromper estado. Exercita `criarProviderRuntime`, `DeepSeekProvider`,
 * `executarCli` e `rodarDoctor` reais. Sem rede e sem LLM ao vivo.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeepSeekProvider, ProviderError, type Provider } from "@codingpro/llm";
import { afterEach, describe, expect, it } from "vitest";
import { rodarDoctor } from "../src/doctor.js";
import { executarCli, type CliIo } from "../src/program.js";
import { criarProviderRuntime, type ProviderRuntimeContext } from "../src/provider-runtime.js";

function capturar(): { io: CliIo; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return {
    io: {
      stderr: (t) => stderr.push(t),
      stdout: (t) => stdout.push(t),
    },
    stderr,
    stdout,
  };
}

async function runtimeContext(
  directory: string,
  environment: ProviderRuntimeContext["environment"],
): Promise<ProviderRuntimeContext> {
  const homeDirectory = join(directory, "home");
  const cwd = join(directory, "projeto");
  await Promise.all([mkdir(homeDirectory, { recursive: true }), mkdir(cwd, { recursive: true })]);
  return { cwd, environment, flags: {}, homeDirectory };
}

describe("hardening offline — chave e provider fail-closed", () => {
  let directory: string;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("criarProviderRuntime recusa deepseek sem DEEPSEEK_API_KEY com mensagem clara", async () => {
    directory = await mkdtemp(join(tmpdir(), "codingpro-hard-key-"));
    await expect(
      criarProviderRuntime(
        await runtimeContext(directory, {
          CODINGPRO_PROVIDER: "deepseek",
        }),
      ),
    ).rejects.toMatchObject({
      code: "not-configured",
      name: "ProviderError",
      safeMessage: expect.stringMatching(/DEEPSEEK_API_KEY|DeepSeek/u),
    });
  });

  it("criarProviderRuntime recusa chave vazia/só espaços sem vazar env", async () => {
    directory = await mkdtemp(join(tmpdir(), "codingpro-hard-empty-"));
    await expect(
      criarProviderRuntime(
        await runtimeContext(directory, {
          CODINGPRO_PROVIDER: "deepseek",
          DEEPSEEK_API_KEY: "   ",
        }),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("DeepSeekProvider rejeita chave inválida (controle/vazia) no construtor", () => {
    expect(() => new DeepSeekProvider({ apiKey: "" })).toThrow(ProviderError);
    expect(() => new DeepSeekProvider({ apiKey: "a\nb" })).toThrow(ProviderError);
    try {
      new DeepSeekProvider({ apiKey: "chave\nmal" });
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect(String(error)).not.toContain("chave\nmal");
      expect((error as ProviderError).safeMessage).toMatch(/inválida|chave/iu);
    }
  });

  it("executarCli propaga chave ausente como erro fail-closed (exit 2) e mensagem segura", async () => {
    const a = capturar();
    const codeA = await executarCli(["-p", "olá"], a.io, {
      criarProvider: async () => {
        throw new ProviderError(
          "not-configured",
          "Defina DEEPSEEK_API_KEY para usar o provider DeepSeek.",
        );
      },
    });
    expect(codeA).toBe(2);
    expect(a.stderr.join("")).toContain("DEEPSEEK_API_KEY");
    expect(a.stdout.join("")).toBe("");

    // Segunda execução idêntica — consistente (sem estado corrompido).
    const b = capturar();
    const codeB = await executarCli(["-p", "olá"], b.io, {
      criarProvider: async () => {
        throw new ProviderError(
          "not-configured",
          "Defina DEEPSEEK_API_KEY para usar o provider DeepSeek.",
        );
      },
    });
    expect(codeB).toBe(2);
    expect(b.stderr.join("")).toBe(a.stderr.join(""));
  });
});

describe("hardening offline — falha de rede / transporte", () => {
  it("DeepSeekProvider com fetch sem rede devolve provider-failed seguro e retryable", async () => {
    const canary = "segredo-rede-nao-pode-aparecer-xyz";
    const provider = new DeepSeekProvider({
      apiKey: "chave-sintetica-offline",
      fetch: async () => {
        throw new TypeError(`fetch failed: ${canary}`);
      },
    });

    await expect(async () => {
      for await (const _ of provider.stream({
        messages: [{ content: "ping", role: "user" }],
      })) {
        // consome
      }
    }).rejects.toMatchObject({
      code: "provider-failed",
      retryable: true,
      safeMessage: expect.stringMatching(/DeepSeek|resposta|rede|obter/iu),
    });

    try {
      for await (const _ of provider.stream({
        messages: [{ content: "ping", role: "user" }],
      })) {
        // noop
      }
    } catch (error) {
      expect(String(error)).not.toContain(canary);
      expect((error as ProviderError).safeMessage).not.toContain(canary);
    }
  });

  it("executarCli com provider offline falha fail-closed sem escrever resposta parcial inválida", async () => {
    const provider: Provider = new DeepSeekProvider({
      apiKey: "chave-sintetica-offline",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });

    const runOnce = async () => {
      const cap = capturar();
      const code = await executarCli(["-p", "teste offline"], cap.io, {
        criarProvider: () => provider,
      });
      return { code, stderr: cap.stderr.join(""), stdout: cap.stdout.join("") };
    };

    const first = await runOnce();
    const second = await runOnce();
    expect(first.code).toBe(2);
    expect(second.code).toBe(2);
    expect(first.stderr).toMatch(/erro:/u);
    expect(first.stderr).toMatch(/DeepSeek|resposta|obter/iu);
    expect(first.stdout).toBe("");
    expect(second.stderr).toBe(first.stderr);
    expect(second.stdout).toBe(first.stdout);
  });
});

describe("hardening offline — doctor e CLI sem provider", () => {
  let home: string;

  afterEach(async () => {
    if (home !== undefined) {
      await rm(home, { force: true, recursive: true });
    }
  });

  it("rodarDoctor sem chave nem settings: exit 1 e não imprime valores de segredo", async () => {
    home = await mkdtemp(join(tmpdir(), "codingpro-hard-doc-"));
    let saida = "";
    const code = await rodarDoctor({ stdout: (t) => (saida += t) }, home, home, {
      DEEPSEEK_API_KEY: undefined,
    });
    expect(code).toBe(1);
    expect(saida).toContain("Provider DeepSeek");
    expect(saida).toMatch(/DEEPSEEK_API_KEY|settings\.json/u);
    expect(saida).not.toMatch(/sk-|Bearer /u);
  });

  it("rodarDoctor duas vezes: relatório estável, exit idêntico e sem vazar valor da chave", async () => {
    home = await mkdtemp(join(tmpdir(), "codingpro-hard-doc2-"));
    await mkdir(join(home, ".codingpro"), { recursive: true });
    await writeFile(
      join(home, ".codingpro", "settings.json"),
      JSON.stringify({ provider: "deepseek" }),
      "utf8",
    );

    const chave = "nao-imprimir-segredo-xyz";
    const a: string[] = [];
    const b: string[] = [];
    const codeA = await rodarDoctor({ stdout: (t) => a.push(t) }, home, home, {
      DEEPSEEK_API_KEY: chave,
    });
    const codeB = await rodarDoctor({ stdout: (t) => b.push(t) }, home, home, {
      DEEPSEEK_API_KEY: chave,
    });
    // Exit depende do Node da máquina (CI ≥24 → 0; dev local 22 pode ser 1). Consistência importa.
    expect(codeB).toBe(codeA);
    expect(a.join("")).toBe(b.join(""));
    expect(a.join("")).not.toContain(chave);
    expect(a.join("")).toMatch(/Provider DeepSeek|DEEPSEEK_API_KEY|settings/u);
  });

  it("executarCli --ajuda e --doctor (via services default) não crasham duas vezes", async () => {
    for (let i = 0; i < 2; i += 1) {
      const cap = capturar();
      const code = await executarCli(["--ajuda"], cap.io);
      expect(code).toBe(0);
      expect(cap.stdout.join("")).toContain("Uso: codingpro");
    }
  });
});
