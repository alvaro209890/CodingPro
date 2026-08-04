import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { type ExecutableTool, errorResult, type ToolContext, textResult } from "../tool.js";

const MAX_BODY = 32_000;
const TIMEOUT_MS = 20_000;

/** Sufixos de host permitidos (T9). */
export const HTTP_REQUEST_HOST_ALLOWLIST = Object.freeze([
  "github.com",
  "githubusercontent.com",
  "raw.githubusercontent.com",
  "api.github.com",
  "npmjs.com",
  "registry.npmjs.org",
  "pypi.org",
  "crates.io",
  "golang.org",
  "codingpro.cursar.space",
  "codingpro-api.cursar.space",
  "cursar.space",
] as const);

const definition: Tool = {
  description:
    "HTTP GET/POST para APIs JSON em domínios allowlisted (sem cookies). Complementa web_extract " +
    "quando a resposta é estruturada. Corpo limitado a 32k caracteres.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      body: { description: "Corpo da requisição (POST).", type: "string" },
      headersJson: {
        description: 'Cabeçalhos extras como JSON string, ex.: {"Accept":"application/json"} (sem Cookie).',
        type: "string",
      },
      method: { description: "GET ou POST (padrão GET).", enum: ["GET", "POST"], type: "string" },
      url: { description: "URL https absoluta.", type: "string" },
    },
    required: ["url"],
    type: "object",
  },
  name: "http_request",
};

export function hostPermitido(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return HTTP_REQUEST_HOST_ALLOWLIST.some((sufixo) => h === sufixo || h.endsWith(`.${sufixo}`));
}

export const httpRequestTool: ExecutableTool = {
  definition,
  sideEffect: "read",
  async execute(input: JsonObject, _context: ToolContext): Promise<ToolResult> {
    const urlBruta = typeof input.url === "string" ? input.url.trim() : "";
    if (!urlBruta) return errorResult("URL vazia.");
    let url: URL;
    try {
      url = new URL(urlBruta);
    } catch {
      return errorResult("URL inválida.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return errorResult("Só http/https são permitidos.");
    }
    if (!hostPermitido(url.hostname)) {
      return errorResult(
        `Host "${url.hostname}" fora da allowlist. Use web_extract para páginas ou um MCP.`,
      );
    }

    const method =
      typeof input.method === "string" && input.method.toUpperCase() === "POST" ? "POST" : "GET";
    const headers: Record<string, string> = { "User-Agent": "CodingPro/1.0" };
    if (typeof input.headersJson === "string" && input.headersJson.trim() !== "") {
      try {
        const parsed = JSON.parse(input.headersJson) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string" && !/^cookie$/iu.test(k)) headers[k] = v;
          }
        }
      } catch {
        return errorResult("headersJson inválido — use um objeto JSON de strings.");
      }
    }
    const body = typeof input.body === "string" ? input.body : undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const init: RequestInit = {
        headers,
        method,
        redirect: "follow",
        signal: controller.signal,
      };
      if (method === "POST" && body !== undefined) {
        init.body = body;
      }
      const resp = await fetch(url, init);
      const texto = (await resp.text()).slice(0, MAX_BODY);
      const truncado = texto.length >= MAX_BODY ? "\n…(truncado)" : "";
      return textResult(`HTTP ${resp.status} ${method} ${url.href}\n\n${texto}${truncado}`);
    } catch (err) {
      return errorResult(`Falha HTTP: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  },
};
