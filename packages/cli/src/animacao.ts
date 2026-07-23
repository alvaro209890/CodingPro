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
 * O tema aplica o gradiente na hora de imprimir.
 */
export function framesBannerAbertura(tick: number): string {
  const f = frameFaisca(tick);
  const f2 = frameFaisca(tick + 2);
  const f3 = frameFaisca(tick + 4);
  return [
    `  ${f}  ╭──────────────────────────────────────╮  ${f2}`,
    `     │  ◈  CodingPro                    │`,
    `     │  assistente de código · pt-BR    │`,
    `  ${f3}  ╰──────────────────────────────────────╯  ${f}`,
  ].join("\n");
}

export interface SpinnerHandle {
  readonly start: (rotulo?: string) => void;
  readonly update: (rotulo: string) => void;
  readonly stop: (mensagemFinal?: string) => void;
  readonly ativo: () => boolean;
}

/**
 * Spinner de uma linha (reescrita com CR). `escrever` recebe o texto a cada tick
 * (inclui `\r` e limpeza). Não assume ANSI — o caller pode colorir o `rotulo`.
 */
export function criarSpinner(escrever: (texto: string) => void, intervaloMs = 80): SpinnerHandle {
  let timer: ReturnType<typeof setInterval> | undefined;
  let tick = 0;
  let rotulo = "trabalhando";
  let ligado = false;

  const pintar = (): void => {
    // Limpa até 80 colunas e reescreve
    const linha = linhaSpinner(tick, rotulo);
    escrever(`\r${linha}${" ".repeat(Math.max(0, 48 - linha.length))}`);
  };

  return {
    start(r = "trabalhando") {
      rotulo = r;
      if (ligado) {
        return;
      }
      ligado = true;
      tick = 0;
      pintar();
      timer = setInterval(() => {
        tick += 1;
        pintar();
      }, intervaloMs);
      // Não deixa o timer manter o processo vivo sozinho.
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
        if (mensagemFinal !== undefined) {
          escrever(`${mensagemFinal}\n`);
        }
        return;
      }
      ligado = false;
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      // Apaga a linha do spinner
      escrever(`\r${" ".repeat(60)}\r`);
      if (mensagemFinal !== undefined && mensagemFinal.length > 0) {
        escrever(`${mensagemFinal}\n`);
      }
    },
    ativo: () => ligado,
  };
}
