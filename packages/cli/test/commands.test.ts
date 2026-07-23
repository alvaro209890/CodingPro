import { describe, expect, it } from "vitest";
import {
  COMANDOS_CHAT,
  filtrarSugestoes,
  textoAjudaComandos,
  tokenComando,
} from "../src/commands.js";

describe("commands — catálogo e filtro", () => {
  it("catálogo tem os comandos essenciais", () => {
    const nomes = COMANDOS_CHAT.map((c) => c.nome);
    expect(nomes).toContain("/ajuda");
    expect(nomes).toContain("/sair");
    expect(nomes).toContain("/undo");
    expect(nomes).toContain("/plan");
  });

  it("tokenComando só ativa com prefixo / sem espaço", () => {
    expect(tokenComando("/aju")).toBe("/aju");
    expect(tokenComando("/")).toBe("/");
    expect(tokenComando("olá")).toBeUndefined();
    expect(tokenComando("/plan objetivo")).toBeUndefined();
  });

  it("filtrarSugestoes casa por prefixo e aliases", () => {
    const todos = filtrarSugestoes("/");
    expect(todos.length).toBe(COMANDOS_CHAT.length);

    const aju = filtrarSugestoes("/aju");
    expect(aju.map((s) => s.nome)).toEqual(["/ajuda"]);

    const exit = filtrarSugestoes("/ex");
    expect(exit.some((s) => s.match === "/exit" || s.nome === "/sair")).toBe(true);

    const des = filtrarSugestoes("/des");
    expect(des.some((s) => s.nome === "/undo")).toBe(true);

    // /theme é alias de /tema
    const theme = filtrarSugestoes("/the");
    expect(theme.some((s) => s.nome === "/tema" && s.match === "/theme")).toBe(true);
    expect(filtrarSugestoes("/pet").some((s) => s.nome === "/pet")).toBe(true);
  });

  it("textoAjudaComandos lista cada comando", () => {
    const t = textoAjudaComandos();
    expect(t).toContain("Comandos:");
    expect(t).toContain("/mapa");
    expect(t).toContain("/custo");
  });
});
