/**
 * Paletas de cores dos 4 temas CodingPro (dados puros, sem ANSI).
 * Extraído de `packages/cli/src/tema.ts` — compartilha as mesmas cores.
 */

export interface CorRGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type TemaNome = "aurora" | "solar" | "neon" | "mono";

export interface PaletaCSS {
  /** Cor primária — destaque principal, botões, links. */
  readonly primaria: CorRGB;
  /** Cor de acento — badges, ícones ativos, ferramentas. */
  readonly acento: CorRGB;
  /** Cor do prompt / símbolo de input. */
  readonly prompt: CorRGB;
  readonly sucesso: CorRGB;
  readonly erro: CorRGB;
  readonly aviso: CorRGB;
  /** Texto esmaecido / notas. */
  readonly cinza: CorRGB;
  /** Paradas do gradiente (banner, loader). */
  readonly gradiente: readonly CorRGB[];
}

const TOM = {
  amarelo: { b: 71, g: 191, r: 245 },
  azulNeon: { b: 255, g: 120, r: 96 },
  branco: { b: 245, g: 245, r: 245 },
  cianoNeon: { b: 238, g: 211, r: 34 },
  ciano: { b: 212, g: 182, r: 6 },
  cinza: { b: 148, g: 148, r: 148 },
  cinzaClaro: { b: 180, g: 180, r: 180 },
  cinzaMedio: { b: 120, g: 120, r: 120 },
  esmeralda: { b: 129, g: 185, r: 16 },
  lima: { b: 22, g: 204, r: 132 },
  magenta: { b: 172, g: 60, r: 255 },
  laranja: { b: 22, g: 115, r: 249 },
  rosa: { b: 94, g: 63, r: 244 },
  solAmarelo: { b: 21, g: 204, r: 250 },
  verdeNeon: { b: 160, g: 230, r: 16 },
  vermelho: { b: 92, g: 92, r: 239 },
  violeta: { b: 246, g: 92, r: 139 },
} as const satisfies Record<string, CorRGB>;

export const PALETAS: Readonly<Record<TemaNome, PaletaCSS>> = Object.freeze({
  aurora: {
    acento: TOM.ciano,
    aviso: TOM.amarelo,
    cinza: TOM.cinza,
    erro: TOM.vermelho,
    gradiente: [TOM.esmeralda, TOM.ciano, TOM.violeta],
    primaria: TOM.esmeralda,
    prompt: TOM.violeta,
    sucesso: TOM.esmeralda,
  },
  mono: {
    acento: TOM.cinzaClaro,
    aviso: TOM.amarelo,
    cinza: TOM.cinzaMedio,
    erro: TOM.vermelho,
    gradiente: [TOM.branco, TOM.cinzaClaro, TOM.cinzaMedio],
    primaria: TOM.branco,
    prompt: TOM.branco,
    sucesso: TOM.branco,
  },
  neon: {
    acento: TOM.magenta,
    aviso: TOM.solAmarelo,
    cinza: TOM.cinza,
    erro: TOM.vermelho,
    gradiente: [TOM.magenta, TOM.azulNeon, TOM.cianoNeon],
    primaria: TOM.cianoNeon,
    prompt: TOM.magenta,
    sucesso: TOM.verdeNeon,
  },
  solar: {
    acento: TOM.solAmarelo,
    aviso: TOM.solAmarelo,
    cinza: TOM.cinza,
    erro: TOM.rosa,
    gradiente: [TOM.solAmarelo, TOM.laranja, TOM.rosa],
    primaria: TOM.laranja,
    prompt: TOM.rosa,
    sucesso: TOM.lima,
  },
});

export const TEMAS: readonly TemaNome[] = Object.freeze(["aurora", "solar", "neon", "mono"]);

export const DESCRICAO_TEMA: Readonly<Record<TemaNome, string>> = Object.freeze({
  aurora: "esmeralda → ciano → violeta (padrão)",
  mono: "grafite minimalista, alto contraste",
  neon: "magenta → azul → ciano vibrante",
  solar: "âmbar → laranja → rosa quente",
});

export function nomeTemaValido(valor: unknown): TemaNome {
  if (typeof valor === "string" && TEMAS.includes(valor as TemaNome)) {
    return valor as TemaNome;
  }
  return "aurora";
}

/** Converte CorRGB → string CSS `rgb(r,g,b)`. */
export function corCSS(c: CorRGB): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** Gera gradiente CSS linear a partir das paradas da paleta. */
export function gradienteCSS(p: PaletaCSS, angulo = 135): string {
  const stops = p.gradiente.map((c, i) => {
    const pct = Math.round((i / (p.gradiente.length - 1)) * 100);
    return `${corCSS(c)} ${pct}%`;
  });
  return `linear-gradient(${angulo}deg, ${stops.join(", ")})`;
}
