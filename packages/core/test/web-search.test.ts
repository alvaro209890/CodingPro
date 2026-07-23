import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { webExtractTool, webSearchTool } from "../src/tools/web-search.js";

const CONTEXTO = {} as ToolContext;
const fetchOriginal = globalThis.fetch;

function respostaHtml(html: string, status = 200): Response {
  return new Response(html, { headers: { "content-type": "text/html" }, status });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  vi.restoreAllMocks();
});

describe("web_search", () => {
  it("recusa termo vazio sem tocar na rede", async () => {
    let chamou = false;
    globalThis.fetch = (async () => {
      chamou = true;
      return respostaHtml("");
    }) as typeof fetch;

    const r = await webSearchTool.execute({ query: "   " }, CONTEXTO);
    expect(r.type).toBe("error-text");
    expect(chamou).toBe(false);
  });

  it("é uma tool de leitura — não pede permissão", () => {
    expect(webSearchTool.sideEffect).toBe("read");
    expect(webExtractTool.sideEffect).toBe("read");
  });

  it("extrai até 5 resultados do HTML", async () => {
    const linhas = Array.from(
      { length: 8 },
      (_, i) => `<a href="https://exemplo.com/${i}" class="result-link">Resultado ${i}</a>`,
    ).join("\n");
    globalThis.fetch = (async () => respostaHtml(linhas)) as typeof fetch;

    const r = await webSearchTool.execute({ query: "typescript" }, CONTEXTO);
    const texto = JSON.stringify(r);
    expect(r.type).toBe("text");
    expect(texto).toContain("Resultado 0");
    expect(texto).toContain("Resultado 4");
    expect(texto).not.toContain("Resultado 5");
  });

  it("avisa quando não há resultado, em vez de devolver lista vazia", async () => {
    globalThis.fetch = (async () => respostaHtml("<html>nada aqui</html>")) as typeof fetch;
    const r = await webSearchTool.execute({ query: "termo raríssimo" }, CONTEXTO);
    expect(JSON.stringify(r)).toContain("Nenhum resultado");
  });

  it("erro HTTP vira mensagem, não exceção", async () => {
    globalThis.fetch = (async () => respostaHtml("", 503)) as typeof fetch;
    const r = await webSearchTool.execute({ query: "x" }, CONTEXTO);
    expect(r.type).toBe("error-text");
    expect(JSON.stringify(r)).toContain("503");
  });

  it("falha de rede vira mensagem legível", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    const r = await webSearchTool.execute({ query: "x" }, CONTEXTO);
    expect(r.type).toBe("error-text");
    expect(JSON.stringify(r)).toContain("ECONNRESET");
  });

  it("query não-string é tratada como vazia", async () => {
    const r = await webSearchTool.execute({ query: 42 as never }, CONTEXTO);
    expect(r.type).toBe("error-text");
  });
});

describe("web_extract", () => {
  it("recusa URL vazia", async () => {
    const r = await webExtractTool.execute({ url: "" }, CONTEXTO);
    expect(r.type).toBe("error-text");
  });

  it("limpa script, style e tags do HTML", async () => {
    globalThis.fetch = (async () =>
      respostaHtml(
        "<html><script>var segredo=1</script><style>.x{}</style><body><h1>Título</h1><p>Corpo &amp; texto</p></body></html>",
      )) as typeof fetch;

    const r = await webExtractTool.execute({ url: "https://exemplo.com" }, CONTEXTO);
    const texto = JSON.stringify(r);
    expect(texto).toContain("Título");
    expect(texto).toContain("Corpo & texto");
    expect(texto).not.toContain("var segredo");
    expect(texto).not.toContain("<h1>");
  });

  it("trunca conteúdo gigante e avisa", async () => {
    globalThis.fetch = (async () =>
      respostaHtml(`<body>${"palavra ".repeat(5_000)}</body>`)) as typeof fetch;
    const r = await webExtractTool.execute({ url: "https://exemplo.com" }, CONTEXTO);
    expect(JSON.stringify(r)).toContain("truncado");
  });

  it("conteúdo não-HTML passa como texto puro", async () => {
    globalThis.fetch = (async () =>
      new Response('{"a":1}', {
        headers: { "content-type": "application/json" },
        status: 200,
      })) as typeof fetch;
    const r = await webExtractTool.execute({ url: "https://exemplo.com/api" }, CONTEXTO);
    expect(JSON.stringify(r)).toContain('{\\"a\\":1}');
  });

  it("erro HTTP e falha de rede viram mensagem", async () => {
    globalThis.fetch = (async () => respostaHtml("", 404)) as typeof fetch;
    expect((await webExtractTool.execute({ url: "https://x.com" }, CONTEXTO)).type).toBe(
      "error-text",
    );

    globalThis.fetch = (async () => {
      throw new Error("DNS falhou");
    }) as typeof fetch;
    const r = await webExtractTool.execute({ url: "https://x.com" }, CONTEXTO);
    expect(JSON.stringify(r)).toContain("DNS falhou");
  });
});
