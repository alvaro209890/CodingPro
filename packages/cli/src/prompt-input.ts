/**
 * Máquina de estado pura do prompt interativo (autocomplete `/` + setas).
 * Sem IO — testável offline. O TTY só aplica teclas e renderiza o estado.
 */

import {
  type ComandoChat,
  COMANDOS_CHAT,
  filtrarSugestoes,
  type SugestaoComando,
} from "./commands.js";

export type Tecla =
  | { readonly type: "char"; readonly value: string }
  | { readonly type: "backspace" }
  | { readonly type: "delete" }
  | { readonly type: "left" }
  | { readonly type: "right" }
  | { readonly type: "home" }
  | { readonly type: "end" }
  | { readonly type: "up" }
  | { readonly type: "down" }
  | { readonly type: "tab" }
  | { readonly type: "enter" }
  | { readonly type: "escape" }
  | { readonly type: "ctrl-c" }
  | { readonly type: "ctrl-d" }
  | { readonly type: "ctrl-u" }
  | { readonly type: "ctrl-w" };

export interface PromptState {
  readonly buffer: string;
  readonly cursor: number;
  readonly sugestoes: readonly SugestaoComando[];
  /** Índice na lista de sugestões; -1 se nenhuma. */
  readonly selecionado: number;
  /** true → a linha está pronta para ser devolvida ao chat. */
  readonly submetido: boolean;
  /** true → EOF / cancelamento (Ctrl+D em buffer vazio ou Ctrl+C). */
  readonly cancelado: boolean;
}

export function estadoInicialPrompt(): PromptState {
  return {
    buffer: "",
    cancelado: false,
    cursor: 0,
    selecionado: -1,
    submetido: false,
    sugestoes: [],
  };
}

function sincronizarSugestoes(
  buffer: string,
  selecionado: number,
  catalogo: readonly ComandoChat[],
): { sugestoes: readonly SugestaoComando[]; selecionado: number } {
  const sugestoes = filtrarSugestoes(buffer, catalogo);
  if (sugestoes.length === 0) {
    return { selecionado: -1, sugestoes };
  }
  const idx =
    selecionado < 0 ? 0 : selecionado >= sugestoes.length ? sugestoes.length - 1 : selecionado;
  return { selecionado: idx, sugestoes };
}

function inserir(
  buffer: string,
  cursor: number,
  texto: string,
): { buffer: string; cursor: number } {
  return {
    buffer: buffer.slice(0, cursor) + texto + buffer.slice(cursor),
    cursor: cursor + texto.length,
  };
}

function apagarTras(buffer: string, cursor: number): { buffer: string; cursor: number } {
  if (cursor <= 0) {
    return { buffer, cursor };
  }
  return {
    buffer: buffer.slice(0, cursor - 1) + buffer.slice(cursor),
    cursor: cursor - 1,
  };
}

function apagarFrente(buffer: string, cursor: number): { buffer: string; cursor: number } {
  if (cursor >= buffer.length) {
    return { buffer, cursor };
  }
  return {
    buffer: buffer.slice(0, cursor) + buffer.slice(cursor + 1),
    cursor,
  };
}

/** Completa o token atual com a sugestão selecionada (ou a primeira). */
export function completarSugestao(state: PromptState): PromptState {
  if (state.sugestoes.length === 0) {
    return state;
  }
  const idx = state.selecionado < 0 ? 0 : state.selecionado;
  const s = state.sugestoes[idx];
  if (s === undefined) {
    return state;
  }
  const completo = s.aceitaArgs ? `${s.match} ` : s.match;
  const sync = sincronizarSugestoes(completo, -1, COMANDOS_CHAT);
  return {
    ...state,
    buffer: completo,
    cursor: completo.length,
    selecionado: sync.selecionado,
    sugestoes: sync.sugestoes,
  };
}

/**
 * Aplica uma tecla ao estado. `catalogo` default = COMANDOS_CHAT.
 * Caracteres de controle (exceto os mapeados) são ignorados.
 */
export function aplicarTecla(
  state: PromptState,
  tecla: Tecla,
  catalogo: readonly ComandoChat[] = COMANDOS_CHAT,
): PromptState {
  if (state.submetido || state.cancelado) {
    return state;
  }

  switch (tecla.type) {
    case "ctrl-c":
      return { ...state, cancelado: true };
    case "ctrl-d":
      if (state.buffer.length === 0) {
        return { ...state, cancelado: true };
      }
      return { ...state, ...apagarFrente(state.buffer, state.cursor) };
    case "enter":
      return { ...state, selecionado: -1, submetido: true, sugestoes: [] };
    case "escape":
      return { ...state, selecionado: -1, sugestoes: [] };
    case "tab":
      return completarSugestao(state);
    case "up": {
      if (state.sugestoes.length === 0) {
        return state;
      }
      const n = state.sugestoes.length;
      const atual = state.selecionado < 0 ? 0 : state.selecionado;
      return { ...state, selecionado: (atual - 1 + n) % n };
    }
    case "down": {
      if (state.sugestoes.length === 0) {
        return state;
      }
      const n = state.sugestoes.length;
      const atual = state.selecionado < 0 ? -1 : state.selecionado;
      return { ...state, selecionado: (atual + 1) % n };
    }
    case "left":
      return { ...state, cursor: Math.max(0, state.cursor - 1) };
    case "right":
      return { ...state, cursor: Math.min(state.buffer.length, state.cursor + 1) };
    case "home":
      return { ...state, cursor: 0 };
    case "end":
      return { ...state, cursor: state.buffer.length };
    case "backspace": {
      const next = apagarTras(state.buffer, state.cursor);
      const sync = sincronizarSugestoes(next.buffer, state.selecionado, catalogo);
      return { ...state, ...next, ...sync };
    }
    case "delete": {
      const next = apagarFrente(state.buffer, state.cursor);
      const sync = sincronizarSugestoes(next.buffer, state.selecionado, catalogo);
      return { ...state, ...next, ...sync };
    }
    case "ctrl-u": {
      const sync = sincronizarSugestoes("", -1, catalogo);
      return { ...state, buffer: "", cursor: 0, ...sync };
    }
    case "ctrl-w": {
      // Apaga a palavra à esquerda do cursor.
      let i = state.cursor;
      while (i > 0 && state.buffer[i - 1] === " ") {
        i -= 1;
      }
      while (i > 0 && state.buffer[i - 1] !== " ") {
        i -= 1;
      }
      const buffer = state.buffer.slice(0, i) + state.buffer.slice(state.cursor);
      const sync = sincronizarSugestoes(buffer, state.selecionado, catalogo);
      return { ...state, buffer, cursor: i, ...sync };
    }
    case "char": {
      // Ignora controles e não-printáveis (exceto espaço/letras unicode).
      if (tecla.value.length === 0) {
        return state;
      }
      const code = tecla.value.codePointAt(0) ?? 0;
      if (code < 32 || (code >= 127 && code <= 159)) {
        return state;
      }
      const next = inserir(state.buffer, state.cursor, tecla.value);
      const sync = sincronizarSugestoes(next.buffer, state.selecionado, catalogo);
      return { ...state, ...next, ...sync };
    }
    default:
      return state;
  }
}

/**
 * Decodifica bytes de terminal em teclas. Aceita sequência parcial no fim
 * (retorna `resto` para o próximo chunk).
 */
export function parseTeclas(entrada: string): { teclas: Tecla[]; resto: string } {
  const teclas: Tecla[] = [];
  let i = 0;
  while (i < entrada.length) {
    const ch = entrada[i] as string;
    const code = ch.charCodeAt(0);

    if (ch === "\r" || ch === "\n") {
      teclas.push({ type: "enter" });
      i += 1;
      // CRLF → uma tecla
      if (ch === "\r" && entrada[i] === "\n") {
        i += 1;
      }
      continue;
    }
    if (ch === "\t") {
      teclas.push({ type: "tab" });
      i += 1;
      continue;
    }
    if (ch === "\x7f" || ch === "\b") {
      teclas.push({ type: "backspace" });
      i += 1;
      continue;
    }
    if (code === 3) {
      teclas.push({ type: "ctrl-c" });
      i += 1;
      continue;
    }
    if (code === 4) {
      teclas.push({ type: "ctrl-d" });
      i += 1;
      continue;
    }
    if (code === 21) {
      teclas.push({ type: "ctrl-u" });
      i += 1;
      continue;
    }
    if (code === 23) {
      teclas.push({ type: "ctrl-w" });
      i += 1;
      continue;
    }
    if (ch === "\x1b") {
      // Escape / CSI — pode estar incompleto
      const rest = entrada.slice(i);
      if (rest.length === 1) {
        return { resto: rest, teclas };
      }
      // ESC sozinho seguido de não-[ → escape
      if (rest[1] !== "[" && rest[1] !== "O") {
        teclas.push({ type: "escape" });
        i += 1;
        continue;
      }
      // CSI: ESC [ ...
      if (rest[1] === "[") {
        // Precisa de ao menos ESC [ X
        if (rest.length < 3) {
          return { resto: rest, teclas };
        }
        // ESC [ n ~  (delete = 3~) — parse manual (sem regex com ESC; Biome noControlCharacters)
        let j = 2; // após ESC [
        while (j < rest.length) {
          const ch = rest[j];
          if (ch === undefined) {
            break;
          }
          if ((ch >= "0" && ch <= "9") || ch === ";") {
            j += 1;
            continue;
          }
          break;
        }
        if (j >= rest.length) {
          return { resto: rest, teclas };
        }
        const params = rest.slice(2, j);
        const final = rest[j] ?? "";
        if (!/[A-Za-z~]/u.test(final)) {
          // desconhecido / incompleto
          return { resto: rest, teclas };
        }
        i += j + 1;
        if (final === "A") {
          teclas.push({ type: "up" });
        } else if (final === "B") {
          teclas.push({ type: "down" });
        } else if (final === "C") {
          teclas.push({ type: "right" });
        } else if (final === "D") {
          teclas.push({ type: "left" });
        } else if (final === "H") {
          teclas.push({ type: "home" });
        } else if (final === "F") {
          teclas.push({ type: "end" });
        } else if (final === "~" && params === "3") {
          teclas.push({ type: "delete" });
        } else if (final === "~" && (params === "1" || params === "7")) {
          teclas.push({ type: "home" });
        } else if (final === "~" && (params === "4" || params === "8")) {
          teclas.push({ type: "end" });
        }
        // demais CSI ignorados
        continue;
      }
      // ESC O A (xterm application mode)
      if (rest[1] === "O") {
        if (rest.length < 3) {
          return { resto: rest, teclas };
        }
        const f = rest[2];
        i += 3;
        if (f === "A") {
          teclas.push({ type: "up" });
        } else if (f === "B") {
          teclas.push({ type: "down" });
        } else if (f === "C") {
          teclas.push({ type: "right" });
        } else if (f === "D") {
          teclas.push({ type: "left" });
        } else if (f === "H") {
          teclas.push({ type: "home" });
        } else if (f === "F") {
          teclas.push({ type: "end" });
        }
        continue;
      }
    }

    // UTF-8 / unicode: pega o code point completo
    teclas.push({ type: "char", value: ch });
    i += 1;
  }
  return { resto: "", teclas };
}

/**
 * Renderização textual do prompt + lista de sugestões (sem ANSI).
 * O TTY aplica cores por cima. Útil em testes e pipe.
 */
export function renderizarPromptTexto(
  state: PromptState,
  simboloPrompt = "❯ ",
): { linha: string; sugestoes: string[]; linhas: number } {
  const linha = `${simboloPrompt}${state.buffer}`;
  const sugestoes = state.sugestoes.map((s, i) => {
    const marca = i === state.selecionado ? "›" : " ";
    return `${marca} ${s.match}  ${s.descricao}`;
  });
  return { linha, linhas: 1 + sugestoes.length, sugestoes };
}
