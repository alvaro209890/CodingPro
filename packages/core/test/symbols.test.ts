import { describe, expect, it } from "vitest";
import {
  extrairSimbolos,
  type Linguagem,
  linguagemDeArquivo,
  SYMBOLS_MAX_SIMBOLOS,
} from "../src/symbols.js";

function nomes(linguagem: Linguagem, texto: string): string[] {
  return extrairSimbolos(linguagem, texto).map((s) => s.nome);
}

describe("linguagemDeArquivo", () => {
  it("mapeia extensões conhecidas", () => {
    expect(linguagemDeArquivo("src/a.ts")).toBe("ts");
    expect(linguagemDeArquivo("A.TSX")).toBe("ts");
    expect(linguagemDeArquivo("x.py")).toBe("python");
    expect(linguagemDeArquivo("Main.kt")).toBe("java");
    expect(linguagemDeArquivo("m.go")).toBe("go");
    expect(linguagemDeArquivo("schema.sql")).toBe("sql");
  });

  it("devolve undefined para extensões não indexáveis", () => {
    expect(linguagemDeArquivo("README.md")).toBeUndefined();
    expect(linguagemDeArquivo("sem-extensao")).toBeUndefined();
  });
});

describe("extrairSimbolos TS/JS", () => {
  it("acha function, class, interface, type e const de topo", () => {
    const texto = [
      "export function alfa() {}",
      "async function beta() {}",
      "export class Gama {}",
      "interface Delta { x: number }",
      "export type Epsilon = string;",
      "export const zeta = 1;",
      "const eta = () => 2;",
      "  const naoTopoNaoExport = 3;",
    ].join("\n");
    const s = extrairSimbolos("ts", texto);
    expect(s.map((x) => x.nome)).toEqual([
      "alfa",
      "beta",
      "Gama",
      "Delta",
      "Epsilon",
      "zeta",
      "eta",
    ]);
    expect(s.find((x) => x.nome === "eta")?.tipo).toBe("função");
    expect(s.find((x) => x.nome === "zeta")?.tipo).toBe("constante");
    expect(s.find((x) => x.nome === "alfa")?.linha).toBe(1);
  });

  it("não captura const local não exportado sem arrow", () => {
    expect(nomes("ts", "  const local = 42;")).toEqual([]);
  });
});

describe("extrairSimbolos outras linguagens", () => {
  it("Python separa função de método por indentação", () => {
    const s = extrairSimbolos(
      "python",
      "class Foo:\n    def metodo(self):\n        pass\ndef livre():\n    pass",
    );
    expect(s.map((x) => `${x.tipo}:${x.nome}`)).toEqual([
      "classe:Foo",
      "método:metodo",
      "função:livre",
    ]);
  });

  it("Go acha func e type", () => {
    expect(
      nomes("go", "func Somar(a int) int { return a }\ntype Ponto struct{}\nfunc (p Ponto) M() {}"),
    ).toEqual(["Somar", "Ponto", "M"]);
  });

  it("Kotlin/Java acha class, interface e fun", () => {
    expect(nomes("java", "public class Servico {}\ninterface Repo {}\nfun processar() {}")).toEqual(
      ["Servico", "Repo", "processar"],
    );
  });

  it("SQL acha create table e function", () => {
    const s = extrairSimbolos(
      "sql",
      "CREATE TABLE clientes (id int);\ncreate or replace function calc() returns int",
    );
    expect(s.map((x) => `${x.tipo}:${x.nome}`)).toEqual(["tabela:clientes", "função:calc"]);
  });
});

describe("tetos", () => {
  it("respeita o teto de símbolos por arquivo", () => {
    const linhas = Array.from(
      { length: SYMBOLS_MAX_SIMBOLOS + 50 },
      (_, i) => `function f${i}() {}`,
    );
    expect(extrairSimbolos("ts", linhas.join("\n"))).toHaveLength(SYMBOLS_MAX_SIMBOLOS);
  });

  it("texto vazio não gera símbolos", () => {
    expect(extrairSimbolos("ts", "")).toEqual([]);
  });
});
