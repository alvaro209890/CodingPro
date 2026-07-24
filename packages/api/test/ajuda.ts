import type { FastifyInstance } from "fastify";
import { criarApp } from "../src/app.js";
import { type ConfigApi, carregarConfig } from "../src/config.js";
import { conectar, migrar, type Sql } from "../src/db/index.js";
import { criarRepositorio } from "../src/repositorio.js";

/**
 * URL do banco de testes. Sem ela os testes de integração são pulados —
 * assim a suíte continua rodando em CI sem Postgres.
 */
export const URL_TESTE = process.env.DATABASE_URL_TESTE ?? "";
export const TEM_BANCO = URL_TESTE !== "";

export function configTeste(extra: Record<string, string> = {}): ConfigApi {
  return carregarConfig({
    CODINGPRO_AMBIENTE: "desenvolvimento",
    CODINGPRO_SITE_URL: "https://site.teste",
    SESSION_SECRET: "segredo-de-teste-com-mais-de-32-caracteres!!",
    ...extra,
  } as NodeJS.ProcessEnv);
}

export type Ambiente = {
  readonly app: FastifyInstance;
  readonly sql: Sql;
  readonly repo: ReturnType<typeof criarRepositorio>;
  readonly fechar: () => Promise<void>;
};

/** Sobe app + banco limpo. Cada suíte começa do zero para não depender de ordem. */
export async function montar(
  opcoes: { fetch?: typeof globalThis.fetch; config?: Record<string, string> } = {},
): Promise<Ambiente> {
  // Um schema por worker do Vitest: os arquivos de teste rodam em paralelo e,
  // compartilhando `public`, um recriaria o schema debaixo do outro no meio da corrida.
  const schema = `teste_w${process.env.VITEST_WORKER_ID ?? "1"}`;
  const sql = conectar(URL_TESTE, 4, schema);
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`);
  await migrar(sql);

  const repo = criarRepositorio(sql);
  const app = await criarApp({
    config: configTeste(opcoes.config),
    repo,
    ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}),
  });

  return {
    app,
    fechar: async () => {
      await app.close();
      await sql.end({ timeout: 5 });
    },
    repo,
    sql,
  };
}

/** Cadastra alguém e devolve o cookie de sessão já pronto. */
export async function cadastrar(
  app: FastifyInstance,
  email: string,
  senha = "senhaSegura123",
  nome = "Fulano",
): Promise<{ cookie: string; id: number; codigoVerificacao: string }> {
  const resposta = await app.inject({
    method: "POST",
    payload: { email, nome, senha, termosAceitos: true },
    url: "/api/cadastro",
  });
  const corpo = resposta.json();
  const bruto = resposta.headers["set-cookie"];
  const cookie = (Array.isArray(bruto) ? (bruto[0] ?? "") : (bruto ?? "")).split(";")[0] ?? "";
  return { codigoVerificacao: corpo.codigoVerificacao, cookie, id: corpo.usuario.id };
}

/** Resposta SSE falsa do provedor, com o bloco de usage no chunk final. */
export function respostaSseFalsa(uso: {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_cache_hit_tokens?: number;
}): Response {
  const corpo =
    'data: {"choices":[{"delta":{"content":"olá"},"index":0}]}\n\n' +
    `data: {"choices":[],"usage":${JSON.stringify(uso)}}\n\n` +
    "data: [DONE]\n\n";
  return new Response(corpo, {
    headers: { "content-type": "text/event-stream" },
    status: 200,
  });
}
