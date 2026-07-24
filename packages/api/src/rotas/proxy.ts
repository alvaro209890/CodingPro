import { Readable } from "node:stream";
import type { DeepSeekModel } from "@codingpro/llm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type Contexto, erro, ipDe } from "../contexto.js";
import { checarAcessoLlm } from "../limites.js";
import {
  custoMicro,
  LeitorDeUso,
  normalizarUso,
  prepararCorpoUpstream,
  validarCorpo,
} from "../proxy.js";
import type { Usuario } from "../repositorio.js";
import { hashToken, PREFIXO_TOKEN } from "../seguranca.js";

/** Avisos de consumo enviados como header, para a CLI mostrar sem pedir nada. */
function cabecalhoAviso(usadoMicro: number, limiteMicro: number): string | null {
  if (limiteMicro <= 0) return null;
  const pct = (usadoMicro / limiteMicro) * 100;
  if (pct >= 95) return `Atenção: você já usou ${pct.toFixed(0)}% do seu limite mensal.`;
  if (pct >= 80) return `Você já usou ${pct.toFixed(0)}% do seu limite mensal.`;
  return null;
}

type Autenticacao =
  | { readonly ok: true; readonly usuario: Usuario; readonly tokenId: number }
  | { readonly ok: false; readonly status: number; readonly codigo: string; readonly msg: string };

async function autenticar(ctx: Contexto, req: FastifyRequest): Promise<Autenticacao> {
  const header = req.headers.authorization ?? "";
  const bruto = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!bruto.startsWith(PREFIXO_TOKEN)) {
    return {
      codigo: "token_ausente",
      msg: 'Envie um token do CodingPro no header Authorization ("Bearer cp_...").',
      ok: false,
      status: 401,
    };
  }

  const encontrado = await ctx.repo.autenticarToken(hashToken(bruto));
  if (!encontrado) {
    return {
      codigo: "token_invalido",
      msg: "Token inválido ou revogado. Rode `codingpro login` de novo.",
      ok: false,
      status: 401,
    };
  }
  const { usuario, tokenId } = encontrado;
  if (usuario.status === "bloqueado") {
    return { codigo: "bloqueado", msg: "Esta conta está bloqueada.", ok: false, status: 403 };
  }
  if (usuario.status !== "ativo") {
    return {
      codigo: "conta_nao_aprovada",
      msg: "Sua conta ainda não foi aprovada pelo administrador.",
      ok: false,
      status: 403,
    };
  }
  return { ok: true, tokenId, usuario };
}

export function registrarRotasProxy(app: FastifyInstance, ctx: Contexto): void {
  const alvo = `${ctx.config.deepseekBaseUrl}/chat/completions`;

  app.post("/v1/chat/completions", async (req, resposta) => {
    const inicio = Date.now();

    const auth = await autenticar(ctx, req);
    if (!auth.ok) return erro(resposta, auth.status, auth.codigo, auth.msg);
    const { usuario, tokenId } = auth;

    const validacao = validarCorpo(req.body);
    if (!validacao.ok) return erro(resposta, 400, "corpo_invalido", validacao.mensagem);
    const modelo: DeepSeekModel = validacao.modelo;

    const acesso = await checarAcessoLlm(ctx, usuario);
    if (!acesso.ok) return erro(resposta, acesso.status, acesso.codigo, acesso.mensagem);
    const { competencia } = acesso;

    void ctx.repo.tocarToken(tokenId);

    const corpoUpstream = prepararCorpoUpstream({ ...(req.body as Record<string, unknown>) });
    let upstream: Response;
    try {
      upstream = await ctx.fetch(alvo, {
        body: JSON.stringify(corpoUpstream),
        headers: {
          authorization: `Bearer ${ctx.config.deepseekApiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        redirect: "error",
      });
    } catch (causa) {
      req.log.error({ causa }, "falha ao falar com o provedor");
      await registrar(ctx, {
        competencia,
        duracaoMs: Date.now() - inicio,
        erro: "upstream_indisponivel",
        modelo,
        tokenId,
        uso: { tokensCache: 0, tokensEntrada: 0, tokensRaciocinio: 0, tokensSaida: 0 },
        usuarioId: usuario.id,
      });
      return erro(
        resposta,
        502,
        "provedor_indisponivel",
        "Não consegui falar com o provedor de IA. Tente de novo em instantes.",
      );
    }

    const aviso = cabecalhoAviso(acesso.custoMicro, acesso.limiteMicro);
    if (aviso) resposta.header("x-codingpro-aviso", encodeURIComponent(aviso));
    resposta.header("x-codingpro-uso-micro", String(acesso.custoMicro));
    resposta.header("x-codingpro-limite-micro", String(acesso.limiteMicro));

    if (!upstream.ok || !upstream.body) {
      const detalhe = await upstream.text().catch(() => "");
      req.log.warn({ status: upstream.status }, "provedor devolveu erro");
      await registrar(ctx, {
        competencia,
        duracaoMs: Date.now() - inicio,
        erro: `upstream_${upstream.status}`,
        modelo,
        tokenId,
        uso: { tokensCache: 0, tokensEntrada: 0, tokensRaciocinio: 0, tokensSaida: 0 },
        usuarioId: usuario.id,
      });
      // O corpo do provedor pode conter detalhes internos; devolvemos só o status.
      return erro(
        resposta,
        upstream.status === 429 ? 429 : 502,
        upstream.status === 429 ? "provedor_ocupado" : "provedor_erro",
        upstream.status === 429
          ? "O provedor de IA está sobrecarregado. Tente de novo em instantes."
          : `O provedor de IA respondeu com erro (${upstream.status}).${
              detalhe.length > 0 && ctx.config.ambiente !== "producao"
                ? ` ${detalhe.slice(0, 300)}`
                : ""
            }`,
      );
    }

    const tipo = upstream.headers.get("content-type") ?? "application/json";
    resposta.header("content-type", tipo);
    if (validacao.stream) resposta.header("cache-control", "no-cache");

    return await repassar(ctx, {
      competencia,
      inicio,
      modelo,
      req,
      resposta,
      tokenId,
      upstream,
      usuarioId: usuario.id,
    });
  });

  app.get("/v1/models", async (_req, resposta) => {
    return resposta.send({
      data: [
        { id: "deepseek-v4-pro", object: "model", owned_by: "codingpro" },
        { id: "deepseek-v4-flash", object: "model", owned_by: "codingpro" },
      ],
      object: "list",
    });
  });
}

/**
 * Repassa o corpo do provedor byte a byte enquanto observa o `usage` de passagem.
 * Nada é bufferizado: o primeiro token chega ao usuário no mesmo instante em que
 * chega aqui — o overhead do proxy é só o custo de copiar o chunk.
 */
async function repassar(
  ctx: Contexto,
  args: {
    competencia: string;
    inicio: number;
    modelo: DeepSeekModel;
    req: FastifyRequest;
    resposta: FastifyReply;
    tokenId: number;
    upstream: Response;
    usuarioId: number;
  },
): Promise<FastifyReply> {
  const leitor = new LeitorDeUso();
  const decodificador = new TextDecoder();
  const fluxo = args.upstream.body as ReadableStream<Uint8Array>;
  // Acumula o texto completo para fallback de JSON (non-streaming).
  const pedacos: string[] = [];

  const geradora = async function* () {
    const reader = fluxo.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const texto = decodificador.decode(value, { stream: true });
          pedacos.push(texto);
          leitor.alimentar(texto);
          yield Buffer.from(value);
        }
      }
    } finally {
      reader.releaseLock();
      // Força o flush do buffer residual do LeitorDeUso (última linha sem \n).
      leitor.alimentar("\n");
      let uso = normalizarUso(leitor.uso);
      // Fallback: se o LeitorDeUso baseado em SSE não achou nada, tenta
      // extrair o usage do corpo JSON direto (non-streaming).
      if (uso.tokensEntrada === 0 && uso.tokensSaida === 0 && uso.tokensRaciocinio === 0) {
        try {
          const json = JSON.parse(pedacos.join("")) as { usage?: Record<string, unknown> };
          if (json.usage) uso = normalizarUso(json.usage);
        } catch {
          /* não é JSON — ignora */
        }
      }
      await registrar(ctx, {
        competencia: args.competencia,
        duracaoMs: Date.now() - args.inicio,
        erro: null,
        modelo: args.modelo,
        tokenId: args.tokenId,
        uso,
        usuarioId: args.usuarioId,
      }).catch((causa: unknown) => {
        args.req.log.error({ causa }, "falha ao gravar consumo");
      });
    }
  };

  await args.resposta.send(Readable.from(geradora()));
  return args.resposta;
}

async function registrar(
  ctx: Contexto,
  args: {
    competencia: string;
    duracaoMs: number;
    erro: string | null;
    modelo: DeepSeekModel;
    tokenId: number;
    uso: {
      tokensEntrada: number;
      tokensSaida: number;
      tokensCache: number;
      tokensRaciocinio: number;
    };
    usuarioId: number;
  },
): Promise<void> {
  await ctx.repo.registrarUso({
    competencia: args.competencia,
    custoMicro: custoMicro(args.uso, args.modelo),
    duracaoMs: args.duracaoMs,
    erro: args.erro,
    modelo: args.modelo,
    tokenId: args.tokenId,
    tokensCache: args.uso.tokensCache,
    tokensEntrada: args.uso.tokensEntrada,
    tokensRaciocinio: args.uso.tokensRaciocinio,
    tokensSaida: args.uso.tokensSaida,
    usuarioId: args.usuarioId,
  });
}

export { ipDe };
