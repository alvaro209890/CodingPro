import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";
import { carregarConfig } from "../src/config.js";

const CONFIG_TESTE = carregarConfig({ CODINGPRO_AMBIENTE: "producao" } as NodeJS.ProcessEnv);

describe("carregarConfig", () => {
  it("usa host e porta padrão do inventário do P0", () => {
    const config = carregarConfig({} as NodeJS.ProcessEnv);
    expect(config.host).toBe("127.0.0.1");
    expect(config.porta).toBe(8700);
    expect(config.ambiente).toBe("desenvolvimento");
  });

  it("respeita host e porta do ambiente", () => {
    const config = carregarConfig({
      CODINGPRO_API_HOST: "127.0.0.2",
      CODINGPRO_API_PORTA: "9100",
      CODINGPRO_AMBIENTE: "producao",
    } as NodeJS.ProcessEnv);
    expect(config.host).toBe("127.0.0.2");
    expect(config.porta).toBe(9100);
    expect(config.ambiente).toBe("producao");
  });

  it("rejeita porta inválida em vez de cair num padrão silencioso", () => {
    expect(() => carregarConfig({ CODINGPRO_API_PORTA: "abc" } as NodeJS.ProcessEnv)).toThrow(
      /CODINGPRO_API_PORTA/,
    );
    expect(() => carregarConfig({ CODINGPRO_API_PORTA: "70000" } as NodeJS.ProcessEnv)).toThrow(
      /CODINGPRO_API_PORTA/,
    );
  });
});

describe("criarApp", () => {
  it("responde /saude com ok e identificação do serviço", async () => {
    const app = criarApp(CONFIG_TESTE);
    const resposta = await app.inject({ method: "GET", url: "/saude" });
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.ok).toBe(true);
    expect(corpo.servico).toBe("codingpro-api");
    expect(corpo.ambiente).toBe("producao");
    expect(corpo.uptimeSegundos).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it("responde a raiz em texto avisando que o proxy ainda não está no ar", async () => {
    const app = criarApp(CONFIG_TESTE);
    const resposta = await app.inject({ method: "GET", url: "/" });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).toContain("CodingPro");
    expect(resposta.body).toContain("/saude");
    await app.close();
  });

  it("devolve 404 em pt-BR para rota inexistente", async () => {
    const app = criarApp(CONFIG_TESTE);
    const resposta = await app.inject({ method: "GET", url: "/nao-existe" });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({
      erro: "rota_inexistente",
      mensagem: "Rota não encontrada.",
    });
    await app.close();
  });
});
