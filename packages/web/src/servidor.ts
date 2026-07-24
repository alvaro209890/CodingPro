import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.CODINGPRO_WEB_HOST?.trim() || "127.0.0.1";
const PORTA = Number.parseInt(process.env.CODINGPRO_WEB_PORTA ?? "8701", 10);
const API = "https://codingpro-api.cursar.space";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist-site");
/** Pasta dos artefatos Windows (zip portable, instalador). */
const DOWNLOADS = resolve(
  process.env.CODINGPRO_DOWNLOADS_DIR?.trim() ||
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "desktop", ".pack", "release"),
);

const TIPOS: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".zip": "application/zip",
};

function resolverArquivo(url: string): string | null {
  const caminho = decodeURIComponent(url.split("?")[0] ?? "/");
  const alvo = resolve(join(RAIZ, normalize(caminho)));
  return alvo === RAIZ || alvo.startsWith(RAIZ + sep) ? alvo : null;
}

async function servirDownload(
  req: IncomingMessage,
  resposta: ServerResponse,
  url: string,
): Promise<boolean> {
  if (!url.startsWith("/downloads/")) return false;
  const nome = decodeURIComponent(url.slice("/downloads/".length).split("?")[0] ?? "");
  if (!nome || nome.includes("..") || nome.includes("/") || nome.includes("\\")) {
    resposta.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    resposta.end("Caminho inválido.");
    return true;
  }
  const arquivo = resolve(join(DOWNLOADS, nome));
  if (!arquivo.startsWith(resolve(DOWNLOADS) + sep)) {
    resposta.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    resposta.end("Acesso negado.");
    return true;
  }
  const info = await stat(arquivo).catch(() => null);
  if (!info?.isFile()) {
    resposta.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    resposta.end(
      JSON.stringify({ erro: "arquivo_nao_encontrado", mensagem: "Download não encontrado." }),
    );
    return true;
  }
  const extensao = extname(arquivo);
  resposta.writeHead(200, {
    "cache-control": "public, max-age=3600",
    "content-disposition": `attachment; filename="${basename(arquivo)}"`,
    "content-length": String(info.size),
    "content-type": TIPOS[extensao] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  createReadStream(arquivo).pipe(resposta);
  return true;
}

/** Proxy: encaminha requisições /api/* para a API, repassando cookies e corpo. */
function proxyApi(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", API);
  const bodyChunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => bodyChunks.push(chunk));
  req.on("end", () => {
    const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;
    const proxyReq = httpsRequest(
      url,
      {
        method: req.method,
        headers: {
          ...Object.fromEntries(
            Object.entries(req.headers).filter(
              ([k]) => !["host", "origin", "referer"].includes(k.toLowerCase()),
            ),
          ),
          host: url.host,
        },
      },
      (proxyRes) => {
        const headers: Record<string, string | string[]> = {};
        const setCookies: string[] = [];
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (!v) continue;
          if (k.toLowerCase() === "set-cookie") {
            // Nunca juntar Set-Cookie com vírgula — quebra cookies múltiplos.
            const lista = Array.isArray(v) ? v : [v];
            for (const bruto of lista) {
              setCookies.push(bruto.replace(/;\s*domain=[^;]+/gi, ""));
            }
            continue;
          }
          headers[k] = Array.isArray(v) ? v.join(", ") : v;
        }
        headers["access-control-allow-origin"] =
          req.headers.origin || "https://codingpro.cursar.space";
        headers["access-control-allow-credentials"] = "true";
        if (setCookies.length > 0) headers["set-cookie"] = setCookies;
        res.writeHead(proxyRes.statusCode ?? 200, headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ erro: "proxy_error", mensagem: "Erro ao conectar à API." }));
    });
    if (body) proxyReq.write(body);
    proxyReq.end();
  });
}

const servidor = createServer(async (req, resposta) => {
  // Proxy API requests
  if (req.url?.startsWith("/api/")) {
    proxyApi(req, resposta);
    return;
  }

  if (req.url === "/saude") {
    resposta.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    resposta.end(JSON.stringify({ ok: true, servico: "codingpro-web" }));
    return;
  }

  if (await servirDownload(req, resposta, req.url ?? "/")) return;

  const alvo = resolverArquivo(req.url ?? "/");
  const indice = join(RAIZ, "index.html");
  let arquivo = indice;
  if (alvo) {
    const info = await stat(alvo).catch(() => null);
    if (info?.isFile()) arquivo = alvo;
  }

  const extensao = extname(arquivo);
  const ehIndice = arquivo === indice;
  resposta.writeHead(200, {
    "cache-control": ehIndice ? "no-store" : "public, max-age=31536000, immutable",
    "content-type": TIPOS[extensao] ?? "application/octet-stream",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  createReadStream(arquivo).pipe(resposta);
});

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => servidor.close(() => process.exit(0)));
}

servidor.listen(PORTA, HOST, () => {
  console.log(`site do CodingPro em http://${HOST}:${PORTA} (estáticos de ${RAIZ})`);
  console.log(`downloads Windows em ${DOWNLOADS}`);
});
