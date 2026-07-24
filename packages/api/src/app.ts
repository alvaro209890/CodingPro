import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import estatico from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { ConfigApi } from "./config.js";
import type { Contexto } from "./contexto.js";
import type { Repositorio } from "./repositorio.js";
import { criarMetricas, registrarRotasAdmin } from "./rotas/admin.js";
import { registrarRotasAuth } from "./rotas/auth.js";
import { registrarRotasConsumo } from "./rotas/consumo.js";
import { registrarRotasDevice } from "./rotas/device.js";
import { registrarRotasProxy } from "./rotas/proxy.js";
import { registrarRotasTokens } from "./rotas/tokens.js";
import { registrarRotasPlayground } from "./rotas/playground.js";
import { registrarRotaAgente } from "./rotas/agente.js";
import { registrarRotaCli } from "./rotas/cli.js";

/** Momento em que o processo subiu — base do uptime reportado em /saude. */
const INICIO = Date.now();

export type RespostaSaude = {
  readonly ok: boolean;
  readonly servico: "codingpro-api";
  readonly versao: string;
  readonly ambiente: ConfigApi["ambiente"];
  readonly uptimeSegundos: number;
  readonly banco: boolean;
};

export type OpcoesApp = {
  readonly config: ConfigApi;
  /** Ausente = modo degradado: só `/saude` e a raiz respondem. */
  readonly repo?: Repositorio;
  /** Injetável para teste do proxy. */
  readonly fetch?: typeof globalThis.fetch;
  /** Diretório do build do painel admin (SPA), servido em `/admin`. */
  readonly dirAdmin?: string;
};

/** Monta a instância Fastify completa da API. */
export async function criarApp(opcoes: OpcoesApp): Promise<FastifyInstance> {
  const { config } = opcoes;
  const app = Fastify({
    bodyLimit: 512 * 1024 * 1024,
    disableRequestLogging: config.ambiente === "producao",
    logger: config.ambiente === "producao" ? { level: "warn" } : { level: "info" },
    // O tunnel do Cloudflare é o único caminho de entrada; confiar nos headers dele
    // é o que permite ver o IP real do cliente em vez de 127.0.0.1.
    trustProxy: true,
  });

  const metricas = criarMetricas();
  app.addHook("onRequest", async (req) => {
    metricas.ativas += 1;
    metricas.total += 1;
    (req as { inicioMs?: number }).inicioMs = Date.now();
  });
  app.addHook("onResponse", async (req, resposta) => {
    metricas.ativas = Math.max(0, metricas.ativas - 1);
    if (resposta.statusCode >= 500) metricas.erros5xx += 1;
    const inicio = (req as { inicioMs?: number }).inicioMs;
    if (inicio !== undefined) {
      metricas.latencias.push(Date.now() - inicio);
      // Janela deslizante: p50/p95 refletem o passado recente, não o dia inteiro.
      if (metricas.latencias.length > 500) metricas.latencias.shift();
    }
  });

  app.addHook("onSend", async (_req, resposta, carga) => {
    resposta.header("x-content-type-options", "nosniff");
    resposta.header("referrer-policy", "no-referrer");
    resposta.header("x-frame-options", "DENY");
    if (config.ambiente === "producao") {
      resposta.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    return carga;
  });

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(multipart, {
    limits: {
      fileSize: 512 * 1024 * 1024,
      files: 1_000,
    },
  });

  await app.register(rateLimit, {
    // Teto global por IP. O proxy tem o seu próprio limite, mais apertado.
    allowList: () => false,
    max: 300,
    timeWindow: "1 minute",
  });

  // CORS restrito à origem do site — o cookie de sessão exige `credentials`.
  app.addHook("onRequest", async (req, resposta) => {
    const origem = req.headers.origin;
    if (origem === config.siteUrl || (config.ambiente !== "producao" && origem !== undefined)) {
      resposta.header("access-control-allow-origin", origem);
      resposta.header("access-control-allow-credentials", "true");
      resposta.header("access-control-allow-headers", "content-type, authorization");
      resposta.header("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      await resposta.status(204).send();
    }
  });

  app.get("/saude", async (): Promise<RespostaSaude> => {
    return {
      ambiente: config.ambiente,
      banco: opcoes.repo !== undefined,
      ok: true,
      servico: "codingpro-api",
      uptimeSegundos: Math.floor((Date.now() - INICIO) / 1000),
      versao: "1.0.0",
    };
  });

  app.get("/", async (_req, resposta) => {
    return resposta
      .type("text/plain; charset=utf-8")
      .send(
        [
          "CodingPro — API da plataforma web",
          "",
          "Proxy compatível com OpenAI: POST /v1/chat/completions (Authorization: Bearer cp_...)",
          "Painel administrativo: /admin",
          "Site: " + config.siteUrl,
        ].join("\n"),
      );
  });

  if (opcoes.repo) {
    const ctx: Contexto = {
      config,
      fetch: opcoes.fetch ?? globalThis.fetch,
      repo: opcoes.repo,
    };

    registrarRotasAuth(app, ctx);
    registrarRotasTokens(app, ctx);
    registrarRotasConsumo(app, ctx);
    registrarRotasDevice(app, ctx);
    registrarRotasAdmin(app, ctx, metricas);
    registrarRotasPlayground(app, ctx);
    registrarRotaAgente(app, ctx);
    registrarRotaCli(app, ctx);

    // O proxy vive num escopo próprio para ter rate limit independente do resto:
    // uma rajada de chamadas de IA não pode derrubar o login de ninguém.
    await app.register(async (escopo) => {
      await escopo.register(rateLimit, {
        keyGenerator: (req) => req.headers.authorization ?? req.ip,
        max: 120,
        timeWindow: "1 minute",
      });
      registrarRotasProxy(escopo, ctx);
    });
  }

  if (opcoes.dirAdmin && existsSync(opcoes.dirAdmin)) {
    await app.register(estatico, { prefix: "/admin/", root: opcoes.dirAdmin });
    // Fallback de SPA: qualquer rota sob /admin devolve o index, o React Router resolve.
    app.setNotFoundHandler(async (req, resposta) => {
      if (req.url.startsWith("/admin")) {
        return resposta.type("text/html; charset=utf-8").sendFile("index.html");
      }
      return resposta
        .status(404)
        .send({ erro: "rota_inexistente", mensagem: "Rota não encontrada." });
    });
  } else {
    app.setNotFoundHandler(async (_req, resposta) => {
      return resposta
        .status(404)
        .send({ erro: "rota_inexistente", mensagem: "Rota não encontrada." });
    });
  }

  return app;
}
