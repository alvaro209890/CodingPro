import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.CODINGPRO_WEB_HOST?.trim() || "127.0.0.1";
const PORTA = Number.parseInt(process.env.CODINGPRO_WEB_PORTA ?? "8701", 10);

/** Build do Vite. `dist/` fica ao lado de `dist-site/` dentro do pacote. */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist-site");

const TIPOS: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * Resolve a URL num arquivo dentro de `RAIZ`, ou `null` se escapar da raiz.
 * Barreira contra path traversal: só entrega o que está mesmo debaixo de `dist-site`.
 */
function resolverArquivo(url: string): string | null {
  const caminho = decodeURIComponent(url.split("?")[0] ?? "/");
  const alvo = resolve(join(RAIZ, normalize(caminho)));
  return alvo === RAIZ || alvo.startsWith(RAIZ + "/") ? alvo : null;
}

const servidor = createServer(async (req, resposta) => {
  if (req.url === "/saude") {
    resposta.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    resposta.end(JSON.stringify({ ok: true, servico: "codingpro-web" }));
    return;
  }

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
    // Os assets do Vite têm hash no nome: cacheáveis para sempre. O index não —
    // é ele que aponta para o build novo depois de cada deploy.
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
});
