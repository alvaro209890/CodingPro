import type { FastifyInstance } from "fastify";
import { type Contexto, erro, exigirUsuario, ipDe, texto } from "../contexto.js";
import { gerarCodigoUsuario, gerarSegredoAleatorio, gerarTokenCli } from "../seguranca.js";

/** Janela do device flow: curta o bastante para o código não ficar rondando por aí. */
const VALIDADE_MS = 10 * 60 * 1000;

/**
 * Device flow do `codingpro login`:
 *
 * 1. CLI chama `/api/device/iniciar` → recebe `codigoUsuario` (curto) e `codigoDispositivo` (secreto)
 * 2. usuário abre o site, faz login e digita o código curto → `/api/device/aprovar`
 * 3. CLI vai perguntando em `/api/device/token` até receber o token `cp_`
 *
 * O token só existe depois do passo 2, e é entregue uma única vez no passo 3.
 */
export function registrarRotasDevice(app: FastifyInstance, ctx: Contexto): void {
  app.post("/api/device/iniciar", async (_req, resposta) => {
    await ctx.repo.limparCodigosExpirados();
    const codigoDispositivo = gerarSegredoAleatorio();
    const codigoUsuario = gerarCodigoUsuario();
    const expiraEm = new Date(Date.now() + VALIDADE_MS);

    await ctx.repo.criarCodigoDispositivo({ codigoDispositivo, codigoUsuario, expiraEm });

    return resposta.status(201).send({
      codigoDispositivo,
      codigoUsuario,
      expiraEm,
      intervaloSegundos: 3,
      urlVerificacao: `${ctx.config.siteUrl}/entrar-dispositivo`,
    });
  });

  app.post("/api/device/token", async (req, resposta) => {
    const codigo = texto((req.body as Record<string, unknown> | undefined)?.codigoDispositivo, 100);
    if (codigo === "")
      return erro(resposta, 400, "codigo_ausente", "Código do dispositivo ausente.");

    const resultado = await ctx.repo.resgatarCodigoDispositivo(codigo);
    if (resultado === "expirado") {
      return erro(
        resposta,
        410,
        "codigo_expirado",
        "O código expirou. Rode `codingpro login` de novo.",
      );
    }
    if (resultado === null) return resposta.status(202).send({ pendente: true });
    return resposta.send({ token: resultado });
  });

  app.post("/api/device/aprovar", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    if (usuario.status !== "ativo") {
      return erro(
        resposta,
        403,
        "conta_nao_aprovada",
        "Sua conta ainda não foi aprovada pelo administrador.",
      );
    }

    const codigoUsuario = texto(
      (req.body as Record<string, unknown> | undefined)?.codigoUsuario,
      20,
    ).toUpperCase();
    const registro = await ctx.repo.buscarCodigoPorUsuario(codigoUsuario);
    if (!registro || registro.expira_em.getTime() <= Date.now()) {
      return erro(resposta, 404, "codigo_invalido", "Código inválido ou expirado.");
    }

    const gerado = gerarTokenCli();
    await ctx.repo.criarToken(usuario.id, `CLI (${codigoUsuario})`, gerado.prefixo, gerado.hash);
    const ok = await ctx.repo.aprovarCodigoDispositivo(codigoUsuario, usuario.id, gerado.texto);
    if (!ok) return erro(resposta, 409, "codigo_ja_usado", "Este código já foi usado.");

    await ctx.repo.registrarAuditoria({
      acao: "device_aprovado",
      alvo: codigoUsuario,
      atorEmail: usuario.email,
      atorId: usuario.id,
      detalhe: { prefixo: gerado.prefixo },
      ip: ipDe(req),
    });

    return resposta.send({ ok: true });
  });
}
