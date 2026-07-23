/**
 * Tema visual "Aurora" da CLI: cor e composição da interface de chat (banner, prompt, bolhas de
 * progresso, status). Puro e sem dependências — usa ANSI com detecção de capacidade
 * (truecolor → 256 → 16 → nenhuma) e glifos modernos ou **ASCII** para Windows CMD / SSH legado.
 */

import { release as osRelease } from "node:os";

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

/** Tons base compartilhados entre paletas (erros/avisos precisam ser legíveis em todo tema). */
const TOM = {
  amarelo: { ansi16: 93, ansi256: 221, b: 71, g: 191, r: 245 },
  azulNeon: { ansi16: 94, ansi256: 63, b: 255, g: 120, r: 96 },
  branco: { ansi16: 97, ansi256: 255, b: 245, g: 245, r: 245 },
  cianoNeon: { ansi16: 96, ansi256: 51, b: 238, g: 211, r: 34 },
  ciano: { ansi16: 96, ansi256: 45, b: 212, g: 182, r: 6 },
  cinza: { ansi16: 90, ansi256: 245, b: 148, g: 148, r: 148 },
  cinzaClaro: { ansi16: 37, ansi256: 250, b: 180, g: 180, r: 180 },
  cinzaMedio: { ansi16: 90, ansi256: 244, b: 120, g: 120, r: 120 },
  esmeralda: { ansi16: 92, ansi256: 43, b: 129, g: 185, r: 16 },
  lima: { ansi16: 92, ansi256: 148, b: 22, g: 204, r: 132 },
  magenta: { ansi16: 95, ansi256: 198, b: 172, g: 60, r: 255 },
  laranja: { ansi16: 93, ansi256: 208, b: 22, g: 115, r: 249 },
  rosa: { ansi16: 91, ansi256: 204, b: 94, g: 63, r: 244 },
  solAmarelo: { ansi16: 93, ansi256: 220, b: 21, g: 204, r: 250 },
  verdeNeon: { ansi16: 92, ansi256: 48, b: 160, g: 230, r: 16 },
  vermelho: { ansi16: 91, ansi256: 203, b: 92, g: 92, r: 239 },
  violeta: { ansi16: 95, ansi256: 141, b: 246, g: 92, r: 139 },
} as const satisfies Record<string, CorRGB>;

/** Nomes dos temas selecionáveis. `aurora` é o padrão histórico. */
export type TemaNome = "aurora" | "solar" | "neon" | "mono";

/** Paleta semântica de um tema: cada slot mapeia para um papel da UI. */
export interface Paleta {
  /** Cor de destaque/sucesso e do wordmark em 16 cores. */
  readonly primaria: CorRGB;
  /** Ferramentas, cabeçalho do projeto e tag de status. */
  readonly acento: CorRGB;
  /** Símbolo do prompt (❯). */
  readonly prompt: CorRGB;
  readonly sucesso: CorRGB;
  readonly erro: CorRGB;
  readonly aviso: CorRGB;
  /** Texto esmaecido (notas, régua, sub-título). */
  readonly cinza: CorRGB;
  /** Gradiente do banner e do pulso do spinner (≥ 2 paradas). */
  readonly gradiente: readonly CorRGB[];
}

/** Catálogo dos 4 temas. Ordem = ordem de exibição no `/tema`. */
export const PALETAS: Readonly<Record<TemaNome, Paleta>> = Object.freeze({
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

/** Ordem canônica dos temas (para listar no `/tema`). */
export const TEMAS: readonly TemaNome[] = Object.freeze(["aurora", "solar", "neon", "mono"]);

/** Descrição curta de cada tema (pt-BR) para o menu `/tema`. */
export const DESCRICAO_TEMA: Readonly<Record<TemaNome, string>> = Object.freeze({
  aurora: "esmeralda → ciano → violeta (padrão)",
  mono: "grafite minimalista, alto contraste",
  neon: "magenta → azul → ciano vibrante",
  solar: "âmbar → laranja → rosa quente",
});

/** Valida/normaliza um nome de tema; entradas inválidas caem em `aurora`. */
export function nomeTemaValido(valor: unknown): TemaNome {
  if (typeof valor === "string") {
    const n = valor.trim().toLowerCase();
    if (n === "aurora" || n === "solar" || n === "neon" || n === "mono") {
      return n;
    }
  }
  return "aurora";
}

const ESC = "\u001b";
const RESET = `${ESC}[0m`;

/**
 * Windows 10/11 (kernel NT ≥ 10) tem VT/truecolor no `conhost` clássico, não só no Windows
 * Terminal — o Node já habilita `ENABLE_VIRTUAL_TERMINAL_PROCESSING` sozinho nesses builds.
 * Windows 7/8.1 (NT 6.x) não têm essa via, daí o fallback rígido para 16 cores/ASCII.
 */
function windowsModerno(release: string): boolean {
  const major = Number.parseInt(release.split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major >= 10;
}

/**
 * Detecta o nível de cor. Ordem: `NO_COLOR` desliga; `FORCE_COLOR` liga; sem TTY → nenhuma;
 * Windows Terminal / COLORTERM truecolor → truecolor; `TERM` com `256` → 256;
 * Windows 10/11 (CMD/PowerShell "cru") → truecolor; Windows 7/8.1 → 16.
 */
export function detectarNivelCor(
  env: Record<string, string | undefined>,
  isTTY: boolean,
  platform: string = process.platform,
  release: string = osRelease(),
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
  // CMD / PowerShell "crus" no Windows 10/11 já têm VT truecolor; só Win7/8.1 caem para 16.
  if (platform === "win32") {
    return windowsModerno(release) ? "truecolor" : "16";
  }
  return "16";
}

/**
 * Glifos ASCII quando o terminal não lida bem com Unicode (Windows 7/8.1, TERM=dumb,
 * locale sem UTF-8, ou CODINGPRO_ASCII=1). Windows Terminal / VS Code / iTerm / Windows 10+ →
 * Unicode (conhost moderno usa fonte TrueType com codepage UTF-8 disponível).
 */
export function detectarAscii(
  env: Record<string, string | undefined>,
  platform: string = process.platform,
  release: string = osRelease(),
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
  // CMD / PowerShell "cru" sem WT: só o Windows 7/8.1 tem code page legada que quebra box-drawing
  if (platform === "win32") {
    return !windowsModerno(release);
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
  /** Cantos e traços da caixa do banner (dimensionada em runtime, largura variável). */
  readonly cantoTL: string;
  readonly cantoTR: string;
  readonly cantoBL: string;
  readonly cantoBR: string;
  readonly linhaH: string;
  readonly linhaV: string;
}

export function glifosPara(ascii: boolean): Glifos {
  if (ascii) {
    return {
      bullet: "*",
      cantoBL: "+",
      cantoBR: "+",
      cantoTL: "+",
      cantoTR: "+",
      fail: "x",
      linhaH: "-",
      linhaV: "|",
      logo: "* CodingPro",
      ok: "+",
      project: ">",
      prompt: "> ",
      rule: "-".repeat(52),
      tool: "#",
      warn: "!",
    };
  }
  return {
    bullet: "·",
    cantoBL: "╰",
    cantoBR: "╯",
    cantoTL: "╭",
    cantoTR: "╮",
    fail: "✗",
    linhaH: "─",
    linhaV: "│",
    logo: "◈ CodingPro",
    ok: "✓",
    project: "▸",
    prompt: "❯ ",
    rule: "─".repeat(52),
    tool: "⚙",
    warn: "!",
  };
}

/**
 * Wordmark grande (estilo Claude Code): nome bem visível no topo.
 * Largura ~50 colunas — cabe em terminais comuns sem wrap. Estático (1 impressão).
 */
export function logoLinhas(ascii: boolean): readonly string[] {
  // Figlet "standard" de CodingPro — alto e legível
  const wordmark = [
    "   ____          _ _             ____             ",
    "  / ___|___   __| (_)_ __   __ _|  _ \\ _ __ ___  ",
    " | |   / _ \\ / _` | | '_ \\ / _` | |_) | '__/ _ \\ ",
    " | |__| (_) | (_| | | | | | (_| |  __/| | | (_) |",
    "  \\____\\___/ \\__,_|_|_| |_|\\__, |_|   |_|  \\___/ ",
    "                           |___/                  ",
  ];
  if (ascii) {
    return wordmark;
  }
  // Unicode: mesmo wordmark (compatível) + marca no canto superior
  return wordmark;
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
function esmaecer(texto: string, nivel: NivelCor, preferCinza: boolean, cinza: CorRGB): string {
  if (nivel === "nenhuma") {
    return texto;
  }
  if (preferCinza || nivel === "16") {
    return pintar(texto, cinza, nivel);
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

/**
 * Gradiente por caractere. `largura` é a referência de coluna 0..largura-1 — passar a MESMA
 * largura para todas as linhas de um bloco multi-linha faz as faixas de cor alinharem
 * verticalmente (sweep coerente), em vez de cada linha recomeçar o degradê do zero.
 */
function gradienteColuna(
  texto: string,
  nivel: NivelCor,
  largura: number,
  gradiente: readonly CorRGB[],
): string {
  if (nivel === "nenhuma" || nivel === "16") {
    // Gradiente por caractere não vale a pena em 16 cores (CMD)
    return nivel === "nenhuma" ? texto : pintar(texto, gradiente[0] as CorRGB, nivel);
  }
  const chars = [...texto];
  const n = Math.max(1, largura - 1);
  const segmentos = Math.max(1, gradiente.length - 1);
  const corpo = chars
    .map((ch, i) => {
      if (ch === " ") {
        return ch;
      }
      const pos = (i / n) * segmentos;
      const idx = Math.min(segmentos - 1, Math.floor(pos));
      const cor = interpolar(gradiente[idx] as CorRGB, gradiente[idx + 1] as CorRGB, pos - idx);
      return `${codigoFg(cor, nivel)}${ch}`;
    })
    .join("");
  return `${corpo}${RESET}`;
}

export interface Tema {
  readonly cor: NivelCor;
  readonly ascii: boolean;
  /** Nome do tema ativo (`aurora`, `solar`, `neon`, `mono`). */
  readonly nome: TemaNome;
  banner(): string;
  /** Mesmo conteúdo de `banner()`, como linhas separadas — usado para revelar com animação. */
  bannerLinhas(): readonly string[];
  /** Colore um glifo (ex.: spinner) em pulso cíclico pela paleta Aurora — `tick` define a fase. */
  pulso(glifo: string, tick: number): string;
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
  /**
   * Cantinho de status (custo da sessão, tokens, contexto restante).
   * `linha` já vem formatada (ver `formatarStatusLinha` em status.ts).
   */
  statusLinha(linha: string): string;
}

export interface OpcoesTema {
  readonly nivel?: NivelCor;
  readonly ascii?: boolean;
  /** Preferir cinza em vez de SGR dim (melhor no CMD). Default: true se ascii ou win32. */
  readonly preferCinza?: boolean;
  /** Paleta selecionada. Default: `CODINGPRO_TEMA` do ambiente ou `aurora`. */
  readonly paleta?: TemaNome;
}

/** Lê o tema padrão da variável `CODINGPRO_TEMA` (inválida/ausente → aurora). */
function temaDoAmbiente(env: Record<string, string | undefined>): TemaNome {
  return nomeTemaValido(env.CODINGPRO_TEMA);
}

/** Cria o tema (default: detecta cor + ASCII + tema do ambiente). */
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
  const nomeTema = opcoes.paleta ?? temaDoAmbiente(process.env);
  const p = PALETAS[nomeTema];
  const g = glifosPara(ascii);

  /**
   * Bloco do banner: wordmark dentro de uma caixa sólida (estilo Claude Code), largura
   * calculada a partir do próprio wordmark — gradiente por coluna alinhado entre as linhas.
   */
  function montarBlocoBanner(): readonly string[] {
    const wordmarkBruto = logoLinhas(ascii);
    const largura = Math.max(...wordmarkBruto.map((l) => l.length));
    const preencher = (s: string): string => s + " ".repeat(Math.max(0, largura - s.length));

    const linhaWordmark = (l: string): string => {
      const padded = preencher(l);
      if (nivel === "nenhuma") {
        return padded;
      }
      if (nivel === "16") {
        return pintar(padded, p.primaria, nivel);
      }
      return `${ESC}[1m${gradienteColuna(padded, nivel, largura, p.gradiente)}${RESET}`;
    };

    const subFmt = esmaecer(
      preencher("DeepSeek V4 Pro/Flash  ·  1M context  ·  pt-BR"),
      nivel,
      preferCinza,
      p.cinza,
    );
    const vazio = " ".repeat(largura);

    const bordar = (s: string): string =>
      nivel === "nenhuma" ? s : esmaecer(s, nivel, preferCinza, p.cinza);
    const topo = bordar(`${g.cantoTL}${g.linhaH.repeat(largura + 2)}${g.cantoTR}`);
    const fundo = bordar(`${g.cantoBL}${g.linhaH.repeat(largura + 2)}${g.cantoBR}`);
    const lado = bordar(g.linhaV);
    const envolver = (conteudo: string): string => `${lado} ${conteudo} ${lado}`;

    const dica = esmaecer(
      "digite / para comandos   ·   /ajuda lista tudo",
      nivel,
      preferCinza,
      p.cinza,
    );

    return [
      topo,
      envolver(vazio),
      ...wordmarkBruto.map((l) => envolver(linhaWordmark(l))),
      envolver(vazio),
      envolver(subFmt),
      envolver(vazio),
      fundo,
      "",
      `  ${dica}`,
    ];
  }

  return {
    ascii,
    cor: nivel,
    nome: nomeTema,
    banner() {
      return `\n${montarBlocoBanner().join("\n")}\n`;
    },
    bannerLinhas() {
      return montarBlocoBanner();
    },
    pulso(glifo, tick) {
      if (nivel === "nenhuma") {
        return glifo;
      }
      const paleta = p.gradiente;
      const i = ((tick % paleta.length) + paleta.length) % paleta.length;
      return pintar(glifo, paleta[i] as CorRGB, nivel);
    },
    prompt() {
      const sim = g.prompt.trimEnd();
      return `${pintar(sim, p.prompt, nivel)} `;
    },
    progresso(texto) {
      return `${pintar(g.bullet, p.cinza, nivel)} ${esmaecer(texto, nivel, preferCinza, p.cinza)}`;
    },
    ferramenta(texto) {
      return `${pintar(g.tool, p.acento, nivel)} ${pintar(texto, p.acento, nivel)}`;
    },
    sucesso(texto) {
      return `${pintar(g.ok, p.sucesso, nivel)} ${texto}`;
    },
    erro(texto) {
      return `${pintar(g.fail, p.erro, nivel)} ${pintar(texto, p.erro, nivel)}`;
    },
    aviso(texto) {
      return `${pintar(g.warn, p.aviso, nivel)} ${pintar(texto, p.aviso, nivel)}`;
    },
    destaque(texto) {
      return pintar(texto, p.primaria, nivel);
    },
    nota(texto) {
      return esmaecer(texto, nivel, preferCinza, p.cinza);
    },
    cabecalhoProjeto(resumo) {
      return `${pintar(g.project, p.acento, nivel)} ${negrito("Projeto:", nivel)} ${resumo}`;
    },
    regua() {
      return esmaecer(g.rule, nivel, preferCinza, p.cinza);
    },
    statusLinha(linha: string) {
      const tag = "·";
      return `${pintar(tag, p.acento, nivel)} ${esmaecer(linha, nivel, preferCinza, p.cinza)}`;
    },
  };
}

/**
 * Amostra visual (swatch) do gradiente de um tema — usada no menu `/tema`.
 * Em `nenhuma`/ASCII cai para um rótulo textual legível (sem depender de cor).
 */
export function amostraTema(nome: TemaNome, nivel: NivelCor, ascii = false): string {
  const grad = PALETAS[nome].gradiente;
  if (nivel === "nenhuma" || ascii) {
    return "▪".repeat(grad.length).replace(/▪/gu, ascii ? "#" : "▪");
  }
  const blocos = 9;
  const segmentos = Math.max(1, grad.length - 1);
  let out = "";
  for (let i = 0; i < blocos; i += 1) {
    const pos = (i / (blocos - 1)) * segmentos;
    const idx = Math.min(segmentos - 1, Math.floor(pos));
    const cor = interpolar(grad[idx] as CorRGB, grad[idx + 1] as CorRGB, pos - idx);
    out += `${codigoFg(cor, nivel)}█`;
  }
  return `${out}${RESET}`;
}
