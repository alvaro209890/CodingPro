import { describe, expect, it } from "vitest";
import {
  diretrizAtribuicao,
  MODO_ATRIBUICAO_PADRAO,
  modoAtribuicaoValido,
} from "../src/attribution.js";

describe("atribuição de commits", () => {
  it("valida o modo com fallback para o padrão", () => {
    expect(modoAtribuicaoValido("none")).toBe("none");
    expect(modoAtribuicaoValido("trailer")).toBe("trailer");
    expect(modoAtribuicaoValido("full")).toBe("full");
    expect(modoAtribuicaoValido("xpto")).toBe(MODO_ATRIBUICAO_PADRAO);
    expect(modoAtribuicaoValido(undefined)).toBe("full");
  });

  it("diretriz reflete o modo", () => {
    expect(diretrizAtribuicao("none")).toContain("NÃO inclua");
    expect(diretrizAtribuicao("none")).toContain("undercover");
    expect(diretrizAtribuicao("trailer")).toContain("linha curta");
    expect(diretrizAtribuicao("full")).toContain("Co-Authored-By");
  });
});
