import { describe, expect, it } from "vitest";
import { criarTema, detectarNivelCor, type NivelCor } from "../src/tema.js";

const ESC = "";
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

  it("TTY sem pistas → 16", () => {
    expect(detectarNivelCor({ TERM: "xterm" }, true)).toBe("16");
  });
});

describe("criarTema", () => {
  it("nível 'nenhuma' produz texto limpo (sem ANSI)", () => {
    const t = criarTema("nenhuma");
    expect(t.banner()).not.toContain(ESC);
    expect(t.banner()).toContain("CodingPro");
    expect(t.progresso("Lendo")).toBe("· Lendo");
    expect(t.cabecalhoProjeto("TS")).toBe("▸ Projeto: TS");
    expect(t.prompt()).toBe("❯ ");
    expect(t.nota("x")).toBe("x");
  });

  it.each<NivelCor>(["truecolor", "256", "16"])(
    "nível %s injeta ANSI e preserva o texto",
    (nivel) => {
      const t = criarTema(nivel);
      expect(t.cor).toBe(nivel);
      const banner = t.banner();
      expect(banner).toContain(ESC);
      expect(semAnsi(banner)).toContain("CodingPro");
      expect(t.ferramenta("edit")).toContain("edit");
      expect(t.sucesso("ok")).toContain("ok");
      expect(t.erro("ruim")).toContain("ruim");
      expect(t.aviso("cuidado")).toContain("cuidado");
      expect(t.destaque("nome")).toContain("nome");
      expect(t.regua()).toContain("─");
      // sempre encerra com reset
      expect(t.progresso("x")).toContain(`${ESC}[0m`);
    },
  );
});
