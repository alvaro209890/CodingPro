/**
 * Tema visual "Aurora" da CLI: cor e composição da interface de chat (banner, prompt, bolhas de
 * progresso, status). Puro e sem dependências — usa ANSI com detecção de capacidade
 * (truecolor → 256 → 16 → nenhuma) e glifos modernos ou **ASCII** para Windows CMD / SSH legado.
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

const ESC = "\u001b";
const RESET = `${ESC}[0m`;

/**
 * Detecta o nível de cor. Ordem: `NO_COLOR` desliga; `FORCE_COLOR` liga; sem TTY → nenhuma;
 * Windows Terminal / COLORTERM truecolor → truecolor; `TERM` com `256` → 256; Windows CMD → 16;
 * senão 16.
 */
export function detectarNivelCor(
  env: Record<string, string | undefined>,
  isTTY: boolean,
  platform: string = process.platform,
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
  if (forcado === "3") {
    return "truecolor";
  }
  if (forcado === "2") {
    return "256";
  }
  if (forcado === "1") {
    return "16";
  }
  const colorterm = (env.COLORTERM ?? "").toLowerCase();
  if (colorterm.includes("truecolor") || colorterm.includes("24bit")) {
    return "truecolor";
  }
  // Windows Terminal e VS Code suportam truecolor
  if (env.WT_SESSION !== undefined || env.TERM_PROGRAM === "vscode") {
    return "truecolor";
  }
  const term = (env.TERM ?? "").toLowerCase();
  if (term.includes("256")) {
    return "256";
  }
  // CMD clássico / ConEmu: 16 cores brilhantes bastam e renderizam bem
  if (platform === "win32") {
    return "16";
  }
  return "16";
}

/**
 * Glifos ASCII quando o terminal não lida bem com Unicode (CMD Windows legado, TERM=dumb,
 * locale sem UTF-8, ou CODINGPRO_ASCII=1). Windows Terminal / VS Code / iTerm → Unicode.
 */
export function detectarAscii(
  env: Record<string, string | undefined>,
  platform: string = process.platform,
): boolean {
  const flag = (env.CODINGPRO_ASCII ?? "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") {
    return true;
  }
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") {
    return false;
  }
  if (env.WT_SESSION !== undefined) {
    return false;
  }
  if (env.TERM_PROGRAM === "vscode" || env.TERM_PROGRAM === "iTerm.app") {
    return false;
  }
  const term = (env.TERM ?? "").toLowerCase();
  if (term === "dumb" || term === "cygwin" || term === "win32") {
    return true;
  }
  // CMD / PowerShell “cru” sem WT: code page legada quebra box-drawing
  if (platform === "win32") {
    return true;
  }
  const lang = `${env.LANG ?? ""}${env.LC_ALL ?? ""}${env.LC_CTYPE ?? ""}`.toLowerCase();
  if (lang.length > 0 && !lang.includes("utf-8") && !lang.includes("utf8")) {
    return true;
  }
  return false;
}

export interface Glifos {
  readonly logo: string;
  readonly prompt: string;
  readonly bullet: string;
  readonly tool: string;
  readonly ok: string;
  readonly fail: string;
  readonly warn: string;
  readonly project: string;
  readonly rule: string;
  readonly boxTop: string;
  readonly boxBot: string;
  readonly boxSide: string;
}

export function glifosPara(ascii: boolean): Glifos {
  if (ascii) {
    return {
      boxBot: "+------------------------------------------+",
      boxSide: "|",
      boxTop: "+------------------------------------------+",
      bullet: "*",
      fail: "x",
      logo: "* CodingPro",
      ok: "+",
      project: ">",
      prompt: "> ",
      rule: "-".repeat(44),
      tool: "#",
      warn: "!",
    };
  }
  return {
    boxBot: "╰──────────────────────────────────────────╯",
    boxSide: "│",
    boxTop: "╭──────────────────────────────────────────╮",
    bullet: "·",
    fail: "✗",
    logo: "◈ CodingPro",
    ok: "✓",
    project: "▸",
    prompt: "❯ ",
    rule: "─".repeat(44),
    tool: "⚙",
    warn: "!",
  };
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

/**
 * Esmaecer: em Windows CMD o SGR 2 (dim) é fraco/inexistente — usa cinza brilhante em nível 16.
 */
function esmaecer(texto: string, nivel: NivelCor, preferCinza: boolean): string {
  if (nivel === "nenhuma") {
    return texto;
  }
  if (preferCinza || nivel === "16") {
    return pintar(texto, AURORA.cinza, nivel);
  }
  return `${ESC}[2m${texto}${RESET}`;
}

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

function gradiente(texto: string, nivel: NivelCor): string {
  if (nivel === "nenhuma" || nivel === "16") {
    // Gradiente por caractere não vale a pena em 16 cores (CMD)
    return nivel === "nenhuma" ? texto : pintar(texto, AURORA.esmeralda, nivel);
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
  readonly ascii: boolean;
  banner(): string;
  prompt(): string;
  progresso(texto: string): string;
  ferramenta(texto: string): string;
  sucesso(texto: string): string;
  erro(texto: string): string;
  aviso(texto: string): string;
  destaque(texto: string): string;
  nota(texto: string): string;
  cabecalhoProjeto(resumo: string): string;
  regua(): string;
}

export interface OpcoesTema {
  readonly nivel?: NivelCor;
  readonly ascii?: boolean;
  /** Preferir cinza em vez de SGR dim (melhor no CMD). Default: true se ascii ou win32. */
  readonly preferCinza?: boolean;
}

/** Cria o tema (default: detecta cor + ASCII do ambiente). */
export function criarTema(
  nivelOuOpcoes: NivelCor | OpcoesTema = detectarNivelCor(
    process.env,
    Boolean(process.stdout.isTTY),
  ),
): Tema {
  const opcoes: OpcoesTema =
    typeof nivelOuOpcoes === "string" ? { nivel: nivelOuOpcoes } : nivelOuOpcoes;
  const nivel = opcoes.nivel ?? detectarNivelCor(process.env, Boolean(process.stdout.isTTY));
  const ascii = opcoes.ascii ?? detectarAscii(process.env);
  const preferCinza = opcoes.preferCinza ?? (ascii || process.platform === "win32");
  const g = glifosPara(ascii);

  return {
    ascii,
    cor: nivel,
    banner() {
      const marca = nivel === "nenhuma" ? g.logo : `${ESC}[1m${gradiente(g.logo, nivel)}${RESET}`;
      const sub = esmaecer(
        ascii ? "assistente de codigo · pt-BR" : "assistente de código · pt-BR",
        nivel,
        preferCinza,
      );
      const dica = esmaecer(
        ascii
          ? "digite / para comandos  ·  setas Tab Enter"
          : "digite / para comandos  ·  ↑↓ Tab Enter",
        nivel,
        preferCinza,
      );
      const top = esmaecer(g.boxTop, nivel, preferCinza);
      const bot = esmaecer(g.boxBot, nivel, preferCinza);
      const side = (inner: string): string =>
        `${esmaecer(g.boxSide, nivel, preferCinza)}  ${inner}`;
      return `\n${top}\n${side(marca)}\n${side(sub)}\n${side(dica)}\n${bot}\n`;
    },
    prompt() {
      const sim = g.prompt.trimEnd();
      return `${pintar(sim, AURORA.violeta, nivel)} `;
    },
    progresso(texto) {
      return `${pintar(g.bullet, AURORA.cinza, nivel)} ${esmaecer(texto, nivel, preferCinza)}`;
    },
    ferramenta(texto) {
      return `${pintar(g.tool, AURORA.ciano, nivel)} ${pintar(texto, AURORA.ciano, nivel)}`;
    },
    sucesso(texto) {
      return `${pintar(g.ok, AURORA.esmeralda, nivel)} ${texto}`;
    },
    erro(texto) {
      return `${pintar(g.fail, AURORA.vermelho, nivel)} ${pintar(texto, AURORA.vermelho, nivel)}`;
    },
    aviso(texto) {
      return `${pintar(g.warn, AURORA.amarelo, nivel)} ${pintar(texto, AURORA.amarelo, nivel)}`;
    },
    destaque(texto) {
      return pintar(texto, AURORA.esmeralda, nivel);
    },
    nota(texto) {
      return esmaecer(texto, nivel, preferCinza);
    },
    cabecalhoProjeto(resumo) {
      return `${pintar(g.project, AURORA.ciano, nivel)} ${negrito("Projeto:", nivel)} ${resumo}`;
    },
    regua() {
      return esmaecer(g.rule, nivel, preferCinza);
    },
  };
}
