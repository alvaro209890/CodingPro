/**
 * Prompt interativo em TTY: raw mode, autocomplete `/` com setas, redraw e animações.
 * Em não-TTY (pipe/testes) o index continua usando `criarLeitorDeLinhas`.
 */

import type { Readable, Writable } from "node:stream";
import { criarSpinner, FAISCA_FRAMES, frameFaisca, type SpinnerHandle } from "./animacao.js";
import { COMANDOS_CHAT, type ComandoChat } from "./commands.js";
import {
  aplicarTecla,
  estadoInicialPrompt,
  type PromptState,
  parseTeclas,
} from "./prompt-input.js";
import type { Tema } from "./tema.js";

const ESC = "\u001b";
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_LINE = `${ESC}[2K`;
const CURSOR_UP = (n: number): string => (n > 0 ? `${ESC}[${n}A` : "");
const CURSOR_COL = (n: number): string => `${ESC}[${Math.max(1, n)}G`;

export interface PromptTtyOptions {
  readonly input: Readable & {
    isTTY?: boolean;
    setRawMode?: (mode: boolean) => void;
    resume?: () => void;
  };
  readonly output: Writable;
  readonly tema: Tema;
  readonly catalogo?: readonly ComandoChat[];
  readonly signal?: AbortSignal;
}

export interface PromptTty {
  /** Lê uma linha com autocomplete. `undefined` = EOF/Ctrl+D/Ctrl+C. */
  readonly ler: (simboloPrompt?: string) => Promise<string | undefined>;
  /** Banner animado de abertura (vários frames rápidos). */
  readonly bannerAnimado: () => Promise<void>;
  readonly spinner: SpinnerHandle;
  readonly close: () => void;
}

function stripAnsi(texto: string): string {
  let out = "";
  for (let i = 0; i < texto.length; i += 1) {
    if (texto[i] === ESC && texto[i + 1] === "[") {
      i += 2;
      while (i < texto.length) {
        const c = texto[i] as string;
        if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
          break;
        }
        i += 1;
      }
      continue;
    }
    out += texto[i];
  }
  return out;
}

function visibleLen(texto: string): number {
  return [...stripAnsi(texto)].length;
}

function colorirSugestoes(state: PromptState, tema: Tema): string {
  if (state.sugestoes.length === 0) {
    return "";
  }
  const linhas = state.sugestoes.map((s, i) => {
    const ativo = i === state.selecionado;
    const marca = ativo ? tema.destaque("›") : tema.nota(" ");
    const nome = ativo ? tema.destaque(s.match) : tema.nota(s.match);
    const desc = tema.nota(s.descricao);
    const fundo = ativo ? tema.nota(" ▸") : "";
    return `  ${marca} ${nome}  ${desc}${fundo}`;
  });
  const dica = tema.nota("  ↑↓ navegar · Tab completa · Enter envia · Esc fecha");
  return `${linhas.join("\n")}\n${dica}`;
}

/**
 * Renderiza o bloco do prompt (linha de input + sugestões). Devolve quantas linhas
 * ocupou para o próximo redraw poder apagá-las.
 */
function renderBloco(
  state: PromptState,
  simbolo: string,
  tema: Tema,
): { texto: string; linhas: number; colCursor: number } {
  const promptColorido = `${simbolo}${state.buffer}`;
  const sug = colorirSugestoes(state, tema);
  const texto = sug.length > 0 ? `${promptColorido}\n${sug}` : promptColorido;
  const linhas = 1 + (sug.length > 0 ? sug.split("\n").length : 0);
  // Coluna do cursor: tamanho visual do símbolo + cursor no buffer
  const colCursor = visibleLen(simbolo) + state.cursor + 1;
  return { colCursor, linhas, texto };
}

export function criarPromptTty(options: PromptTtyOptions): PromptTty {
  const { input, output, tema } = options;
  const catalogo = options.catalogo ?? COMANDOS_CHAT;
  let linhasOcupadas = 0;
  let fechado = false;

  const write = (s: string): void => {
    output.write(s);
  };

  const spinner = criarSpinner(
    (s) => {
      // Spinner em stderr/stdout do caller; limpa linha única
      write(s);
    },
    80,
    tema.ascii,
    {
      pintarFrame: (frame, tick) => tema.pulso(frame, tick),
      pintarLabel: (rotulo) => tema.nota(rotulo),
    },
  );

  const apagarBloco = (): void => {
    if (linhasOcupadas <= 0) {
      return;
    }
    // Move ao início do bloco e limpa para baixo
    write(`\r${CURSOR_UP(linhasOcupadas - 1)}`);
    for (let i = 0; i < linhasOcupadas; i += 1) {
      write(`${CLEAR_LINE}`);
      if (i < linhasOcupadas - 1) {
        write("\n");
      }
    }
    // Volta ao topo do bloco
    write(`\r${CURSOR_UP(linhasOcupadas - 1)}`);
    linhasOcupadas = 0;
  };

  const desenhar = (state: PromptState, simbolo: string): void => {
    apagarBloco();
    const bloco = renderBloco(state, simbolo, tema);
    write(bloco.texto);
    // Posiciona o cursor na linha do input (primeira do bloco)
    if (bloco.linhas > 1) {
      write(`${CURSOR_UP(bloco.linhas - 1)}${CURSOR_COL(bloco.colCursor)}`);
    } else {
      write(CURSOR_COL(bloco.colCursor));
    }
    linhasOcupadas = bloco.linhas;
  };

  const ler = (simboloPrompt?: string): Promise<string | undefined> => {
    if (fechado) {
      return Promise.resolve(undefined);
    }
    const simbolo = simboloPrompt ?? tema.prompt();
    let state = estadoInicialPrompt();
    let restoSeq = "";

    const raw = typeof input.setRawMode === "function";
    if (raw) {
      try {
        input.setRawMode?.(true);
      } catch {
        // alguns streams mockados não suportam
      }
    }
    input.resume?.();
    write(SHOW_CURSOR);
    desenhar(state, simbolo);

    return new Promise((resolve) => {
      const onData = (chunk: Buffer | string): void => {
        const texto = restoSeq + (typeof chunk === "string" ? chunk : chunk.toString("utf8"));
        const { teclas, resto } = parseTeclas(texto);
        restoSeq = resto;
        for (const tecla of teclas) {
          state = aplicarTecla(state, tecla, catalogo);
          if (state.cancelado) {
            cleanup();
            apagarBloco();
            write("\n");
            resolve(undefined);
            return;
          }
          if (state.submetido) {
            cleanup();
            // Congela a linha submetida (sem lista de sugestões)
            apagarBloco();
            write(`${simbolo}${state.buffer}\n`);
            resolve(state.buffer);
            return;
          }
          desenhar(state, simbolo);
        }
      };

      const onAbort = (): void => {
        cleanup();
        apagarBloco();
        write("\n");
        resolve(undefined);
      };

      const cleanup = (): void => {
        input.off("data", onData);
        options.signal?.removeEventListener("abort", onAbort);
        if (raw) {
          try {
            input.setRawMode?.(false);
          } catch {
            // ignore
          }
        }
      };

      input.on("data", onData);
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted === true) {
        onAbort();
      }
    });
  };

  const esperar = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      t.unref?.();
    });

  /**
   * Banner de abertura.
   * Instantâneo por padrão (evita “travar” em “abrindo chat…” se o event loop
   * estiver ocupado ou o terminal engolir frames com \\r). Animação só com
   * CODINGPRO_BANNER_ANIM=1.
   */
  const bannerAnimado = async (): Promise<void> => {
    const querAnim =
      tema.cor !== "nenhuma" &&
      /^(1|true|yes|on)$/iu.test((process.env.CODINGPRO_BANNER_ANIM ?? "").trim());

    if (!querAnim) {
      write(tema.banner());
      return;
    }

    const abortado = (): boolean => options.signal?.aborted === true;

    // Faísca curta antes da caixa (flourish de abertura, uma única linha reaproveitada).
    for (let i = 0; i < FAISCA_FRAMES.length && !abortado(); i += 1) {
      write(`\r${CLEAR_LINE}  ${tema.pulso(frameFaisca(i), i)}`);
      await esperar(35);
    }
    write(`\r${CLEAR_LINE}`);

    const linhas = tema.bannerLinhas();
    write("\n");
    for (const linha of linhas) {
      write(`${linha}\n`);
      if (!abortado()) {
        await esperar(16);
      }
    }
  };

  return {
    bannerAnimado,
    close() {
      fechado = true;
      spinner.stop();
      try {
        input.setRawMode?.(false);
      } catch {
        // ignore
      }
      write(SHOW_CURSOR);
    },
    ler,
    spinner,
  };
}
