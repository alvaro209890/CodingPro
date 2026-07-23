import { describe, expect, it } from "vitest";
import {
  criarTema,
  detectarAscii,
  detectarNivelCor,
  glifosPara,
  type NivelCor,
} from "../src/tema.js";

const ESC = "\u001b";
const semAnsi = (s: string): string =>
  s
    .split(ESC)
    .map((x: string, i: number) => (i === 0 ? x : x.replace(/^\[[0-9;]*m/u, "")))
    .join("");

describe("detectarNivelCor", () => {
  it("NO_COLOR desliga a cor", () => {
    expect(detectarNivelCor({ NO_COLOR: "1", COLORTERM: "truecolor" }, true)).toBe("nenhuma");
  });

  it("FORCE_COLOR=0 desliga; sem TTY e sem FORCE_COLOR desliga", () => {
    expect(detectarNivelCor({ FORCE_COLOR: "0" }, true)).toBe("nenhuma");
    expect(detectarNivelCor({ COLORTERM: "truecolor" }, false)).toBe("nenhuma");
  });

  it("COLORTERM truecolor/24bit → truecolor; FORCE_COLOR=3 força truecolor sem TTY", () => {
    expect(detectarNivelCor({ COLORTERM: "truecolor" }, true)).toBe("truecolor");
    expect(detectarNivelCor({ COLORTERM: "24bit" }, true)).toBe("truecolor");
    expect(detectarNivelCor({ FORCE_COLOR: "3" }, false)).toBe("truecolor");
  });

  it("TERM com 256 → 256; FORCE_COLOR=2 → 256", () => {
    expect(detectarNivelCor({ TERM: "xterm-256color" }, true)).toBe("256");
    expect(detectarNivelCor({ FORCE_COLOR: "2" }, false)).toBe("256");
  });

  it("TTY sem pistas → 16; Windows CMD → 16; WT → truecolor", () => {
    expect(detectarNivelCor({ TERM: "xterm" }, true)).toBe("16");
    expect(detectarNivelCor({}, true, "win32")).toBe("16");
    expect(detectarNivelCor({ WT_SESSION: "1" }, true, "win32")).toBe("truecolor");
  });
});

describe("detectarAscii / glifos", () => {
  it("Windows sem WT → ascii; WT e VS Code → unicode", () => {
    expect(detectarAscii({}, "win32")).toBe(true);
    expect(detectarAscii({ WT_SESSION: "1" }, "win32")).toBe(false);
    expect(detectarAscii({ TERM_PROGRAM: "vscode" }, "linux")).toBe(false);
    expect(detectarAscii({ CODINGPRO_ASCII: "1" }, "linux")).toBe(true);
    expect(detectarAscii({ CODINGPRO_ASCII: "0" }, "win32")).toBe(false);
    expect(detectarAscii({ TERM: "dumb" }, "linux")).toBe(true);
  });

  it("glifos ASCII usam +-| e >", () => {
    const a = glifosPara(true);
    expect(a.boxTop.startsWith("+")).toBe(true);
    expect(a.prompt).toBe("> ");
    expect(a.ok).toBe("+");
    const u = glifosPara(false);
    expect(u.prompt).toContain("❯");
  });
});

describe("criarTema", () => {
  it("nível 'nenhuma' + unicode padrão produz texto limpo", () => {
    const t = criarTema({ ascii: false, nivel: "nenhuma" });
    expect(t.banner()).not.toContain(ESC);
    expect(t.banner()).toMatch(/DeepSeek|1M|pt-BR|████|___/u);
    expect(t.progresso("Lendo")).toBe("· Lendo");
    expect(t.cabecalhoProjeto("TS")).toBe("▸ Projeto: TS");
    expect(t.prompt()).toBe("❯ ");
    expect(t.nota("x")).toBe("x");
    expect(t.statusLinha("sessão $0 · ctx 1k")).toContain("ctx 1k");
  });

  it("modo ascii é legível no CMD (sem box unicode)", () => {
    const t = criarTema({ ascii: true, nivel: "16" });
    expect(t.ascii).toBe(true);
    const ban = semAnsi(t.banner());
    expect(ban).toContain("+--");
    expect(ban).toMatch(/DeepSeek|1M|pt-BR|____/u);
    expect(ban).not.toContain("╭");
    expect(t.prompt()).toContain(">");
    expect(semAnsi(t.progresso("ok"))).toMatch(/^\* /u);
    expect(semAnsi(t.sucesso("feito"))).toContain("+");
    expect(semAnsi(t.regua())).toMatch(/^-{10,}/u);
    expect(semAnsi(t.statusLinha("$0.01 · ctx"))).toContain("ctx");
  });

  it.each<NivelCor>(["truecolor", "256", "16"])(
    "nível %s injeta ANSI e preserva o texto",
    (nivel) => {
      const t = criarTema({ ascii: false, nivel });
      expect(t.cor).toBe(nivel);
      const banner = t.banner();
      expect(banner).toContain(ESC);
      expect(semAnsi(banner).length).toBeGreaterThan(20);
      expect(t.ferramenta("edit")).toContain("edit");
      expect(t.sucesso("ok")).toContain("ok");
      expect(t.erro("ruim")).toContain("ruim");
      expect(t.aviso("cuidado")).toContain("cuidado");
      expect(t.destaque("nome")).toContain("nome");
      expect(t.regua().length).toBeGreaterThan(10);
      expect(t.progresso("x")).toContain(`${ESC}[0m`);
      expect(t.statusLinha("tok")).toContain("tok");
    },
  );
});
