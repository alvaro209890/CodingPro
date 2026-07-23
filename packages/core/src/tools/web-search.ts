/**
 * Tool `web_search`: busca na web e retorna resultados.
 * Tool `web_extract`: extrai conteúdo de URLs como markdown.
 */

import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import type { ExecutableTool, ToolContext } from "../tool.js";
import { errorResult, textResult } from "../tool.js";

const WEB_SEARCH_DEFINITION: Tool = {
  name: "web_search",
  description:
    "Busca na web e retorna até 5 resultados com título, URL e descrição. Use para pesquisar documentação, soluções, ou informações atuais.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Termo de busca." },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const WEB_EXTRACT_DEFINITION: Tool = {
  name: "web_extract",
  description:
    "Extrai o conteúdo de uma URL como markdown. Use para ler documentação, artigos, ou páginas web.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL da página a extrair." },
    },
    required: ["url"],
    additionalProperties: false,
  },
};

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const webSearchTool: ExecutableTool = {
  definition: WEB_SEARCH_DEFINITION,
  sideEffect: "read",
  async execute(input: JsonObject, _context: ToolContext): Promise<ToolResult> {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query) return errorResult("Termo de busca vazio.");

    try {
      // Usa DuckDuckGo Lite (sem API key)
      const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const resp = await fetchWithTimeout(url, {
        headers: { "User-Agent": "CodingPro/1.0" },
      });
      if (!resp.ok) return errorResult(`Erro HTTP ${resp.status} na busca.`);

      const html = await resp.text();
      // Extrai links do DuckDuckGo Lite
      const linkRegex = /<a[^>]*href="([^"]*)"[^>]*class="result-link"[^>]*>([^<]*)<\/a>/gi;
      const _snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([^<]*)<\/td>/gi;

      const links: Array<{ url: string; title: string }> = [];
      let m = linkRegex.exec(html);
      while (m !== null && links.length < 5) {
        links.push({ url: m[1]?.replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0] ?? m[1] ?? "", title: m[2]?.trim() ?? "" });
        m = linkRegex.exec(html);
      }

      if (links.length === 0) return textResult(`Nenhum resultado para: ${query}`);

      const results = links
        .map((l, i) => `${i + 1}. **[${l.title || "sem título"}](${decodeURIComponent(l.url)})**`)
        .join("\n");

      return textResult(`Resultados para **${query}**:\n\n${results}`);
    } catch (err) {
      return errorResult(`Falha na busca: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

export const webExtractTool: ExecutableTool = {
  definition: WEB_EXTRACT_DEFINITION,
  sideEffect: "read",
  async execute(input: JsonObject, _context: ToolContext): Promise<ToolResult> {
    const url = typeof input.url === "string" ? input.url.trim() : "";
    if (!url) return errorResult("URL vazia.");

    try {
      const resp = await fetchWithTimeout(url, {
        headers: { "User-Agent": "CodingPro/1.0" },
      });
      if (!resp.ok) return errorResult(`Erro HTTP ${resp.status} ao acessar ${url}`);

      const contentType = resp.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        const html = await resp.text();
        // Extrai texto do HTML de forma simples
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);
        return textResult(`Conteúdo de ${url}:\n\n${text}${text.length >= 8000 ? "\n\n(truncado em 8k caracteres)" : ""}`);
      }

      const text = await resp.text();
      return textResult(`Conteúdo de ${url}:\n\n${text.slice(0, 8000)}`);
    } catch (err) {
      return errorResult(`Falha ao extrair: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
