import { describe, expect, it } from "vitest";
import { decidirModoAcesso, permiteChavePropria } from "../src/main/politica-acesso.js";

describe("política de acesso do desktop", () => {
  it("exige login no app empacotado mesmo quando o PC tem uma chave local", () => {
    expect(decidirModoAcesso({ empacotado: true, temChavePropria: true, temConta: false })).toBe(
      "sem-acesso",
    );
    expect(permiteChavePropria(true)).toBe(false);
  });

  it("aceita a conta cloud no app empacotado", () => {
    expect(decidirModoAcesso({ empacotado: true, temChavePropria: true, temConta: true })).toBe(
      "conta",
    );
  });

  it("preserva chave própria apenas no desenvolvimento", () => {
    expect(decidirModoAcesso({ empacotado: false, temChavePropria: true, temConta: false })).toBe(
      "chave-propria",
    );
    expect(permiteChavePropria(false)).toBe(true);
  });
});
