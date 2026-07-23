import { describe, expect, it } from "vitest";
import { DEEPSEEK_BASE_URL, DeepSeekProvider, normalizarBaseUrl } from "../src/index.js";

describe("normalizarBaseUrl", () => {
  it("aceita o DeepSeek direto e não deixa barra final", () => {
    expect(normalizarBaseUrl(DEEPSEEK_BASE_URL)).toBe("https://api.deepseek.com");
    expect(normalizarBaseUrl("https://api.deepseek.com/")).toBe("https://api.deepseek.com");
  });

  it("aceita o proxy da plataforma com caminho", () => {
    expect(normalizarBaseUrl("https://codingpro-api.cursar.space/v1")).toBe(
      "https://codingpro-api.cursar.space/v1",
    );
    expect(normalizarBaseUrl("https://codingpro-api.cursar.space/v1/")).toBe(
      "https://codingpro-api.cursar.space/v1",
    );
  });

  it("libera http só em localhost, para desenvolver o proxy", () => {
    expect(normalizarBaseUrl("http://127.0.0.1:8700/v1")).toBe("http://127.0.0.1:8700/v1");
    expect(normalizarBaseUrl("http://localhost:8700/v1")).toBe("http://localhost:8700/v1");
    expect(() => normalizarBaseUrl("http://exemplo.com/v1")).toThrow(/URL base/);
  });

  it("recusa URL malformada, com credencial embutida ou com query/hash", () => {
    expect(() => normalizarBaseUrl("nao-e-url")).toThrow(/URL base/);
    expect(() => normalizarBaseUrl("https://user:senha@api.deepseek.com")).toThrow(/URL base/);
    expect(() => normalizarBaseUrl("https://api.deepseek.com/v1?x=1")).toThrow(/URL base/);
    expect(() => normalizarBaseUrl("https://api.deepseek.com/v1#frag")).toThrow(/URL base/);
  });
});

describe("DeepSeekProvider com baseUrl customizada", () => {
  it("chama o proxy no caminho esperado e envia o token cp_", async () => {
    const chamadas: Array<{ url: string; auth: string | null; metodo: string | undefined }> = [];
    const provider = new DeepSeekProvider({
      apiKey: "cp_token_de_teste",
      baseUrl: "https://codingpro-api.cursar.space/v1",
      fetch: async (input, init) => {
        const req = new Request(input as RequestInfo, init as RequestInit);
        chamadas.push({
          auth: req.headers.get("authorization"),
          metodo: init?.method,
          url: req.url,
        });
        return new Response(
          'data: {"choices":[{"delta":{"content":"oi"},"index":0}]}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" }, status: 200 },
        );
      },
    });

    for await (const _evento of provider.stream({
      messages: [{ content: "olá", role: "user" }],
    })) {
      // consumir o stream inteiro
    }

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url).toBe("https://codingpro-api.cursar.space/v1/chat/completions");
    expect(chamadas[0]?.auth).toBe("Bearer cp_token_de_teste");
    expect(chamadas[0]?.metodo).toBe("POST");
  });

  it("recusa base http remota (fail-closed) já na construção", () => {
    expect(
      () => new DeepSeekProvider({ apiKey: "x", baseUrl: "http://api.malicioso.com/v1" }),
    ).toThrow(/URL base/);
  });
});
