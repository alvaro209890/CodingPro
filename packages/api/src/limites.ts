import type { DeepSeekModel } from "@codingpro/llm";
import type { Contexto } from "./contexto.js";
import { custoMicro, normalizarUso, type UsoBruto } from "./proxy.js";
import { competenciaAtual, type Usuario } from "./repositorio.js";

export type BloqueioLimite =
  | {
      readonly ok: true;
      readonly competencia: string;
      readonly custoMicro: number;
      readonly limiteMicro: number;
      readonly creditosMicro: number;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly codigo: string;
      readonly mensagem: string;
    };

const JANELA_RATE_MS = 60_000;
const chamadasPorUsuario = new Map<number, number[]>();

function checarRateLimit(usuario: Usuario, agora = Date.now()): boolean {
  const limite = usuario.rate_rpm;
  if (limite <= 0) return true;
  const inicioJanela = agora - JANELA_RATE_MS;
  const recentes = (chamadasPorUsuario.get(usuario.id) ?? []).filter((t) => t > inicioJanela);
  if (recentes.length >= limite) {
    chamadasPorUsuario.set(usuario.id, recentes);
    return false;
  }
  recentes.push(agora);
  chamadasPorUsuario.set(usuario.id, recentes);
  return true;
}

/**
 * Pré-checagem compartilhada entre o proxy da CLI e o agente do playground.
 * Sem isto o playground gastava a chave do servidor sem contar no limite do usuário.
 */
export async function checarAcessoLlm(ctx: Contexto, usuario: Usuario): Promise<BloqueioLimite> {
  if ((await ctx.repo.lerConfig("kill_switch")) === "on") {
    return {
      codigo: "manutencao",
      mensagem: "A plataforma está temporariamente em manutenção. Tente de novo em alguns minutos.",
      ok: false,
      status: 503,
    };
  }

  if (ctx.config.deepseekApiKey === "") {
    return {
      codigo: "sem_chave",
      mensagem: "O servidor está sem chave de IA configurada. Avise o administrador.",
      ok: false,
      status: 503,
    };
  }

  if (usuario.creditos_micro <= 0) {
    return {
      codigo: "creditos_esgotados",
      mensagem: "Seus créditos acabaram. Aguarde o administrador liberar mais.",
      ok: false,
      status: 402,
    };
  }

  if (!checarRateLimit(usuario)) {
    return {
      codigo: "rate_limit",
      mensagem: "Você fez muitas chamadas de IA em pouco tempo. Aguarde alguns segundos.",
      ok: false,
      status: 429,
    };
  }

  const competencia = competenciaAtual();
  const consumo = await ctx.repo.consumoDoMes(usuario.id, competencia);
  const overrideAtivo =
    usuario.override_limite_ate !== null && usuario.override_limite_ate.getTime() > Date.now();
  const limiteMensalMicro =
    overrideAtivo && usuario.override_limite_micro !== null
      ? usuario.override_limite_micro
      : consumo.limiteMicro;

  if (limiteMensalMicro > 0 && consumo.custoMicro >= limiteMensalMicro) {
    return {
      codigo: "limite_atingido",
      mensagem:
        `Você atingiu seu limite mensal de US$ ${(limiteMensalMicro / 1e6).toFixed(2)}. ` +
        "Ele é renovado no primeiro dia do mês, ou fale com o administrador para aumentá-lo.",
      ok: false,
      status: 402,
    };
  }

  if (usuario.limite_diario_micro > 0) {
    const dia = await ctx.repo.consumoDoDia(usuario.id);
    if (dia.custoMicro >= usuario.limite_diario_micro) {
      return {
        codigo: "limite_diario_atingido",
        mensagem: `Você atingiu seu limite diário de US$ ${(usuario.limite_diario_micro / 1e6).toFixed(2)}. Ele é renovado amanhã.`,
        ok: false,
        status: 402,
      };
    }
  }

  return {
    competencia,
    creditosMicro: Number(usuario.creditos_micro),
    custoMicro: consumo.custoMicro,
    limiteMicro: limiteMensalMicro,
    ok: true,
  };
}

/** Grava o uso a partir do bloco `usage` da resposta OpenAI-compatible. */
export async function registrarUsoDaResposta(
  ctx: Contexto,
  args: {
    usuarioId: number;
    tokenId: number | null;
    modelo: DeepSeekModel;
    competencia: string;
    duracaoMs: number;
    erro: string | null;
    usage: UsoBruto | null | undefined;
  },
): Promise<void> {
  const uso = normalizarUso(args.usage);
  await ctx.repo.registrarUso({
    competencia: args.competencia,
    custoMicro: custoMicro(uso, args.modelo),
    duracaoMs: args.duracaoMs,
    erro: args.erro,
    modelo: args.modelo,
    tokenId: args.tokenId,
    tokensCache: uso.tokensCache,
    tokensEntrada: uso.tokensEntrada,
    tokensRaciocinio: uso.tokensRaciocinio,
    tokensSaida: uso.tokensSaida,
    usuarioId: args.usuarioId,
  });
}
