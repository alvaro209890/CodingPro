import { describe, expect, it } from "vitest";
import {
  aplicarTecla,
  completarSugestao,
  estadoInicialPrompt,
  parseTeclas,
  renderizarPromptTexto,
  type PromptState,
} from "../src/prompt-input.js";

function digitar(s: PromptState, texto: string): PromptState {
  let cur = s;
  for (const c of texto) {
    cur = aplicarTecla(cur, { type: "char", value: c });
  }
  return cur;
}

describe("prompt-input — state machine", () => {
  it("digitar / abre sugestões; setas navegam; tab completa", () => {
    let s = estadoInicialPrompt();
    s = aplicarTecla(s, { type: "char", value: "/" });
    expect(s.sugestoes.length).toBeGreaterThan(5);
    expect(s.selecionado).toBe(0);

    s = aplicarTecla(s, { type: "down" });
    expect(s.selecionado).toBe(1);
    s = aplicarTecla(s, { type: "up" });
    expect(s.selecionado).toBe(0);

    s = digitar(estadoInicialPrompt(), "/cu");
    expect(s.buffer).toBe("/cu");
    expect(s.sugestoes.some((x) => x.nome === "/custo")).toBe(true);

    s = completarSugestao(s);
    expect(s.buffer.startsWith("/custo")).toBe(true);
  });

  it("Enter submete; Escape fecha sugestões; Ctrl+D vazio cancela", () => {
    let s = digitar(estadoInicialPrompt(), "oi");
    s = aplicarTecla(s, { type: "enter" });
    expect(s.submetido).toBe(true);
    expect(s.buffer).toBe("oi");

    s = digitar(estadoInicialPrompt(), "/");
    expect(s.sugestoes.length).toBeGreaterThan(0);
    s = aplicarTecla(s, { type: "escape" });
    expect(s.sugestoes).toEqual([]);

    s = aplicarTecla(estadoInicialPrompt(), { type: "ctrl-d" });
    expect(s.cancelado).toBe(true);

    s = aplicarTecla(estadoInicialPrompt(), { type: "ctrl-c" });
    expect(s.cancelado).toBe(true);
  });

  it("backspace, delete, left/right, home/end, ctrl-u e ctrl-w", () => {
    let s = digitar(estadoInicialPrompt(), "/mapa x");
    expect(s.buffer).toBe("/mapa x");
    s = aplicarTecla(s, { type: "left" });
    s = aplicarTecla(s, { type: "backspace" });
    expect(s.buffer).toBe("/mapax");
    s = aplicarTecla(s, { type: "end" });
    s = aplicarTecla(s, { type: "ctrl-w" });
    expect(s.buffer).toBe("");

    s = digitar(estadoInicialPrompt(), "ab");
    s = aplicarTecla(s, { type: "home" });
    s = aplicarTecla(s, { type: "delete" });
    expect(s.buffer).toBe("b");
    s = aplicarTecla(s, { type: "right" });
    s = aplicarTecla(s, { type: "left" });
    s = aplicarTecla(s, { type: "ctrl-u" });
    expect(s.buffer).toBe("");
    expect(s.cursor).toBe(0);
  });

  it("Ctrl+D com texto apaga à frente; ignorar char de controle; noop se já submetido", () => {
    let s = digitar(estadoInicialPrompt(), "xy");
    s = aplicarTecla(s, { type: "home" });
    s = aplicarTecla(s, { type: "ctrl-d" });
    expect(s.buffer).toBe("y");
    expect(s.cancelado).toBe(false);

    s = aplicarTecla(s, { type: "char", value: "\x01" });
    expect(s.buffer).toBe("y");

    s = aplicarTecla(s, { type: "enter" });
    const frozen = aplicarTecla(s, { type: "char", value: "z" });
    expect(frozen.buffer).toBe("y");
    expect(frozen.submetido).toBe(true);
  });

  it("up/down sem sugestões não mudam; tab sem lista é noop; completar aceitaArgs", () => {
    let s = digitar(estadoInicialPrompt(), "oi");
    expect(s.sugestoes).toEqual([]);
    expect(aplicarTecla(s, { type: "up" }).selecionado).toBe(-1);
    expect(aplicarTecla(s, { type: "down" }).selecionado).toBe(-1);
    expect(completarSugestao(s).buffer).toBe("oi");

    s = digitar(estadoInicialPrompt(), "/plan");
    // /plan aceita args → completa com espaço
    s = completarSugestao(s);
    expect(s.buffer).toMatch(/^\/plan\s?$/u);
  });

  it("parseTeclas decodifica setas CSI, application mode, tab, enter e UTF-8", () => {
    expect(parseTeclas("\x1b[A").teclas).toEqual([{ type: "up" }]);
    expect(parseTeclas("\x1b[B").teclas).toEqual([{ type: "down" }]);
    expect(parseTeclas("\x1b[C").teclas).toEqual([{ type: "right" }]);
    expect(parseTeclas("\x1b[D").teclas).toEqual([{ type: "left" }]);
    expect(parseTeclas("\x1b[H").teclas).toEqual([{ type: "home" }]);
    expect(parseTeclas("\x1b[F").teclas).toEqual([{ type: "end" }]);
    expect(parseTeclas("\x1b[3~").teclas).toEqual([{ type: "delete" }]);
    expect(parseTeclas("\x1b[1~").teclas).toEqual([{ type: "home" }]);
    expect(parseTeclas("\x1b[4~").teclas).toEqual([{ type: "end" }]);
    expect(parseTeclas("\x1bOA").teclas).toEqual([{ type: "up" }]);
    expect(parseTeclas("\x1bOB").teclas).toEqual([{ type: "down" }]);
    expect(parseTeclas("\x1bOC").teclas).toEqual([{ type: "right" }]);
    expect(parseTeclas("\x1bOD").teclas).toEqual([{ type: "left" }]);
    expect(parseTeclas("\x1bOH").teclas).toEqual([{ type: "home" }]);
    expect(parseTeclas("\x1bOF").teclas).toEqual([{ type: "end" }]);
    expect(parseTeclas("\t").teclas).toEqual([{ type: "tab" }]);
    expect(parseTeclas("\r\n").teclas).toEqual([{ type: "enter" }]);
    expect(parseTeclas("\x7f").teclas).toEqual([{ type: "backspace" }]);
    expect(parseTeclas("\b").teclas).toEqual([{ type: "backspace" }]);
    expect(parseTeclas("\x03").teclas).toEqual([{ type: "ctrl-c" }]);
    expect(parseTeclas("\x04").teclas).toEqual([{ type: "ctrl-d" }]);
    expect(parseTeclas("\x15").teclas).toEqual([{ type: "ctrl-u" }]);
    expect(parseTeclas("\x17").teclas).toEqual([{ type: "ctrl-w" }]);
    expect(parseTeclas("\x1bz").teclas[0]).toEqual({ type: "escape" });
    expect(parseTeclas("ção").teclas.map((t) => (t.type === "char" ? t.value : t.type))).toEqual([
      "ç",
      "ã",
      "o",
    ]);
    // sequência incompleta fica no resto
    expect(parseTeclas("\x1b[").resto).toBe("\x1b[");
    expect(parseTeclas("\x1b").resto).toBe("\x1b");
    expect(parseTeclas("\x1bO").resto).toBe("\x1bO");
  });

  it("renderizarPromptTexto inclui seleção", () => {
    const s = digitar(estadoInicialPrompt(), "/");
    const r = renderizarPromptTexto(s, "❯ ");
    expect(r.linha.startsWith("❯ /")).toBe(true);
    expect(r.sugestoes.length).toBeGreaterThan(0);
    expect(r.sugestoes[0]).toMatch(/^› /u);
  });
});
