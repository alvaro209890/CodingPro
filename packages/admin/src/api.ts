/**
 * Cliente da API do painel. A SPA é servida pela própria API (em `/admin`),
 * então as chamadas são relativas — mesma origem, cookie de sessão viaja sozinho.
 */
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
    resposta = await fetch(caminho, {
      credentials: "include",
      headers: { "content-type": "application/json" },
      ...init,
    });
  } catch {
    throw new ErroApi("Sem resposta do servidor.", "rede", 0);
  }

  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await resposta.json()) as Record<string, unknown>;
  } catch {
    // Sem JSON: usa a mensagem genérica.
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
  get: <T>(caminho: string) => pedir<T>(caminho),
  patch: <T>(caminho: string, corpo: unknown) =>
    pedir<T>(caminho, { body: JSON.stringify(corpo), method: "PATCH" }),
  post: <T>(caminho: string, corpo?: unknown) =>
    pedir<T>(caminho, {
      method: "POST",
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    }),
};

export type UsuarioAdmin = {
  id: number;
  email: string;
  nome: string;
  status: "pendente" | "ativo" | "bloqueado";
  admin: boolean;
  creditosMicro: number;
  limiteDiarioMicro?: number;
  limiteMicro: number;
  rateRpm?: number;
  custoMicro: number;
  requisicoes: number;
  criadoEm: string;
  ultimoLogin: string | null;
};

export type Saude = {
  requisicoesAtivas: number;
  requisicoesTotal: number;
  latenciaP50Ms: number;
  latenciaP95Ms: number;
  erros5xx: number;
  memoriaProcessoMb: number;
  memoriaLivreMb: number;
  memoriaTotalMb: number;
  loadAvg1m: number;
  uptimeSegundos: number;
  killSwitch: boolean;
};

export type Consumo = {
  competencia: string;
  totalMicro: number;
  totalRequisicoes: number;
  diario: { dia: string; custoMicro: number; requisicoes: number }[];
  top: { email: string; custoMicro: number; requisicoes: number }[];
};

export type RegistroAuditoria = {
  id: number;
  atorEmail: string | null;
  ator_email?: string | null;
  acao: string;
  alvo: string | null;
  detalhe: unknown;
  ip: string | null;
  criado_em: string;
};

export function formatarUsd(micro: number): string {
  return `US$ ${(micro / 1_000_000).toFixed(2)}`;
}

export function formatarData(valor: string | null | undefined): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Presets de limite mensal usados no modal de edição, em micro-dólares. */
export const PRESETS_LIMITE: readonly { rotulo: string; micro: number }[] = [
  { micro: 500_000, rotulo: "US$ 0,50 — teste" },
  { micro: 2_000_000, rotulo: "US$ 2,00 — padrão" },
  { micro: 5_000_000, rotulo: "US$ 5,00 — uso intenso" },
  { micro: 20_000_000, rotulo: "US$ 20,00 — sem freio" },
  { micro: 0, rotulo: "Sem limite" },
];
