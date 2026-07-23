import { createServer } from "node:http";
import { PAGINA_EM_BREVE } from "./pagina.js";

const HOST = process.env.CODINGPRO_WEB_HOST?.trim() || "127.0.0.1";
const PORTA = Number.parseInt(process.env.CODINGPRO_WEB_PORTA ?? "8701", 10);

/**
 * Servidor mínimo do site no P0: entrega a página "em breve" e responde /saude.
 * No P3a este pacote vira um app Next.js (landing + dashboard) e este arquivo sai.
 */
const servidor = createServer((req, resposta) => {
  if (req.url === "/saude") {
    resposta.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    resposta.end(JSON.stringify({ ok: true, servico: "codingpro-web" }));
    return;
  }

  resposta.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  resposta.end(PAGINA_EM_BREVE);
});

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => servidor.close(() => process.exit(0)));
}

servidor.listen(PORTA, HOST, () => {
  console.log(`site do CodingPro em http://${HOST}:${PORTA}`);
});
