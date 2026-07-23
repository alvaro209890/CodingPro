/**
 * Frames e helpers de animação da CLI (spinner, pulso, banner). Puros e determinísticos
 * em função do tick — o TTY só agenda o intervalo.
 */

/** Braille spinner (estilo Claude / modernos CLIs). */
export const SPINNER_FRAMES = Object.freeze([
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const);

/** Pontinhos de “pensando…”. */
export const PONTOS_FRAMES = Object.freeze(["   ", ".  ", ".. ", "..."] as const);

/** Pulsos do prompt (coração/estrela sutil). */
export const PULSO_FRAMES = Object.freeze(["✦", "✧", "✦", "✧"] as const);

/** Faíscas do banner de abertura. */
export const FAISCA_FRAMES = Object.freeze(["·", "✦", "✧", "★", "✧", "✦"] as const);

export function frameSpinner(tick: number): string {
  const i = ((tick % SPINNER_FRAMES.length) + SPINNER_FRAMES.length) % SPINNER_FRAMES.length;
  return SPINNER_FRAMES[i] as string;
}

export function framePontos(tick: number): string {
  const i = ((tick % PONTOS_FRAMES.length) + PONTOS_FRAMES.length) % PONTOS_FRAMES.length;
  return PONTOS_FRAMES[i] as string;
}

export function framePulso(tick: number): string {
  const i = ((tick % PULSO_FRAMES.length) + PULSO_FRAMES.length) % PULSO_FRAMES.length;
  return PULSO_FRAMES[i] as string;
}

export function frameFaisca(tick: number): string {
  const i = ((tick % FAISCA_FRAMES.length) + FAISCA_FRAMES.length) % FAISCA_FRAMES.length;
  return FAISCA_FRAMES[i] as string;
}

/** Monta a linha de status animada: `⠋ Pensando…` */
export function linhaSpinner(tick: number, rotulo: string): string {
  return `${frameSpinner(tick)} ${rotulo}${framePontos(tick)}`;
}

/**
 * Frames do banner de abertura (texto puro, sem ANSI). Cada frame é multi-linha.
 * `ascii=true` usa caixa +-* compatível com Windows CMD / SSH legado.
 */
/** Banner de abertura (delega ao tema na prática; mantido p/ testes de animação). */
export function framesBannerAbertura(_tick: number, ascii = false): string {
  // Wordmark grande (mesmas linhas do tema) — estático, sem multi-frame.
  const mark = [
    "   ____          _ _             ____             ",
    "  / ___|___   __| (_)_ __   __ _|  _ \\ _ __ ___  ",
    " | |   / _ \\ / _` | | '_ \\ / _` | |_) | '__/ _ \\ ",
    " | |__| (_) | (_| | | | | | (_| |  __/| | | (_) |",
    "  \\____\\___/ \\__,_|_|_| |_|\\__, |_|   |_|  \\___/ ",
    "                           |___/                  ",
  ];
  const sub = ascii
    ? "  DeepSeek V4 Pro/Flash  ·  1M context  ·  pt-BR"
    : "  DeepSeek V4 Pro/Flash  ·  1M context  ·  pt-BR";
  return [...mark, sub].join("\n");
}

/** Spinner ASCII quando braille não renderiza (CMD). */
export const SPINNER_ASCII = Object.freeze(["|", "/", "-", "\\"] as const);

export function frameSpinnerModo(tick: number, ascii: boolean): string {
  if (ascii) {
    const i = ((tick % SPINNER_ASCII.length) + SPINNER_ASCII.length) % SPINNER_ASCII.length;
    return SPINNER_ASCII[i] as string;
  }
  return frameSpinner(tick);
}

export function linhaSpinnerModo(tick: number, rotulo: string, ascii: boolean): string {
  return `${frameSpinnerModo(tick, ascii)} ${rotulo}${framePontos(tick)}`;
}

export interface SpinnerHandle {
  readonly start: (rotulo?: string) => void;
  readonly update: (rotulo: string) => void;
  readonly stop: (mensagemFinal?: string) => void;
  readonly ativo: () => boolean;
}

/** Formatadores opcionais (cor) aplicados ao frame do spinner — injetados pelo tema. */
export interface SpinnerFormatadores {
  /** Colore só o glifo giratório; `tick` permite um pulso cíclico de cor. */
  readonly pintarFrame?: (frame: string, tick: number) => string;
  /** Colore o rótulo (ex.: esmaecido, como as demais linhas de progresso). */
  readonly pintarLabel?: (rotulo: string) => string;
}

const ESC = "\u001b";
/** Limpa a linha atual e volta ao início (não sobe linhas anteriores). */
const CLEAR_LINE = `\r${ESC}[2K`;

/**
 * Spinner de uma linha. Usa clear-line (não sobe o cursor) para não corromper o histórico
 * nem apagar o prompt de forma errática.
 */
export function criarSpinner(
  escrever: (texto: string) => void,
  intervaloMs = 80,
  ascii = false,
  formatadores: SpinnerFormatadores = {},
  mostrarTempo = false,
): SpinnerHandle {
  let timer: ReturnType<typeof setInterval> | undefined;
  let tick = 0;
  let rotulo = "trabalhando";
  let ligado = false;
  let inicioMs = 0;

  /** ` · Ns` a partir de 1s (relógio vivo); antes disso mantém os pontinhos animados. */
  const cauda = (): string => {
    if (mostrarTempo) {
      const s = Math.floor((Date.now() - inicioMs) / 1000);
      if (s >= 1) {
        return ` · ${s}s`;
      }
    }
    return framePontos(tick);
  };

  const pintar = (): void => {
    // Sem formatadores nem tempo: saída idêntica à anterior (compatibilidade total).
    if (
      formatadores.pintarFrame === undefined &&
      formatadores.pintarLabel === undefined &&
      !mostrarTempo
    ) {
      escrever(`${CLEAR_LINE}${linhaSpinnerModo(tick, rotulo, ascii)}`);
      return;
    }
    const frame = frameSpinnerModo(tick, ascii);
    const frameFmt = formatadores.pintarFrame?.(frame, tick) ?? frame;
    const rotuloFmt = formatadores.pintarLabel?.(rotulo) ?? rotulo;
    // Só reescreve a linha atual; padding curto para não estourar o wrap
    escrever(`${CLEAR_LINE}${frameFmt} ${rotuloFmt}${cauda()}`);
  };

  return {
    start(r = "trabalhando") {
      rotulo = r;
      if (ligado) {
        pintar();
        return;
      }
      ligado = true;
      tick = 0;
      inicioMs = Date.now();
      pintar();
      timer = setInterval(() => {
        tick += 1;
        pintar();
      }, intervaloMs);
      timer.unref?.();
    },
    update(r: string) {
      rotulo = r;
      if (ligado) {
        pintar();
      }
    },
    stop(mensagemFinal) {
      if (!ligado) {
        if (mensagemFinal !== undefined && mensagemFinal.length > 0) {
          escrever(`${mensagemFinal}\n`);
        }
        return;
      }
      ligado = false;
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      // Apaga a linha do spinner e deixa o cursor no início da linha limpa
      escrever(CLEAR_LINE);
      if (mensagemFinal !== undefined && mensagemFinal.length > 0) {
        escrever(`${mensagemFinal}\n`);
      }
    },
    ativo: () => ligado,
  };
}
