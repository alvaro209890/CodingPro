/**
 * Cliente da API. Em produção o site e a API são domínios irmãos
 * (`codingpro.cursar.space` / `codingpro-api.cursar.space`), então toda chamada
 * precisa de `credentials: "include"` para o cookie de sessão viajar junto.
 */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "https://codingpro-api.cursar.space";

/** Timeout padrão: evita tela morta em rede lenta (plano W1). */
export const API_TIMEOUT_MS = 15_000;

export class ErroApi extends Error {
  constructor(
    override readonly message: string,
    readonly codigo: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErroApi";
  }
}

function mensagemPorStatus(status: number, corpo: Record<string, unknown>): string {
  if (typeof corpo.mensagem === "string" && corpo.mensagem.length > 0) return corpo.mensagem;
  if (status === 401) return "Sessão expirada. Entre novamente.";
  if (status === 403) return "Você não tem permissão para esta ação.";
  if (status === 404) return "Recurso não encontrado.";
  if (status === 408 || status === 504) return "O servidor demorou demais para responder.";
  if (status === 429) return "Muitas requisições. Aguarde um instante e tente de novo.";
  if (status >= 500) return "O servidor falhou. Tente novamente em instantes.";
  return `Erro ${status}.`;
}

function ehFalhaDeRede(causa: unknown): boolean {
  if (causa instanceof ErroApi) return causa.codigo === "rede" || causa.codigo === "timeout";
  if (causa instanceof DOMException && causa.name === "TimeoutError") return true;
  if (causa instanceof Error && /abort|timeout|network|failed to fetch/i.test(causa.message)) {
    return true;
  }
  return false;
}

function combinarSinais(...sinais: (AbortSignal | null | undefined)[]): AbortSignal | undefined {
  const validos = sinais.filter((s): s is AbortSignal => s != null);
  if (validos.length === 0) return undefined;
  if (validos.length === 1) return validos[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(validos);
  return validos[0];
}

async function pedirUmaVez<T>(caminho: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  const signal = combinarSinais(timeout, init?.signal);
  const { signal: _ignorado, ...resto } = init ?? {};
  let resposta: Response;
  try {
    // URLs relativas → passam pelo proxy HTTP → mesmo domínio → cookie viaja sempre
    resposta = await fetch(caminho, {
      credentials: "include",
      headers: { "content-type": "application/json" },
      ...resto,
      ...(signal ? { signal } : {}),
    });
  } catch (causa) {
    if (
      (causa instanceof DOMException && causa.name === "TimeoutError") ||
      (causa instanceof Error && /abort|timeout/i.test(causa.message))
    ) {
      throw new ErroApi(
        "A requisição demorou mais de 15 segundos. Verifique a conexão e tente de novo.",
        "timeout",
        0,
      );
    }
    throw new ErroApi("Não consegui falar com o servidor. Verifique sua conexão.", "rede", 0);
  }

  if (resposta.status === 204) return undefined as T;

  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await resposta.json()) as Record<string, unknown>;
  } catch {
    // Resposta sem JSON: cai na mensagem genérica abaixo.
  }

  if (!resposta.ok) {
    throw new ErroApi(
      mensagemPorStatus(resposta.status, corpo),
      typeof corpo.erro === "string" ? corpo.erro : "desconhecido",
      resposta.status,
    );
  }
  return corpo as T;
}

/** Timeout 15 s + 1 retry só em falha de rede/timeout (não em 4xx/5xx). */
async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  try {
    return await pedirUmaVez(caminho, init);
  } catch (primeira) {
    if (!ehFalhaDeRede(primeira)) throw primeira;
    return await pedirUmaVez(caminho, init);
  }
}

export const api = {
  del: <T>(caminho: string, corpo?: unknown) =>
    pedir<T>(caminho, {
      method: "DELETE",
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    }),
  get: <T>(caminho: string) => pedir<T>(caminho),
  patch: <T>(caminho: string, corpo: unknown) =>
    pedir<T>(caminho, { body: JSON.stringify(corpo), method: "PATCH" }),
  post: <T>(caminho: string, corpo?: unknown) =>
    pedir<T>(caminho, {
      method: "POST",
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    }),
};

export type Usuario = {
  readonly id: number;
  readonly email: string;
  readonly nome: string;
  readonly status: "pendente" | "ativo" | "bloqueado";
  readonly admin: boolean;
  readonly creditosMicro: number;
  readonly limiteDiarioMicro?: number;
  readonly limiteMicro: number;
  readonly rateRpm?: number;
};

/** Micro-dólares → texto em dólar. A API guarda inteiros para não acumular erro de float. */
export function formatarUsd(micro: number): string {
  return `US$ ${(micro / 1_000_000).toFixed(2)}`;
}

/** Mesma unidade, com mais casas quando o valor é &lt; US$ 0,01 (custo/req). */
export function formatarUsdFino(micro: number): string {
  const usd = micro / 1_000_000;
  if (usd > 0 && usd < 0.01) return `US$ ${usd.toFixed(4)}`;
  return formatarUsd(micro);
}

export function formatarData(valor: string | null | undefined): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
