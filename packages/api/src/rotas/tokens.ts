/**
 * Dispositivos conectados à conta.
 *
 * A criação manual de token saiu do produto: o CodingPro Cloud é o padrão e o token é
 * emitido sozinho pelo device flow (`codingpro login` / login do app). Sobrou o que é
 * genuinamente útil ao usuário — ver as máquinas conectadas e desconectar uma delas.
 */
import type { FastifyInstance } from "fastify";
import { type Contexto, erro, exigirUsuario, ipDe } from "../contexto.js";

function serializar(token: {
  id: number;
  nome: string;
  prefixo: string;
  criado_em: Date;
  ultimo_uso: Date | null;
  revogado_em: Date | null;
}) {
  return {
    criadoEm: token.criado_em,
    id: token.id,
    nome: token.nome,
    prefixo: token.prefixo,
    revogadoEm: token.revogado_em,
    ultimoUso: token.ultimo_uso,
  };
}

export function registrarRotasTokens(app: FastifyInstance, ctx: Contexto): void {
  app.get("/api/tokens", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    const tokens = await ctx.repo.listarTokens(usuario.id);
    return resposta.send({ tokens: tokens.map(serializar) });
  });

  app.delete("/api/tokens/:id", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    const id = Number.parseInt((req.params as { id: string }).id, 10);
    if (!Number.isSafeInteger(id)) {
      return erro(resposta, 400, "id_invalido", "Token inválido.");
    }
    const ok = await ctx.repo.revogarToken(usuario.id, id);
    if (!ok) return erro(resposta, 404, "token_inexistente", "Token não encontrado.");

    await ctx.repo.registrarAuditoria({
      acao: "token_revogado",
      alvo: String(id),
      atorEmail: usuario.email,
      atorId: usuario.id,
      detalhe: null,
      ip: ipDe(req),
    });
    return resposta.send({ ok: true });
  });
}
