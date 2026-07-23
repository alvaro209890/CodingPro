import Fastify, { type FastifyInstance } from "fastify";
import type { ConfigApi } from "./config.js";

/** Momento em que o processo subiu — base do uptime reportado em /saude. */
const INICIO = Date.now();

export type RespostaSaude = {
  readonly ok: boolean;
  readonly servico: "codingpro-api";
  readonly versao: string;
  readonly ambiente: ConfigApi["ambiente"];
  readonly uptimeSegundos: number;
};

/**
 * Monta a instância Fastify da API.
 *
 * No P0 só existem os endpoints de vida (`/saude`, `/`). O proxy LLM,
 * autenticação e medição de consumo entram no P1.
 */
export function criarApp(config: ConfigApi): FastifyInstance {
  const app = Fastify({
    logger: config.ambiente === "producao" ? { level: "warn" } : { level: "info" },
    // O tunnel do Cloudflare é o único caminho de entrada; confiar nos headers dele
    // é o que permite ver o IP real do cliente em vez de 127.0.0.1.
    trustProxy: true,
    disableRequestLogging: config.ambiente === "producao",
  });

  app.get("/saude", async (): Promise<RespostaSaude> => {
    return {
      ok: true,
      servico: "codingpro-api",
      versao: "0.1.0",
      ambiente: config.ambiente,
      uptimeSegundos: Math.floor((Date.now() - INICIO) / 1000),
    };
  });

  app.get("/", async (_req, resposta) => {
    return resposta
      .type("text/plain; charset=utf-8")
      .send(
        [
          "CodingPro — API da plataforma web",
          "",
          "Fase 3 · P0 (fundação de infra). O proxy LLM ainda não está no ar.",
          "Endpoints disponíveis: GET /saude",
        ].join("\n"),
      );
  });

  app.setNotFoundHandler(async (_req, resposta) => {
    return resposta
      .status(404)
      .send({ erro: "rota_inexistente", mensagem: "Rota não encontrada." });
  });

  return app;
}
