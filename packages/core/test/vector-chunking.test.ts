import { describe, expect, it } from "vitest";
import { CHUNK_MAX_CHARS, fragmentarCodigo } from "../src/vector/chunking.js";

describe("fragmentarCodigo", () => {
  it("arquivo curto vira um chunk", () => {
    const chunks = fragmentarCodigo("src/a.ts", "export function hello() {\n  return 1;\n}\n");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[0]?.content).toContain("hello");
    expect(chunks[0]?.lang).toBe("ts");
  });

  it("vazio não gera chunks", () => {
    expect(fragmentarCodigo("x.ts", "")).toEqual([]);
  });

  it("python e go geram chunks com def/func no conteúdo", () => {
    const pyBody = [
      "class A:\n  pass\n",
      ...Array.from({ length: 40 }, (_u, i) => `    x${i} = ${i}`),
      "\ndef foo():\n  return 1\n",
      ...Array.from({ length: 40 }, (_u, i) => `    y${i} = ${i}`),
      "\ndef bar():\n  return 2\n",
    ].join("\n");
    const py = fragmentarCodigo("m.py", pyBody);
    expect(py.length).toBeGreaterThanOrEqual(2);
    expect(py.some((c) => c.content.includes("def foo"))).toBe(true);

    const go = fragmentarCodigo("m.go", "package main\n\nfunc Alpha() {}\n\nfunc Beta() {}\n");
    expect(go.length).toBeGreaterThanOrEqual(1);
    expect(go.some((c) => c.content.includes("Alpha") || c.content.includes("func"))).toBe(true);
  });

  it("java/sql headers e truncamento de chunk enorme", () => {
    const java = fragmentarCodigo(
      "A.java",
      "public class A {\n  void m() {}\n}\npublic interface B {}\n",
    );
    expect(java.length).toBeGreaterThanOrEqual(1);

    const sql = fragmentarCodigo(
      "s.sql",
      "CREATE TABLE users (id INT);\nCREATE TABLE orders (id INT);\n",
    );
    expect(sql.length).toBeGreaterThanOrEqual(1);

    const huge = "export function z() {\n" + "  x();\n".repeat(500) + "}\n";
    const chunks = fragmentarCodigo("huge.ts", huge);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.content.length <= CHUNK_MAX_CHARS + 10)).toBe(true);
  });

  it("arquivo longo sem headers usa janela", () => {
    const linhas = Array.from({ length: 200 }, (_u, i) => `// linha ${i}`);
    const chunks = fragmentarCodigo("big.js", linhas.join("\n"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.path).toBe("big.js");
  });

  it("ts com várias export function gera vários chunks", () => {
    const body = Array.from(
      { length: 5 },
      (_u, i) =>
        `export function fn${i}() {\n${Array.from({ length: 30 }, (_v, j) => `  const x${j} = ${j};`).join("\n")}\n}\n`,
    ).join("\n");
    const chunks = fragmentarCodigo("many.ts", body);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it("bloco enorme entre dois headers é fatiado em janelas", () => {
    const mid = Array.from({ length: 130 }, (_u, i) => `  const z${i} = ${i};`).join("\n");
    const body = `export function alpha() {\n${mid}\n}\nexport function beta() {\n  return 1;\n}\n`;
    const chunks = fragmentarCodigo("huge-fn.ts", body);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });
});
