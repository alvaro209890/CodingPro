/**
 * Cliente da API. Em produção o site e a API são domínios irmãos
 * (`codingpro.cursar.space` / `codingpro-api.cursar.space`), então toda chamada
 * precisa de `credentials: "include"` para o cookie de sessão viajar junto.
 */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "https://codingpro-api.cursar.space";

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

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    // URLs relativas → passam pelo proxy HTTP → mesmo domínio → cookie viaja sempre
    resposta = await fetch(caminho, {
      credentials: "include",
      headers: { "content-type": "application/json" },
      ...init,
    });
  } catch {
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
      typeof corpo.mensagem === "string" ? corpo.mensagem : `Erro ${resposta.status}.`,
      typeof corpo.erro === "string" ? corpo.erro : "desconhecido",
      resposta.status,
    );
  }
  return corpo as T;
}

export const api = {
  del: <T>(caminho: string) => pedir<T>(caminho, { method: "DELETE" }),
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
  readonly emailVerificado: boolean;
  readonly limiteMicro: number;
};

/** Micro-dólares → texto em dólar. A API guarda inteiros para não acumular erro de float. */
export function formatarUsd(micro: number): string {
  return `US$ ${(micro / 1_000_000).toFixed(2)}`;
}

export function formatarData(valor: string | null | undefined): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
