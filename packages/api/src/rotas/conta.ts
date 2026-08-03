import type { FastifyInstance } from "fastify";
import { COOKIE_SESSAO, type Contexto, erro, exigirUsuario, ipDe } from "../contexto.js";
import { conferirSenha } from "../seguranca.js";

export function registrarRotasConta(app: FastifyInstance, ctx: Contexto): void {
  app.get("/api/conta/exportar", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;

    const [tokens, eventosRecentes, consumoMes] = await Promise.all([
      ctx.repo.listarTokens(usuario.id),
      ctx.repo.listarEventosUso(usuario.id, 500),
      ctx.repo.consumoDoMes(usuario.id, new Date().toISOString().slice(0, 7)),
    ]);

    return resposta.send({
      exportadoEm: new Date().toISOString(),
      usuario: {
        admin: usuario.admin,
        creditosMicro: Number(usuario.creditos_micro),
        criadoEm: usuario.criado_em,
        email: usuario.email,
        id: usuario.id,
        limiteDiarioMicro: usuario.limite_diario_micro,
        limiteMicro: usuario.limite_mensal_micro,
        nome: usuario.nome,
        rateRpm: usuario.rate_rpm,
        status: usuario.status,
        ultimoLogin: usuario.ultimo_login,
      },
      consumoMes,
      eventosRecentes,
      tokens: tokens.map((token) => ({
        criadoEm: token.criado_em,
        id: token.id,
        nome: token.nome,
        prefixo: token.prefixo,
        revogadoEm: token.revogado_em,
        ultimoUso: token.ultimo_uso,
      })),
    });
  });

  app.delete("/api/conta", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;

    const senha =
      typeof (req.body as Record<string, unknown> | undefined)?.senha === "string"
        ? ((req.body as Record<string, unknown>).senha as string)
        : "";
    if (!(await conferirSenha(senha, usuario.senha_hash))) {
      return erro(resposta, 400, "senha_incorreta", "A senha atual está incorreta.");
    }

    await ctx.repo.registrarAuditoria({
      acao: "conta_excluida",
      alvo: usuario.email,
      atorEmail: usuario.email,
      atorId: usuario.id,
      detalhe: null,
      ip: ipDe(req),
    });
    await ctx.repo.apagarUsuario(usuario.id);
    resposta.clearCookie(COOKIE_SESSAO, { path: "/" });
    return resposta.send({ ok: true });
  });
}
