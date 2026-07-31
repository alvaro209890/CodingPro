import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gravarCredenciais } from "../src/conta.js";
import { criarProviderRuntime, type ProviderRuntimeContext } from "../src/provider-runtime.js";

let dir = "";
let home = "";
let cwd = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "codingpro-cloud-"));
  home = join(dir, "home");
  cwd = join(dir, "projeto");
  await Promise.all([mkdir(home, { recursive: true }), mkdir(cwd, { recursive: true })]);
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

function contexto(environment: NodeJS.ProcessEnv): ProviderRuntimeContext {
  return { cwd, environment, flags: {}, homeDirectory: home };
}

async function conectarConta(apiUrl = "https://codingpro-api.cursar.space"): Promise<void> {
  await gravarCredenciais(home, {
    apiUrl,
    criadoEm: new Date().toISOString(),
    token: "cp_token_de_teste",
  });
}

describe("modo cloud da CLI", () => {
  it("usa a conta conectada quando não há chave própria", async () => {
    await conectarConta();
    const provider = await criarProviderRuntime(contexto({}));
    expect(provider.id).toBe("deepseek");
    expect(provider.model).toBe("deepseek-v4-flash");
  });

  it("funciona sem provider escolhido no settings — o login já é escolha suficiente", async () => {
    await conectarConta();
    await expect(criarProviderRuntime(contexto({}))).resolves.toBeDefined();
  });

  it("a chave própria tem prioridade sobre a conta", async () => {
    // A conta aponta para uma base que o provider recusa (http remoto). Se o caminho
    // da conta fosse escolhido, a construção estouraria; como a chave própria vence,
    // o provider nasce normalmente. Discrimina os dois caminhos sem tocar na rede.
    await conectarConta("http://proxy-remoto.invalido/v1");
    const provider = await criarProviderRuntime(
      contexto({ CODINGPRO_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "sk-minha-chave" }),
    );
    expect(provider.id).toBe("deepseek");
  });

  it("sem chave própria, a base inválida da conta é recusada em vez de ser ignorada", async () => {
    await conectarConta("http://proxy-remoto.invalido/v1");
    await expect(criarProviderRuntime(contexto({}))).rejects.toMatchObject({
      safeMessage: expect.stringContaining("URL base"),
    });
  });

  it("sem conta e sem chave, pede o login com mensagem acionável", async () => {
    await expect(
      criarProviderRuntime(contexto({ CODINGPRO_PROVIDER: "deepseek" })),
    ).rejects.toMatchObject({
      code: "not-configured",
      safeMessage: expect.stringContaining("codingpro login"),
    });
  });

  it("aponta para a API gravada nas credenciais, não para uma fixa", async () => {
    await conectarConta("http://127.0.0.1:8700");
    const provider = await criarProviderRuntime(contexto({}));
    expect(provider.id).toBe("deepseek");
  });

  it("replay explícito continua ganhando de tudo", async () => {
    await conectarConta();
    await expect(
      criarProviderRuntime(contexto({ CODINGPRO_PROVIDER: "replay" })),
    ).rejects.toMatchObject({ safeMessage: expect.stringContaining("replay") });
  });

  it("CODINGPRO_TOKEN do ambiente liga o modo cloud sem arquivo de credenciais", async () => {
    const provider = await criarProviderRuntime(
      contexto({
        CODINGPRO_API_URL: "http://127.0.0.1:8700",
        CODINGPRO_TOKEN: "cp_token_pelo_ambiente",
      }),
    );
    expect(provider.id).toBe("deepseek");
  });

  it("DEEPSEEK_API_KEY própria ainda vence CODINGPRO_TOKEN", async () => {
    const provider = await criarProviderRuntime(
      contexto({
        CODINGPRO_TOKEN: "cp_token_pelo_ambiente",
        CODINGPRO_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: "sk-minha-chave",
      }),
    );
    expect(provider.id).toBe("deepseek");
  });
});
