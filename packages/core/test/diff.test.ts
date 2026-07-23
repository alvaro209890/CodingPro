import { describe, expect, it } from "vitest";
import { diffLinhas, formatarDiff } from "../src/diff.js";

describe("diffLinhas", () => {
  it("marca tudo como contexto quando não há mudança", () => {
    expect(diffLinhas("a\nb", "a\nb")).toEqual([
      { texto: "a", tipo: "ctx" },
      { texto: "b", tipo: "ctx" },
    ]);
  });

  it("detecta uma substituição de linha", () => {
    expect(diffLinhas("a\nb\nc", "a\nX\nc")).toEqual([
      { texto: "a", tipo: "ctx" },
      { texto: "b", tipo: "del" },
      { texto: "X", tipo: "add" },
      { texto: "c", tipo: "ctx" },
    ]);
  });

  it("detecta inserção pura", () => {
    expect(diffLinhas("a\nc", "a\nb\nc")).toEqual([
      { texto: "a", tipo: "ctx" },
      { texto: "b", tipo: "add" },
      { texto: "c", tipo: "ctx" },
    ]);
  });

  it("detecta remoção pura", () => {
    expect(diffLinhas("a\nb\nc", "a\nc")).toEqual([
      { texto: "a", tipo: "ctx" },
      { texto: "b", tipo: "del" },
      { texto: "c", tipo: "ctx" },
    ]);
  });

  it("lida com um lado vazio", () => {
    expect(diffLinhas("", "nova")).toEqual([{ texto: "nova", tipo: "add" }]);
    expect(diffLinhas("velha", "")).toEqual([{ texto: "velha", tipo: "del" }]);
  });
});

describe("formatarDiff", () => {
  it("prefixa +/-/espaço e mantém contexto próximo", () => {
    const saida = formatarDiff(diffLinhas("a\nb\nc", "a\nX\nc"));
    expect(saida).toBe("  a\n- b\n+ X\n  c");
  });

  it("colapsa contexto longo em ⋯", () => {
    const antes = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "alvo"].join("\n");
    const depois = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "NOVO"].join("\n");
    const saida = formatarDiff(diffLinhas(antes, depois), { contexto: 1 });
    expect(saida).toContain("⋯");
    expect(saida).toContain("- alvo");
    expect(saida).toContain("+ NOVO");
    // O começo distante da mudança não aparece.
    expect(saida).not.toContain(" 1");
  });

  it("trunca em maxLinhas com rodapé de excedente", () => {
    const antes = Array.from({ length: 60 }, (_, i) => `l${i}`).join("\n");
    const depois = Array.from({ length: 60 }, (_, i) => `L${i}`).join("\n");
    const saida = formatarDiff(diffLinhas(antes, depois), { contexto: 0, maxLinhas: 10 });
    expect(saida.split("\n")).toHaveLength(11); // 10 + rodapé
    expect(saida).toContain("linhas)");
  });
});
