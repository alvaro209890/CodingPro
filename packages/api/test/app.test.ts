import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";
import { carregarConfig } from "../src/config.js";
import { configTeste } from "./ajuda.js";

describe("carregarConfig", () => {
  it("usa host e porta padrão do inventário do P0", () => {
    const config = carregarConfig({} as NodeJS.ProcessEnv);
    expect(config.host).toBe("127.0.0.1");
    expect(config.porta).toBe(8700);
    expect(config.ambiente).toBe("desenvolvimento");
    expect(config.limitePadraoMicro).toBe(2_000_000);
  });

  it("respeita host, porta e limite do ambiente", () => {
    const config = carregarConfig({
      CODINGPRO_AMBIENTE: "producao",
      CODINGPRO_API_HOST: "127.0.0.2",
      CODINGPRO_API_PORTA: "9100",
      CODINGPRO_LIMITE_PADRAO_MICRO: "500000",
      SESSION_SECRET: "x".repeat(40),
    } as NodeJS.ProcessEnv);
    expect(config.host).toBe("127.0.0.2");
    expect(config.porta).toBe(9100);
    expect(config.limitePadraoMicro).toBe(500_000);
  });

  it("rejeita porta e limite inválidos em vez de cair num padrão silencioso", () => {
    expect(() => carregarConfig({ CODINGPRO_API_PORTA: "abc" } as NodeJS.ProcessEnv)).toThrow(
      /CODINGPRO_API_PORTA/,
    );
    expect(() => carregarConfig({ CODINGPRO_API_PORTA: "70000" } as NodeJS.ProcessEnv)).toThrow(
      /CODINGPRO_API_PORTA/,
    );
    expect(() =>
      carregarConfig({ CODINGPRO_LIMITE_PADRAO_MICRO: "-1" } as NodeJS.ProcessEnv),
    ).toThrow(/LIMITE_PADRAO/);
  });

  it("exige SESSION_SECRET forte em produção — não sobe com o padrão de desenvolvimento", () => {
    expect(() => carregarConfig({ CODINGPRO_AMBIENTE: "producao" } as NodeJS.ProcessEnv)).toThrow(
      /SESSION_SECRET/,
    );
    expect(() =>
      carregarConfig({
        CODINGPRO_AMBIENTE: "producao",
        SESSION_SECRET: "curto",
      } as NodeJS.ProcessEnv),
    ).toThrow(/SESSION_SECRET/);
  });
});

describe("criarApp em modo degradado (sem banco)", () => {
  it("responde /saude sinalizando que o banco está fora", async () => {
    const app = await criarApp({ config: configTeste() });
    const resposta = await app.inject({ method: "GET", url: "/saude" });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ banco: false, ok: true, servico: "codingpro-api" });
    await app.close();
  });

  it("não expõe as rotas de conta quando não há banco", async () => {
    const app = await criarApp({ config: configTeste() });
    const resposta = await app.inject({ method: "POST", url: "/api/login" });
    expect(resposta.statusCode).toBe(404);
    await app.close();
  });

  it("manda headers de segurança em toda resposta", async () => {
    const app = await criarApp({ config: configTeste() });
    const resposta = await app.inject({ method: "GET", url: "/" });
    expect(resposta.headers["x-content-type-options"]).toBe("nosniff");
    expect(resposta.headers["x-frame-options"]).toBe("DENY");
    await app.close();
  });

  it("devolve 404 em pt-BR para rota inexistente", async () => {
    const app = await criarApp({ config: configTeste() });
    const resposta = await app.inject({ method: "GET", url: "/nao-existe" });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({
      erro: "rota_inexistente",
      mensagem: "Rota não encontrada.",
    });
    await app.close();
  });
});
