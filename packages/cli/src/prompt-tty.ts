/**
 * Prompt interativo em TTY: raw mode, autocomplete `/` com setas, redraw e animações.
 * Em não-TTY (pipe/testes) o index continua usando `criarLeitorDeLinhas`.
 */

import type { Readable, Writable } from "node:stream";
import { COMANDOS_CHAT, type ComandoChat } from "./commands.js";
import {
  aplicarTecla,
  estadoInicialPrompt,
  parseTeclas,
  type PromptState,
} from "./prompt-input.js";
import type { Tema } from "./tema.js";
import { criarSpinner, framesBannerAbertura, type SpinnerHandle } from "./animacao.js";

const ESC = "\u001b";
const HIDE_CURSOR = `${ESC}[?25l`;
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

  const bannerAnimado = async (): Promise<void> => {
    write(HIDE_CURSOR);
    const frames = 10;
    const linhasBanner = 6;
    for (let t = 0; t < frames; t += 1) {
      if (t > 0) {
        write(`${CURSOR_UP(linhasBanner - 1)}\r`);
      }
      const corpo = framesBannerAbertura(t, tema.ascii);
      const colorido = corpo
        .split("\n")
        .map((linha, i) => {
          // palavra CodingPro no meio
          if (i === 2) {
            return tema.destaque(linha);
          }
          return tema.nota(linha);
        })
        .join("\n");
      write(`${colorido}\n`);
      await new Promise((r) => setTimeout(r, 40));
    }
    write(SHOW_CURSOR);
    write(`\n${tema.regua()}\n`);
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
