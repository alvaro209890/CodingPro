/**
 * Tema visual "Aurora" da CLI: cor e composição da interface de chat (banner, prompt, bolhas de
 * progresso, status). Puro e sem dependências — usa ANSI direto com detecção de capacidade do
 * terminal (truecolor → 256 → 16 → nenhuma) e respeito a `NO_COLOR`. Degradação graciosa: em pipe
 * ou terminal sem cor, tudo vira texto limpo.
 */

export type NivelCor = "16" | "256" | "nenhuma" | "truecolor";

/** Cor RGB da paleta Aurora (esmeralda → ciano → violeta) + tons auxiliares. */
interface CorRGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** Código ANSI-16 de fallback (90–97, brilhantes). */
  readonly ansi16: number;
  /** Índice ANSI-256 de fallback. */
  readonly ansi256: number;
}

const AURORA = {
  amarelo: { ansi16: 93, ansi256: 221, b: 71, g: 191, r: 245 },
  branco: { ansi16: 97, ansi256: 255, b: 245, g: 245, r: 245 },
  ciano: { ansi16: 96, ansi256: 45, b: 212, g: 182, r: 6 },
  cinza: { ansi16: 90, ansi256: 245, b: 148, g: 148, r: 148 },
  esmeralda: { ansi16: 92, ansi256: 43, b: 129, g: 185, r: 16 },
  vermelho: { ansi16: 91, ansi256: 203, b: 92, g: 92, r: 239 },
  violeta: { ansi16: 95, ansi256: 141, b: 246, g: 92, r: 139 },
} as const satisfies Record<string, CorRGB>;

/** Gradiente do banner (esmeralda → ciano → violeta). */
const GRADIENTE: readonly CorRGB[] = [AURORA.esmeralda, AURORA.ciano, AURORA.violeta];

const ESC = "";
const RESET = `${ESC}[0m`;

/**
 * Detecta o nível de cor. Ordem: `NO_COLOR` desliga; `FORCE_COLOR` liga; sem TTY → nenhuma;
 * `COLORTERM=truecolor/24bit` → truecolor; `TERM` com `256` → 256; senão 16.
 */
export function detectarNivelCor(
  env: Record<string, string | undefined>,
  isTTY: boolean,
): NivelCor {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
    return "nenhuma";
  }
  const forcado = env.FORCE_COLOR;
  if (forcado === "0") {
    return "nenhuma";
  }
  if (!isTTY && forcado === undefined) {
    return "nenhuma";
  }
  const colorterm = (env.COLORTERM ?? "").toLowerCase();
  if (colorterm.includes("truecolor") || colorterm.includes("24bit") || forcado === "3") {
    return "truecolor";
  }
  const term = (env.TERM ?? "").toLowerCase();
  if (term.includes("256") || forcado === "2") {
    return "256";
  }
  return "16";
}

function codigoFg(cor: CorRGB, nivel: NivelCor): string {
  switch (nivel) {
    case "truecolor":
      return `${ESC}[38;2;${cor.r};${cor.g};${cor.b}m`;
    case "256":
      return `${ESC}[38;5;${cor.ansi256}m`;
    case "16":
      return `${ESC}[${cor.ansi16}m`;
    default:
      return "";
  }
}

function pintar(texto: string, cor: CorRGB, nivel: NivelCor): string {
  return nivel === "nenhuma" ? texto : `${codigoFg(cor, nivel)}${texto}${RESET}`;
}

function negrito(texto: string, nivel: NivelCor): string {
  return nivel === "nenhuma" ? texto : `${ESC}[1m${texto}${RESET}`;
}

function esmaecer(texto: string, nivel: NivelCor): string {
  return nivel === "nenhuma" ? texto : `${ESC}[2m${texto}${RESET}`;
}

/** Interpola duas cores RGB em `t` ∈ [0,1]. */
function interpolar(a: CorRGB, b: CorRGB, t: number): CorRGB {
  const lerp = (x: number, y: number): number => Math.round(x + (y - x) * t);
  return {
    ansi16: t < 0.5 ? a.ansi16 : b.ansi16,
    ansi256: t < 0.5 ? a.ansi256 : b.ansi256,
    b: lerp(a.b, b.b),
    g: lerp(a.g, b.g),
    r: lerp(a.r, b.r),
  };
}

/** Aplica o gradiente Aurora caractere a caractere sobre um texto. */
function gradiente(texto: string, nivel: NivelCor): string {
  if (nivel === "nenhuma") {
    return texto;
  }
  const chars = [...texto];
  const n = Math.max(1, chars.length - 1);
  const segmentos = GRADIENTE.length - 1;
  const corpo = chars
    .map((ch, i) => {
      if (ch === " ") {
        return ch;
      }
      const pos = (i / n) * segmentos;
      const idx = Math.min(segmentos - 1, Math.floor(pos));
      const cor = interpolar(GRADIENTE[idx] as CorRGB, GRADIENTE[idx + 1] as CorRGB, pos - idx);
      return `${codigoFg(cor, nivel)}${ch}`;
    })
    .join("");
  return `${corpo}${RESET}`;
}

export interface Tema {
  readonly cor: NivelCor;
  /** Banner de abertura do chat (wordmark com gradiente Aurora). */
  banner(): string;
  /** Linha do prompt de entrada do usuário. */
  prompt(): string;
  /** Linha de progresso/evento (bolha discreta). */
  progresso(texto: string): string;
  /** Linha de ferramenta em execução (destaque ciano). */
  ferramenta(texto: string): string;
  sucesso(texto: string): string;
  erro(texto: string): string;
  aviso(texto: string): string;
  /** Realce inline (esmeralda) para nomes/valores. */
  destaque(texto: string): string;
  /** Texto secundário esmaecido (ajuda, dicas). */
  nota(texto: string): string;
  /** Cabeçalho com o resumo do projeto detectado. */
  cabecalhoProjeto(resumo: string): string;
  /** Régua divisória sutil. */
  regua(): string;
}

const LOGO = "◈ CodingPro";

/** Cria o tema para um nível de cor (default: detecta do `process.stdout`). */
export function criarTema(
  nivel: NivelCor = detectarNivelCor(process.env, Boolean(process.stdout.isTTY)),
): Tema {
  return {
    cor: nivel,
    banner() {
      const marca = nivel === "nenhuma" ? LOGO : `${ESC}[1m${gradiente(LOGO, nivel)}`;
      const sub = esmaecer("CLI de código assistida por IA · pt-BR", nivel);
      return `\n${marca}\n${sub}\n`;
    },
    prompt() {
      return `${pintar("❯", AURORA.violeta, nivel)} `;
    },
    progresso(texto) {
      return `${pintar("·", AURORA.cinza, nivel)} ${esmaecer(texto, nivel)}`;
    },
    ferramenta(texto) {
      return `${pintar("⚙", AURORA.ciano, nivel)} ${pintar(texto, AURORA.ciano, nivel)}`;
    },
    sucesso(texto) {
      return `${pintar("✓", AURORA.esmeralda, nivel)} ${texto}`;
    },
    erro(texto) {
      return `${pintar("✗", AURORA.vermelho, nivel)} ${pintar(texto, AURORA.vermelho, nivel)}`;
    },
    aviso(texto) {
      return `${pintar("!", AURORA.amarelo, nivel)} ${pintar(texto, AURORA.amarelo, nivel)}`;
    },
    destaque(texto) {
      return pintar(texto, AURORA.esmeralda, nivel);
    },
    nota(texto) {
      return esmaecer(texto, nivel);
    },
    cabecalhoProjeto(resumo) {
      return `${pintar("▸", AURORA.ciano, nivel)} ${negrito("Projeto:", nivel)} ${resumo}`;
    },
    regua() {
      return esmaecer("─".repeat(48), nivel);
    },
  };
}
