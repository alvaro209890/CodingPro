import { describe, expect, it } from "vitest";
import {
  amostraTema,
  criarTema,
  DESCRICAO_TEMA,
  detectarAscii,
  detectarNivelCor,
  glifosPara,
  type NivelCor,
  nomeTemaValido,
  PALETAS,
  TEMAS,
  type TemaNome,
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

  it("TTY sem pistas → 16; Windows 7/8.1 → 16; Windows 10/11 → truecolor; WT → truecolor", () => {
    expect(detectarNivelCor({ TERM: "xterm" }, true, "linux")).toBe("16");
    expect(detectarNivelCor({}, true, "win32", "6.1.7601")).toBe("16");
    expect(detectarNivelCor({}, true, "win32", "6.3.9600")).toBe("16");
    expect(detectarNivelCor({}, true, "win32", "10.0.19045")).toBe("truecolor");
    expect(detectarNivelCor({}, true, "win32", "10.0.22631")).toBe("truecolor");
    expect(detectarNivelCor({ WT_SESSION: "1" }, true, "win32")).toBe("truecolor");
  });
});

describe("detectarAscii / glifos", () => {
  it("Windows 7/8.1 → ascii; Windows 10/11 sem WT → unicode; WT e VS Code → unicode", () => {
    expect(detectarAscii({}, "win32", "6.1.7601")).toBe(true);
    expect(detectarAscii({}, "win32", "10.0.19045")).toBe(false);
    expect(detectarAscii({ WT_SESSION: "1" }, "win32")).toBe(false);
    expect(detectarAscii({ TERM_PROGRAM: "vscode" }, "linux")).toBe(false);
    expect(detectarAscii({ CODINGPRO_ASCII: "1" }, "linux")).toBe(true);
    expect(detectarAscii({ CODINGPRO_ASCII: "0" }, "win32", "6.1.7601")).toBe(false);
    expect(detectarAscii({ TERM: "dumb" }, "linux")).toBe(true);
  });

  it("glifos ASCII usam +-| e >", () => {
    const a = glifosPara(true);
    expect(a.cantoTL).toBe("+");
    expect(a.linhaH).toBe("-");
    expect(a.prompt).toBe("> ");
    expect(a.ok).toBe("+");
    const u = glifosPara(false);
    expect(u.prompt).toContain("❯");
    expect(u.cantoTL).toBe("╭");
  });
});

describe("criarTema", () => {
  it("nível 'nenhuma' + unicode padrão produz texto limpo", () => {
    const t = criarTema({ ascii: false, nivel: "nenhuma" });
    expect(t.banner()).not.toContain(ESC);
    expect(t.banner()).toMatch(/CodingPro|DeepSeek|1M|pt-BR/u);
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
    expect(ban).toMatch(/CodingPro|DeepSeek|1M|pt-BR|___/u);
    expect(ban).not.toContain("╭");
    // wordmark grande (várias linhas) + sub + dica
    expect(ban.split("\n").filter((l) => l.trim().length > 0).length).toBeGreaterThanOrEqual(5);
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

  it("bannerLinhas() é uma caixa sólida cujas linhas concatenadas batem com banner()", () => {
    const t = criarTema({ ascii: false, nivel: "truecolor" });
    const linhas = t.bannerLinhas();
    expect(`\n${linhas.join("\n")}\n`).toBe(t.banner());
    const semCor = linhas.map(semAnsi);
    expect(semCor[0]?.startsWith("╭")).toBe(true);
    expect(semCor[0]?.endsWith("╮")).toBe(true);
    expect(semCor.at(-3)?.startsWith("╰")).toBe(true);
    // todas as linhas da caixa (exceto o rodapé fora dela) têm a mesma largura visual
    const largurasCaixa = semCor.slice(0, -2).map((l) => [...l].length);
    expect(new Set(largurasCaixa).size).toBe(1);
  });

  it("bannerLinhas() em ascii usa caixa +-| (sem unicode)", () => {
    const t = criarTema({ ascii: true, nivel: "16" });
    const linhas = t.bannerLinhas().map(semAnsi);
    expect(linhas[0]?.startsWith("+")).toBe(true);
    expect(linhas.some((l) => l.includes("╭"))).toBe(false);
  });

  it("pulso() cicla cores e é identidade em nível 'nenhuma'", () => {
    const t = criarTema({ ascii: false, nivel: "nenhuma" });
    expect(t.pulso("⠋", 0)).toBe("⠋");
    const cor = criarTema({ ascii: false, nivel: "truecolor" });
    expect(cor.pulso("⠋", 0)).toContain(ESC);
    expect(semAnsi(cor.pulso("⠋", 0))).toBe("⠋");
  });
});

describe("temas selecionáveis", () => {
  it("TEMAS lista os 4 nomes e cada um tem paleta + descrição", () => {
    expect([...TEMAS].sort()).toEqual(["aurora", "mono", "neon", "solar"]);
    for (const nome of TEMAS) {
      const p = PALETAS[nome];
      expect(p.gradiente.length).toBeGreaterThanOrEqual(2);
      expect(DESCRICAO_TEMA[nome].length).toBeGreaterThan(0);
    }
  });

  it("nomeTemaValido normaliza e cai em aurora quando inválido", () => {
    expect(nomeTemaValido("SOLAR")).toBe("solar");
    expect(nomeTemaValido(" neon ")).toBe("neon");
    expect(nomeTemaValido("mono")).toBe("mono");
    expect(nomeTemaValido("inexistente")).toBe("aurora");
    expect(nomeTemaValido(undefined)).toBe("aurora");
    expect(nomeTemaValido(42)).toBe("aurora");
  });

  it("criarTema aplica a paleta escolhida e expõe .nome", () => {
    for (const nome of TEMAS) {
      const t = criarTema({ ascii: false, nivel: "truecolor", paleta: nome });
      expect(t.nome).toBe(nome);
    }
    // aurora (default) permanece com o prompt violeta sem cor
    expect(criarTema({ ascii: false, nivel: "nenhuma" }).nome).toBe("aurora");
  });

  it("paletas distintas produzem banners com cores diferentes", () => {
    const aurora = criarTema({ ascii: false, nivel: "truecolor", paleta: "aurora" }).banner();
    const solar = criarTema({ ascii: false, nivel: "truecolor", paleta: "solar" }).banner();
    expect(aurora).not.toBe(solar);
  });

  it("CODINGPRO_TEMA do ambiente vira o tema padrão", () => {
    const orig = process.env.CODINGPRO_TEMA;
    try {
      process.env.CODINGPRO_TEMA = "neon";
      expect(criarTema({ ascii: false, nivel: "nenhuma" }).nome).toBe("neon");
      process.env.CODINGPRO_TEMA = "xyz";
      expect(criarTema({ ascii: false, nivel: "nenhuma" }).nome).toBe("aurora");
    } finally {
      if (orig === undefined) {
        delete process.env.CODINGPRO_TEMA;
      } else {
        process.env.CODINGPRO_TEMA = orig;
      }
    }
  });

  it.each<TemaNome>(["aurora", "solar", "neon", "mono"])(
    "amostraTema(%s) colore em truecolor e degrada em nenhuma/ascii",
    (nome) => {
      expect(amostraTema(nome, "truecolor")).toContain(ESC);
      expect(amostraTema(nome, "nenhuma")).not.toContain(ESC);
      expect(amostraTema(nome, "truecolor", true)).not.toContain(ESC);
      expect(amostraTema(nome, "nenhuma", true)).toMatch(/^#+$/u);
    },
  );
});
