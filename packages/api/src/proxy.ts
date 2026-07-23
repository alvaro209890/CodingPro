import {
  DEEPSEEK_MODEL_FLASH,
  DEEPSEEK_MODEL_PRO,
  type DeepSeekModel,
  estimateCost,
} from "@codingpro/llm";

/** Só estes dois modelos passam — a allowlist do produto continua valendo no cloud. */
const MODELOS_PERMITIDOS = new Set<string>([DEEPSEEK_MODEL_PRO, DEEPSEEK_MODEL_FLASH]);

export function modeloPermitido(modelo: unknown): modelo is DeepSeekModel {
  return typeof modelo === "string" && MODELOS_PERMITIDOS.has(modelo);
}

export type UsoBruto = {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly prompt_cache_hit_tokens?: number;
  readonly prompt_tokens_details?: { readonly cached_tokens?: number };
  readonly completion_tokens_details?: { readonly reasoning_tokens?: number };
};

export type UsoNormalizado = {
  readonly tokensEntrada: number;
  readonly tokensSaida: number;
  readonly tokensCache: number;
  readonly tokensRaciocinio: number;
};

function inteiro(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0;
}

/**
 * Normaliza o bloco `usage` do DeepSeek. O cache-hit vem em dois formatos conforme a rota
 * (`prompt_cache_hit_tokens` no legado, `prompt_tokens_details.cached_tokens` no novo);
 * aceitar os dois evita cobrar cache-miss por engano — o que superfaturaria o usuário.
 */
export function normalizarUso(bruto: UsoBruto | null | undefined): UsoNormalizado {
  const entrada = inteiro(bruto?.prompt_tokens);
  const cache = Math.min(
    Math.max(
      inteiro(bruto?.prompt_cache_hit_tokens),
      inteiro(bruto?.prompt_tokens_details?.cached_tokens),
    ),
    entrada,
  );
  return {
    tokensCache: cache,
    tokensEntrada: entrada,
    tokensRaciocinio: inteiro(bruto?.completion_tokens_details?.reasoning_tokens),
    tokensSaida: inteiro(bruto?.completion_tokens),
  };
}

/** Converte tokens em micro-dólares (1e-6 USD), a unidade inteira usada no banco. */
export function custoMicro(uso: UsoNormalizado, modelo: DeepSeekModel): number {
  const breakdown = estimateCost(
    {
      cacheReadInputTokens: uso.tokensCache,
      inputTokens: uso.tokensEntrada,
      outputTokens: uso.tokensSaida,
      reasoningTokens: uso.tokensRaciocinio,
    },
    modelo,
  );
  return Math.round(breakdown.totalCostUsd * 1_000_000);
}

/**
 * Varre um pedaço de SSE atrás do último bloco `usage`.
 * O DeepSeek manda o usage no chunk final (com `stream_options.include_usage`), então
 * basta guardar o mais recente encontrado.
 */
export function extrairUsoDeSse(texto: string): UsoBruto | null {
  let encontrado: UsoBruto | null = null;
  for (const linha of texto.split("\n")) {
    if (!linha.startsWith("data:")) continue;
    const carga = linha.slice(5).trim();
    if (carga === "" || carga === "[DONE]") continue;
    try {
      const objeto = JSON.parse(carga) as { usage?: UsoBruto | null };
      if (objeto.usage) encontrado = objeto.usage;
    } catch {
      // Chunk parcial: o buffer da próxima passada completa a linha.
    }
  }
  return encontrado;
}

/**
 * Acumulador que vê o stream passar sem segurá-lo. Mantém só a cauda do buffer,
 * porque o `usage` está no fim — assim o consumo de memória é constante mesmo em
 * respostas longas.
 */
export class LeitorDeUso {
  #buffer = "";
  #uso: UsoBruto | null = null;

  alimentar(pedaco: string): void {
    this.#buffer += pedaco;
    const uso = extrairUsoDeSse(this.#buffer);
    if (uso) this.#uso = uso;
    // Guarda só a última linha incompleta.
    const corte = this.#buffer.lastIndexOf("\n");
    if (corte >= 0) this.#buffer = this.#buffer.slice(corte + 1);
    if (this.#buffer.length > 64_000) this.#buffer = "";
  }

  get uso(): UsoBruto | null {
    return this.#uso;
  }
}

export type CorpoChat = {
  model?: unknown;
  stream?: unknown;
  messages?: unknown;
  [chave: string]: unknown;
};

export type ValidacaoCorpo =
  | { readonly ok: true; readonly modelo: DeepSeekModel; readonly stream: boolean }
  | { readonly ok: false; readonly mensagem: string };

/** Valida o corpo antes de gastar a chave do servidor. */
export function validarCorpo(corpo: unknown): ValidacaoCorpo {
  if (typeof corpo !== "object" || corpo === null) {
    return { mensagem: "Corpo da requisição inválido.", ok: false };
  }
  const dados = corpo as CorpoChat;
  if (!modeloPermitido(dados.model)) {
    return {
      mensagem: `Modelo não permitido. Use "${DEEPSEEK_MODEL_PRO}" ou "${DEEPSEEK_MODEL_FLASH}".`,
      ok: false,
    };
  }
  if (!Array.isArray(dados.messages) || dados.messages.length === 0) {
    return { mensagem: "A lista de mensagens está vazia.", ok: false };
  }
  return { modelo: dados.model, ok: true, stream: dados.stream === true };
}

/**
 * Prepara o corpo repassado ao DeepSeek. Força `include_usage` — sem isso não há
 * como medir consumo em streaming, e sem medição não há limite.
 */
export function prepararCorpoUpstream(corpo: CorpoChat): Record<string, unknown> {
  const { ...resto } = corpo;
  if (resto.stream === true) {
    const opcoes = (resto.stream_options ?? {}) as Record<string, unknown>;
    resto.stream_options = { ...opcoes, include_usage: true };
  }
  return resto as Record<string, unknown>;
}
