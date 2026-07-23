import { describe, expect, it } from "vitest";
import { PAGINA_EM_BREVE } from "../src/pagina.js";

describe("PAGINA_EM_BREVE", () => {
  it("é um HTML pt-BR completo", () => {
    expect(PAGINA_EM_BREVE).toMatch(/^<!doctype html>/);
    expect(PAGINA_EM_BREVE).toContain('lang="pt-BR"');
    expect(PAGINA_EM_BREVE).toContain('<meta charset="utf-8">');
    expect(PAGINA_EM_BREVE).toContain("</html>");
  });

  it("é responsivo e tem descrição para busca", () => {
    expect(PAGINA_EM_BREVE).toContain('name="viewport"');
    expect(PAGINA_EM_BREVE).toContain('name="description"');
  });

  it("mostra a marca e o comando de instalação da CLI", () => {
    expect(PAGINA_EM_BREVE).toContain("CodingPro");
    expect(PAGINA_EM_BREVE).toContain("npm i -g codingpro");
  });

  it("não referencia nenhum host externo (sem CDN, sem fonte remota)", () => {
    const externos = PAGINA_EM_BREVE.match(/https?:\/\/[^\s"'<)]+/g) ?? [];
    expect(externos).toEqual(["https://github.com/alvaro209890/CodingPro"]);
  });
});
