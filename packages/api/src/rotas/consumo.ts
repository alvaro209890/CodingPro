import type { FastifyInstance } from "fastify";
import { type Contexto, exigirUsuario } from "../contexto.js";
import { competenciaAtual } from "../repositorio.js";

/** Dias que faltam até o limite mensal virar. */
function diasAteRenovar(agora = new Date()): number {
  const proximo = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  return Math.ceil((proximo.getTime() - agora.getTime()) / 86_400_000);
}

export function registrarRotasConsumo(app: FastifyInstance, ctx: Contexto): void {
  app.get("/api/consumo", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;

    const competencia = competenciaAtual();
    const [mes, diario] = await Promise.all([
      ctx.repo.consumoDoMes(usuario.id, competencia),
      ctx.repo.consumoDiario(usuario.id, 30),
    ]);

    return resposta.send({
      competencia,
      custoMicro: mes.custoMicro,
      diario,
      diasAteRenovar: diasAteRenovar(),
      limiteMicro: mes.limiteMicro,
      percentual: mes.limiteMicro > 0 ? (mes.custoMicro / mes.limiteMicro) * 100 : 0,
      requisicoes: mes.requisicoes,
    });
  });
}
