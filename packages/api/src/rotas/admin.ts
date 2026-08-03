import { freemem, loadavg, totalmem } from "node:os";
import type { FastifyInstance } from "fastify";
import { type Contexto, erro, exigirAdmin, ipDe, texto } from "../contexto.js";
import { type AtualizacaoUsuario, competenciaAtual, type StatusUsuario } from "../repositorio.js";

const STATUS_VALIDOS = new Set<StatusUsuario>(["pendente", "ativo", "bloqueado"]);

/** Métricas do processo alimentadas pelo hook de request do app. */
export type Metricas = {
  ativas: number;
  latencias: number[];
  erros5xx: number;
  total: number;
};

export function criarMetricas(): Metricas {
  return { ativas: 0, erros5xx: 0, latencias: [], total: 0 };
}

function percentil(valores: readonly number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenado = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length));
  return ordenado[indice] ?? 0;
}

export function registrarRotasAdmin(app: FastifyInstance, ctx: Contexto, metricas: Metricas): void {
  app.get("/api/admin/check", async (req, resposta) => {
    const admin = await exigirAdmin(ctx, req, resposta);
    if (!admin) return resposta;
    return resposta.send({ admin: true, email: admin.email, nome: admin.nome });
  });

  app.get("/api/admin/usuarios", async (req, resposta) => {
    const admin = await exigirAdmin(ctx, req, resposta);
    if (!admin) return resposta;

    const busca = texto((req.query as Record<string, unknown> | undefined)?.busca, 100);
    const usuarios = await ctx.repo.listarUsuarios(busca);
    const competencia = competenciaAtual();

    const comConsumo = await Promise.all(
      usuarios.map(async (u) => {
        const consumo = await ctx.repo.consumoDoMes(u.id, competencia);
        return {
          admin: u.admin,
          creditosMicro: Number(u.creditos_micro),
          criadoEm: u.criado_em,
          custoMicro: consumo.custoMicro,
          email: u.email,
          id: u.id,
          limiteDiarioMicro: u.limite_diario_micro,
          limiteMicro: u.limite_mensal_micro,
          nome: u.nome,
          overrideLimiteAte: u.override_limite_ate,
          overrideLimiteMicro: u.override_limite_micro,
          rateRpm: u.rate_rpm,
          requisicoes: consumo.requisicoes,
          status: u.status,
          ultimoLogin: u.ultimo_login,
        };
      }),
    );

    return resposta.send({ usuarios: comConsumo });
  });

  app.patch("/api/admin/usuarios/:id", async (req, resposta) => {
    const admin = await exigirAdmin(ctx, req, resposta);
    if (!admin) return resposta;

    const id = Number.parseInt((req.params as { id: string }).id, 10);
    if (!Number.isSafeInteger(id)) return erro(resposta, 400, "id_invalido", "Usuário inválido.");

    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const campos: AtualizacaoUsuario = {};

    if (corpo.status !== undefined) {
      const status = texto(corpo.status, 20) as StatusUsuario;
      if (!STATUS_VALIDOS.has(status)) {
        return erro(resposta, 400, "status_invalido", "Status inválido.");
      }
      campos.status = status;
    }
    if (corpo.limiteMicro !== undefined) {
      const limite = Number(corpo.limiteMicro);
      if (!Number.isSafeInteger(limite) || limite < 0) {
        return erro(resposta, 400, "limite_invalido", "Limite inválido.");
      }
      campos.limiteMicro = limite;
    }
    if (corpo.creditosMicro !== undefined) {
      const creditos = Number(corpo.creditosMicro);
      if (!Number.isSafeInteger(creditos) || creditos <= 0) {
        return erro(
          resposta,
          400,
          "creditos_invalidos",
          "Informe um valor positivo de créditos para liberar.",
        );
      }
      campos.creditosMicro = creditos;
    }
    if (corpo.limiteDiarioMicro !== undefined) {
      const limite = Number(corpo.limiteDiarioMicro);
      if (!Number.isSafeInteger(limite) || limite < 0) {
        return erro(resposta, 400, "limite_diario_invalido", "Limite diário inválido.");
      }
      campos.limiteDiarioMicro = limite;
    }
    if (corpo.rateRpm !== undefined) {
      const rate = Number(corpo.rateRpm);
      if (!Number.isSafeInteger(rate) || rate < 0) {
        return erro(resposta, 400, "rate_invalido", "Rate limit inválido.");
      }
      campos.rateRpm = rate;
    }
    if (corpo.admin !== undefined) {
      if (id === admin.id && corpo.admin === false) {
        return erro(
          resposta,
          400,
          "auto_rebaixamento",
          "Você não pode remover seu próprio acesso de administrador.",
        );
      }
      campos.admin = corpo.admin === true;
    }

    const atualizado = await ctx.repo.atualizarUsuario(id, campos);
    if (!atualizado) return erro(resposta, 404, "usuario_inexistente", "Usuário não encontrado.");

    // Bloquear é uma medida de contenção: sem revogar os tokens, a CLI continuaria passando.
    if (campos.status === "bloqueado") await ctx.repo.revogarTodosTokens(id);

    if (campos.creditosMicro !== undefined) {
      await ctx.repo.registrarAuditoria({
        acao: "creditos_liberados",
        alvo: atualizado.email,
        atorEmail: admin.email,
        atorId: admin.id,
        detalhe: {
          saldoMicro: Number(atualizado.creditos_micro),
          valorMicro: campos.creditosMicro,
        },
        ip: ipDe(req),
      });
    }

    const houveOutraAtualizacao = Object.keys(campos).some((campo) => campo !== "creditosMicro");
    if (houveOutraAtualizacao) {
      await ctx.repo.registrarAuditoria({
        acao: "usuario_atualizado",
        alvo: atualizado.email,
        atorEmail: admin.email,
        atorId: admin.id,
        detalhe: campos,
        ip: ipDe(req),
      });
    }

    return resposta.send({ creditosMicro: Number(atualizado.creditos_micro), ok: true });
  });

  app.post("/api/admin/usuarios/:id/revogar-tokens", async (req, resposta) => {
    const admin = await exigirAdmin(ctx, req, resposta);
    if (!admin) return resposta;
    const id = Number.parseInt((req.params as { id: string }).id, 10);
    if (!Number.isSafeInteger(id)) return erro(resposta, 400, "id_invalido", "Usuário inválido.");

    const total = await ctx.repo.revogarTodosTokens(id);
    await ctx.repo.registrarAuditoria({
      acao: "tokens_revogados_admin",
      alvo: String(id),
      atorEmail: admin.email,
      atorId: admin.id,
      detalhe: { total },
      ip: ipDe(req),
    });
    return resposta.send({ ok: true, total });
  });

  app.get("/api/admin/consumo", async (req, resposta) => {
    const admin = await exigirAdmin(ctx, req, resposta);
    if (!admin) return resposta;

    const competencia = competenciaAtual();
    const [diario, top, total] = await Promise.all([
      ctx.repo.consumoDiario(null, 30),
      ctx.repo.topUsuarios(competencia, 5),
      ctx.repo.consumoTotalDoMes(competencia),
    ]);

    return resposta.send({
      competencia,
      diario,
      top,
      totalMicro: total.custoMicro,
      totalRequisicoes: total.requisicoes,
    });
  });

  app.get("/api/admin/saude", async (req, resposta) => {
    const admin = await exigirAdmin(ctx, req, resposta);
    if (!admin) return resposta;

    const killSwitch = (await ctx.repo.lerConfig("kill_switch")) === "on";
    const memoria = process.memoryUsage();

    return resposta.send({
      erros5xx: metricas.erros5xx,
      killSwitch,
      latenciaP50Ms: percentil(metricas.latencias, 50),
      latenciaP95Ms: percentil(metricas.latencias, 95),
      loadAvg1m: loadavg()[0] ?? 0,
      memoriaLivreMb: Math.round(freemem() / 1_048_576),
      memoriaProcessoMb: Math.round(memoria.rss / 1_048_576),
      memoriaTotalMb: Math.round(totalmem() / 1_048_576),
      requisicoesAtivas: metricas.ativas,
      requisicoesTotal: metricas.total,
      uptimeSegundos: Math.floor(process.uptime()),
    });
  });

  app.get("/api/admin/auditoria", async (req, resposta) => {
    const admin = await exigirAdmin(ctx, req, resposta);
    if (!admin) return resposta;

    const query = (req.query ?? {}) as Record<string, unknown>;
    const pagina = Math.max(0, Number.parseInt(texto(query.pagina, 10) || "0", 10) || 0);
    const limite = 50;
    const registros = await ctx.repo.listarAuditoria({
      acao: texto(query.acao, 50),
      limite,
      offset: pagina * limite,
    });
    return resposta.send({ limite, pagina, registros });
  });

  app.post("/api/admin/kill-switch", async (req, resposta) => {
    const admin = await exigirAdmin(ctx, req, resposta);
    if (!admin) return resposta;

    const ligado = (req.body as Record<string, unknown> | undefined)?.ligado === true;
    await ctx.repo.gravarConfig("kill_switch", ligado ? "on" : "off");
    await ctx.repo.registrarAuditoria({
      acao: "kill_switch",
      alvo: ligado ? "on" : "off",
      atorEmail: admin.email,
      atorId: admin.id,
      detalhe: null,
      ip: ipDe(req),
    });
    return resposta.send({ killSwitch: ligado });
  });
}
