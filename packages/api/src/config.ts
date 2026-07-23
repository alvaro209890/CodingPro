/** Configuração de runtime da API, lida do ambiente. */
export type ConfigApi = {
  /** Endereço de bind. Sempre 127.0.0.1 em produção — só o tunnel alcança. */
  readonly host: string;
  /** Porta reservada no inventário do P0. */
  readonly porta: number;
  /** Ambiente lógico; controla verbosidade de log e mensagens de erro. */
  readonly ambiente: "desenvolvimento" | "producao";
};

const PORTA_PADRAO = 8700;
const HOST_PADRAO = "127.0.0.1";

function lerPorta(bruto: string | undefined): number {
  if (bruto === undefined || bruto.trim() === "") return PORTA_PADRAO;
  const valor = Number.parseInt(bruto, 10);
  if (!Number.isInteger(valor) || valor < 1 || valor > 65535) {
    throw new Error(`CODINGPRO_API_PORTA inválida: ${bruto}`);
  }
  return valor;
}

/** Monta a config a partir de um mapa de env (injetável para teste). */
export function carregarConfig(env: NodeJS.ProcessEnv = process.env): ConfigApi {
  return {
    host: env.CODINGPRO_API_HOST?.trim() || HOST_PADRAO,
    porta: lerPorta(env.CODINGPRO_API_PORTA),
    ambiente: env.CODINGPRO_AMBIENTE === "producao" ? "producao" : "desenvolvimento",
  };
}
