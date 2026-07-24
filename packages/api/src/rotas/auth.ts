import type { FastifyInstance } from "fastify";
import { COOKIE_SESSAO, type Contexto, erro, exigirUsuario, ipDe, texto } from "../contexto.js";
import { enviarEmail } from "../email.js";
import {
  assinarSessao,
  conferirSenha,
  gerarCodigoVerificacao,
  hashSenha,
  normalizarEmail,
  validarForcaSenha,
  verificarTotp,
} from "../seguranca.js";
import { verificarTurnstile } from "../turnstile.js";

const TRINTA_DIAS_S = 30 * 24 * 60 * 60;

function opcoesCookie(producao: boolean) {
  return {
    httpOnly: true,
    maxAge: TRINTA_DIAS_S,
    path: "/",
    sameSite: "lax" as const,
    secure: producao,
  };
}

/** Dados do usuário devolvidos ao front. Nunca inclui hash nem código de verificação. */
function publico(usuario: {
  id: number;
  email: string;
  nome: string;
  status: string;
  admin: boolean;
  email_verificado: boolean;
  limite_mensal_micro: number;
  totp_ativado: boolean;
  limite_diario_micro: number;
  rate_rpm: number;
}) {
  return {
    admin: usuario.admin,
    email: usuario.email,
    emailVerificado: usuario.email_verificado,
    id: usuario.id,
    limiteMicro: usuario.limite_mensal_micro,
    limiteDiarioMicro: usuario.limite_diario_micro,
    nome: usuario.nome,
    rateRpm: usuario.rate_rpm,
    status: usuario.status,
    totpAtivado: usuario.totp_ativado,
  };
}

export function registrarRotasAuth(app: FastifyInstance, ctx: Contexto): void {
  const producao = ctx.config.ambiente === "producao";

  app.post("/api/cadastro", async (req, resposta) => {
    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const email = normalizarEmail(texto(corpo.email, 254));
    const nome = texto(corpo.nome, 120);
    const senha = typeof corpo.senha === "string" ? corpo.senha : "";

    if (!email) return erro(resposta, 400, "email_invalido", "Informe um e-mail válido.");
    if (nome.length < 2) return erro(resposta, 400, "nome_invalido", "Informe seu nome.");
    if (corpo.termosAceitos !== true) {
      return erro(resposta, 400, "termos_obrigatorios", "Aceite os termos para criar a conta.");
    }
    const problemaSenha = validarForcaSenha(senha);
    if (problemaSenha) return erro(resposta, 400, "senha_fraca", problemaSenha);

    if (ctx.config.turnstileSecret !== "") {
      const token = texto(corpo.turnstileToken, 2048);
      const captchaOk = await verificarTurnstile(
        token,
        ctx.config.turnstileSecret,
        ipDe(req),
        ctx.fetch,
      );
      if (!captchaOk) {
        return erro(resposta, 400, "turnstile_invalido", "Não foi possível validar o captcha.");
      }
    }

    if (await ctx.repo.buscarPorEmail(email)) {
      return erro(resposta, 409, "email_em_uso", "Já existe uma conta com este e-mail.");
    }

    // O primeiro usuário do sistema — ou o e-mail configurado como admin — entra já
    // ativo e com poderes, senão não haveria como aprovar ninguém.
    const primeiro = (await ctx.repo.contarUsuarios()) === 0;
    const admin = primeiro || (ctx.config.emailAdmin !== "" && email === ctx.config.emailAdmin);
    const codigo = gerarCodigoVerificacao();

    const usuario = await ctx.repo.criarUsuario({
      admin,
      codigoVerificacao: codigo,
      email,
      limiteMicro: ctx.config.limitePadraoMicro,
      nome,
      senhaHash: await hashSenha(senha),
    });

    await ctx.repo.registrarAuditoria({
      acao: "cadastro",
      alvo: email,
      atorEmail: email,
      atorId: usuario.id,
      detalhe: { admin },
      ip: ipDe(req),
    });

    await enviarEmail(
      {
        assunto: "Confirme seu e-mail no CodingPro",
        para: email,
        texto:
          `Olá, ${usuario.nome}.\n\n` +
          `Seu código de verificação do CodingPro é: ${codigo}\n\n` +
          `Acesse ${ctx.config.siteUrl} para concluir a ativação da conta.`,
      },
      ctx.config,
    );

    resposta.setCookie(COOKIE_SESSAO, assinarSessao(usuario.id, ctx.config.sessionSecret), {
      ...opcoesCookie(producao),
    });

    // Sem SMTP configurado o código não tem como ser enviado; ele fica visível para o
    // admin no painel (aba Usuários), que é quem aprova a conta de qualquer forma.
    return resposta.status(201).send({
      codigoVerificacao: producao ? undefined : codigo,
      usuario: publico(usuario),
    });
  });

  app.post("/api/login", async (req, resposta) => {
    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const email = normalizarEmail(texto(corpo.email, 254));
    const senha = typeof corpo.senha === "string" ? corpo.senha : "";
    const generico = "E-mail ou senha incorretos.";

    if (!email) return erro(resposta, 401, "credenciais_invalidas", generico);
    const usuario = await ctx.repo.buscarPorEmail(email);
    // Sem usuário, ainda assim gastamos o tempo do scrypt: senão o tempo de resposta
    // revelaria quais e-mails existem.
    const hash = usuario?.senha_hash ?? (await hashSenha("senha-inexistente-para-igualar-tempo"));
    const senhaOk = await conferirSenha(senha, hash);
    if (!usuario || !senhaOk) return erro(resposta, 401, "credenciais_invalidas", generico);
    if (usuario.status === "bloqueado") {
      return erro(resposta, 403, "bloqueado", "Esta conta está bloqueada.");
    }
    if (usuario.totp_ativado) {
      const totp = texto(corpo.totp, 20);
      if (totp === "") {
        return erro(resposta, 401, "totp_obrigatorio", "Informe o código 2FA para continuar.");
      }
      if (!usuario.totp_secret || !verificarTotp(usuario.totp_secret, totp)) {
        return erro(resposta, 401, "totp_invalido", "Código 2FA inválido.");
      }
    }

    await ctx.repo.registrarLogin(usuario.id);
    resposta.setCookie(COOKIE_SESSAO, assinarSessao(usuario.id, ctx.config.sessionSecret), {
      ...opcoesCookie(producao),
    });
    return resposta.send({ usuario: publico(usuario) });
  });

  app.post("/api/logout", async (_req, resposta) => {
    resposta.clearCookie(COOKIE_SESSAO, { path: "/" });
    return resposta.send({ ok: true });
  });

  app.get("/api/eu", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    return resposta.send({ usuario: publico(usuario) });
  });

  app.post("/api/verificar-email", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    const codigo = texto((req.body as Record<string, unknown> | undefined)?.codigo, 10);
    if (usuario.email_verificado) return resposta.send({ ok: true });
    if (codigo === "" || codigo !== usuario.codigo_verificacao) {
      return erro(resposta, 400, "codigo_invalido", "Código de verificação incorreto.");
    }
    await ctx.repo.marcarEmailVerificado(usuario.id);
    return resposta.send({ ok: true });
  });

  app.post("/api/senha", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const atual = typeof corpo.atual === "string" ? corpo.atual : "";
    const nova = typeof corpo.nova === "string" ? corpo.nova : "";

    if (!(await conferirSenha(atual, usuario.senha_hash))) {
      return erro(resposta, 400, "senha_incorreta", "A senha atual está incorreta.");
    }
    const problema = validarForcaSenha(nova);
    if (problema) return erro(resposta, 400, "senha_fraca", problema);

    await ctx.repo.trocarSenha(usuario.id, await hashSenha(nova));
    // Trocar senha invalida os tokens de CLI: se a senha vazou, os tokens também podem ter.
    const revogados = await ctx.repo.revogarTodosTokens(usuario.id);
    await ctx.repo.registrarAuditoria({
      acao: "troca_senha",
      alvo: usuario.email,
      atorEmail: usuario.email,
      atorId: usuario.id,
      detalhe: { tokensRevogados: revogados },
      ip: ipDe(req),
    });
    return resposta.send({ ok: true, tokensRevogados: revogados });
  });
}

export { publico as usuarioPublico };
