import { describe, expect, it } from "vitest";
import {
  custoMicro,
  extrairUsoDeSse,
  LeitorDeUso,
  modeloPermitido,
  normalizarUso,
  prepararCorpoUpstream,
  validarCorpo,
} from "../src/proxy.js";

describe("modeloPermitido", () => {
  it("aceita só os dois modelos da allowlist", () => {
    expect(modeloPermitido("deepseek-v4-pro")).toBe(true);
    expect(modeloPermitido("deepseek-v4-flash")).toBe(true);
    expect(modeloPermitido("gpt-4")).toBe(false);
    expect(modeloPermitido(undefined)).toBe(false);
    expect(modeloPermitido(123)).toBe(false);
  });
});

describe("normalizarUso", () => {
  it("lê o formato legado do cache-hit", () => {
    expect(
      normalizarUso({ completion_tokens: 50, prompt_cache_hit_tokens: 400, prompt_tokens: 1000 }),
    ).toEqual({
      tokensCache: 400,
      tokensEntrada: 1000,
      tokensRaciocinio: 0,
      tokensSaida: 50,
    });
  });

  it("lê o formato novo (prompt_tokens_details.cached_tokens)", () => {
    expect(
      normalizarUso({
        completion_tokens: 50,
        prompt_tokens: 1000,
        prompt_tokens_details: { cached_tokens: 700 },
      }).tokensCache,
    ).toBe(700);
  });

  it("nunca deixa o cache passar da entrada — senão o custo sairia negativo", () => {
    expect(
      normalizarUso({ completion_tokens: 1, prompt_cache_hit_tokens: 5000, prompt_tokens: 100 })
        .tokensCache,
    ).toBe(100);
  });

  it("trata usage ausente, nulo ou com números inválidos como zero", () => {
    const zerado = { tokensCache: 0, tokensEntrada: 0, tokensRaciocinio: 0, tokensSaida: 0 };
    expect(normalizarUso(null)).toEqual(zerado);
    expect(normalizarUso(undefined)).toEqual(zerado);
    expect(normalizarUso({ completion_tokens: -5, prompt_tokens: Number.NaN })).toEqual(zerado);
  });

  it("captura tokens de raciocínio", () => {
    expect(
      normalizarUso({
        completion_tokens: 100,
        completion_tokens_details: { reasoning_tokens: 80 },
        prompt_tokens: 10,
      }).tokensRaciocinio,
    ).toBe(80);
  });
});

describe("custoMicro", () => {
  it("cobra cache-hit bem mais barato que cache-miss", () => {
    const semCache = custoMicro(
      { tokensCache: 0, tokensEntrada: 100_000, tokensRaciocinio: 0, tokensSaida: 0 },
      "deepseek-v4-pro",
    );
    const comCache = custoMicro(
      { tokensCache: 100_000, tokensEntrada: 100_000, tokensRaciocinio: 0, tokensSaida: 0 },
      "deepseek-v4-pro",
    );
    expect(semCache).toBeGreaterThan(comCache * 50);
  });

  it("o Flash é ordens de grandeza mais barato que o Pro", () => {
    const uso = { tokensCache: 0, tokensEntrada: 1_000_000, tokensRaciocinio: 0, tokensSaida: 0 };
    expect(custoMicro(uso, "deepseek-v4-pro")).toBeGreaterThan(
      custoMicro(uso, "deepseek-v4-flash"),
    );
  });

  it("devolve inteiro (micro-dólares), nunca fração", () => {
    const valor = custoMicro(
      { tokensCache: 13, tokensEntrada: 777, tokensRaciocinio: 5, tokensSaida: 31 },
      "deepseek-v4-pro",
    );
    expect(Number.isInteger(valor)).toBe(true);
  });
});

describe("extrairUsoDeSse", () => {
  it("pega o usage do último chunk", () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\n' +
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n' +
      "data: [DONE]\n\n";
    expect(extrairUsoDeSse(sse)).toEqual({ completion_tokens: 2, prompt_tokens: 10 });
  });

  it("ignora chunks quebrados no meio sem estourar", () => {
    expect(extrairUsoDeSse('data: {"choices":[{"delta"')).toBeNull();
    expect(extrairUsoDeSse("data: [DONE]\n\n")).toBeNull();
    expect(extrairUsoDeSse("linha solta\n")).toBeNull();
  });
});

describe("LeitorDeUso", () => {
  it("encontra o usage mesmo quando o SSE chega picado", () => {
    const leitor = new LeitorDeUso();
    leitor.alimentar('data: {"choices":[{"delta":{"content":"oi"}}]}\n\ndata: {"cho');
    leitor.alimentar('ices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n');
    leitor.alimentar("data: [DONE]\n\n");
    expect(leitor.uso).toEqual({ completion_tokens: 3, prompt_tokens: 7 });
  });

  it("mantém o buffer limitado em stream longo", () => {
    const leitor = new LeitorDeUso();
    for (let i = 0; i < 200; i += 1) {
      leitor.alimentar(`data: {"choices":[{"delta":{"content":"${"x".repeat(500)}"}}]}\n\n`);
    }
    leitor.alimentar('data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\n');
    expect(leitor.uso).toEqual({ completion_tokens: 1, prompt_tokens: 1 });
  });
});

describe("validarCorpo", () => {
  it("aceita corpo válido e detecta streaming", () => {
    const r = validarCorpo({
      messages: [{ content: "oi", role: "user" }],
      model: "deepseek-v4-pro",
      stream: true,
    });
    expect(r).toEqual({ modelo: "deepseek-v4-pro", ok: true, stream: true });
  });

  it("recusa modelo fora da allowlist", () => {
    const r = validarCorpo({ messages: [{ content: "oi" }], model: "gpt-4" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toMatch(/Modelo não permitido/);
  });

  it("recusa corpo sem mensagens ou não-objeto", () => {
    expect(validarCorpo({ messages: [], model: "deepseek-v4-pro" }).ok).toBe(false);
    expect(validarCorpo(null).ok).toBe(false);
    expect(validarCorpo("texto").ok).toBe(false);
  });
});

describe("prepararCorpoUpstream", () => {
  it("força include_usage no streaming — sem isso não há como medir", () => {
    const corpo = prepararCorpoUpstream({ model: "deepseek-v4-pro", stream: true });
    expect(corpo.stream_options).toEqual({ include_usage: true });
  });

  it("preserva outras stream_options do cliente", () => {
    const corpo = prepararCorpoUpstream({
      model: "deepseek-v4-pro",
      stream: true,
      stream_options: { outro: 1 },
    });
    expect(corpo.stream_options).toEqual({ include_usage: true, outro: 1 });
  });

  it("não mexe em requisição sem streaming", () => {
    const corpo = prepararCorpoUpstream({ model: "deepseek-v4-pro", stream: false });
    expect(corpo.stream_options).toBeUndefined();
  });
});
