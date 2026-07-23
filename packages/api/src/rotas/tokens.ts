import type { FastifyInstance } from "fastify";
import { type Contexto, erro, exigirUsuario, ipDe, texto } from "../contexto.js";
import { gerarTokenCli } from "../seguranca.js";

const MAX_TOKENS_POR_USUARIO = 20;

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

  app.post("/api/tokens", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    if (usuario.status !== "ativo") {
      return erro(
        resposta,
        403,
        "conta_nao_aprovada",
        "Sua conta ainda não foi aprovada. Você receberá um aviso quando for liberada.",
      );
    }

    const ativos = (await ctx.repo.listarTokens(usuario.id)).filter((t) => t.revogado_em === null);
    if (ativos.length >= MAX_TOKENS_POR_USUARIO) {
      return erro(
        resposta,
        400,
        "limite_tokens",
        `Você já tem ${MAX_TOKENS_POR_USUARIO} tokens ativos. Revogue algum antes de criar outro.`,
      );
    }

    const nome = texto((req.body as Record<string, unknown> | undefined)?.nome, 60) || "Meu token";
    const gerado = gerarTokenCli();
    const token = await ctx.repo.criarToken(usuario.id, nome, gerado.prefixo, gerado.hash);

    await ctx.repo.registrarAuditoria({
      acao: "token_criado",
      alvo: nome,
      atorEmail: usuario.email,
      atorId: usuario.id,
      detalhe: { prefixo: gerado.prefixo },
      ip: ipDe(req),
    });

    // `texto` aparece uma única vez: no banco só fica o hash.
    return resposta.status(201).send({ texto: gerado.texto, token: serializar(token) });
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
