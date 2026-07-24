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
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly codigo: string;
      readonly mensagem: string;
    };

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

  const competencia = competenciaAtual();
  const consumo = await ctx.repo.consumoDoMes(usuario.id, competencia);
  if (consumo.limiteMicro > 0 && consumo.custoMicro >= consumo.limiteMicro) {
    return {
      codigo: "limite_atingido",
      mensagem:
        `Você atingiu seu limite mensal de US$ ${(consumo.limiteMicro / 1e6).toFixed(2)}. ` +
        "Ele é renovado no primeiro dia do mês, ou fale com o administrador para aumentá-lo.",
      ok: false,
      status: 402,
    };
  }

  return {
    competencia,
    custoMicro: consumo.custoMicro,
    limiteMicro: consumo.limiteMicro,
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
