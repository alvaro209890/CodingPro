import type { FastifyReply, FastifyRequest } from "fastify";
import type { ConfigApi } from "./config.js";
import type { Repositorio, Usuario } from "./repositorio.js";
import { lerSessao } from "./seguranca.js";

export const COOKIE_SESSAO = "cp_sessao";

export type Contexto = {
  readonly config: ConfigApi;
  readonly repo: Repositorio;
  /** Injetável para teste: o proxy usa isto para falar com o DeepSeek. */
  readonly fetch: typeof globalThis.fetch;
};

/** Resposta de erro padronizada em pt-BR. Todo erro da API sai neste formato. */
export function erro(
  resposta: FastifyReply,
  status: number,
  codigo: string,
  mensagem: string,
): FastifyReply {
  return resposta.status(status).send({ erro: codigo, mensagem });
}

/** Lê o usuário da sessão. `null` = não autenticado. */
export async function usuarioDaSessao(ctx: Contexto, req: FastifyRequest): Promise<Usuario | null> {
  const cookie = req.cookies[COOKIE_SESSAO];
  if (!cookie) return null;
  const sessao = lerSessao(cookie, ctx.config.sessionSecret);
  if (!sessao) return null;
  return await ctx.repo.buscarPorId(sessao.usuarioId);
}

/** Guard de área logada: devolve o usuário ou responde 401 e devolve `null`. */
export async function exigirUsuario(
  ctx: Contexto,
  req: FastifyRequest,
  resposta: FastifyReply,
): Promise<Usuario | null> {
  const usuario = await usuarioDaSessao(ctx, req);
  if (!usuario) {
    await erro(resposta, 401, "nao_autenticado", "Faça login para continuar.");
    return null;
  }
  if (usuario.status === "bloqueado") {
    await erro(resposta, 403, "bloqueado", "Esta conta está bloqueada.");
    return null;
  }
  return usuario;
}

/** Guard do painel admin. */
export async function exigirAdmin(
  ctx: Contexto,
  req: FastifyRequest,
  resposta: FastifyReply,
): Promise<Usuario | null> {
  const usuario = await exigirUsuario(ctx, req, resposta);
  if (!usuario) return null;
  if (!usuario.admin) {
    await erro(resposta, 403, "sem_permissao", "Esta área é restrita ao administrador.");
    return null;
  }
  if (ctx.config.ambiente === "producao" && !usuario.totp_ativado) {
    await erro(
      resposta,
      403,
      "admin_2fa_obrigatorio",
      "Ative a autenticação em dois fatores antes de acessar o painel admin.",
    );
    return null;
  }
  return usuario;
}

export function ipDe(req: FastifyRequest): string {
  return req.ip;
}

export function texto(valor: unknown, max = 200): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}
