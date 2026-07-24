import { describe, expect, it } from "vitest";
import {
  type AutoEffortState,
  atualizarAutoEffort,
  criarAutoEffortState,
  prepararAutoEffort,
  resolverAutoEffort,
} from "../src/auto-effort.js";

describe("auto-effort", () => {
  it("começa com zero falhas e contexto vazio", () => {
    const s = criarAutoEffortState();
    expect(s.falhasConsecutivas).toBe(0);
    expect(s.tokensContexto).toBe(0);
    expect(s.toolsAtivas).toEqual([]);
  });

  it("escolhe Flash para contexto pequeno e sem tools pesadas", () => {
    const s: AutoEffortState = {
      falhasConsecutivas: 0,
      tokensContexto: 1000,
      toolsAtivas: ["read_file"],
    };
    expect(resolverAutoEffort(s)).toBe("fast");
  });

  it("escala para Pro com contexto grande (>8000 tokens)", () => {
    const s: AutoEffortState = { falhasConsecutivas: 0, tokensContexto: 10_000, toolsAtivas: [] };
    expect(resolverAutoEffort(s)).toBe("auto");
  });

  it("escala para Pro quando há falha consecutiva", () => {
    const s: AutoEffortState = { falhasConsecutivas: 1, tokensContexto: 10, toolsAtivas: [] };
    expect(resolverAutoEffort(s)).toBe("auto");
  });

  it("escala para Pro com edit_file ativa", () => {
    const s: AutoEffortState = {
      falhasConsecutivas: 0,
      tokensContexto: 100,
      toolsAtivas: ["read_file", "edit_file"],
    };
    expect(resolverAutoEffort(s)).toBe("auto");
  });

  it("escala para Pro com task ativa", () => {
    const s: AutoEffortState = {
      falhasConsecutivas: 0,
      tokensContexto: 100,
      toolsAtivas: ["task"],
    };
    expect(resolverAutoEffort(s)).toBe("auto");
  });

  it("escala para Pro com repo_map ativa", () => {
    const s: AutoEffortState = {
      falhasConsecutivas: 0,
      tokensContexto: 100,
      toolsAtivas: ["repo_map"],
    };
    expect(resolverAutoEffort(s)).toBe("auto");
  });

  it("escala para Pro com bash ativa", () => {
    const s: AutoEffortState = {
      falhasConsecutivas: 0,
      tokensContexto: 100,
      toolsAtivas: ["bash"],
    };
    expect(resolverAutoEffort(s)).toBe("auto");
  });

  it("atualizarAutoEffort incrementa falhas", () => {
    const s = criarAutoEffortState();
    atualizarAutoEffort(s, true);
    expect(s.falhasConsecutivas).toBe(1);
    atualizarAutoEffort(s, true);
    expect(s.falhasConsecutivas).toBe(2);
  });

  it("atualizarAutoEffort reseta falhas no sucesso", () => {
    const s = criarAutoEffortState();
    s.falhasConsecutivas = 3;
    atualizarAutoEffort(s, false);
    expect(s.falhasConsecutivas).toBe(0);
  });

  it("prepararAutoEffort atualiza contexto e tools", () => {
    const s = criarAutoEffortState();
    prepararAutoEffort(s, 5000, ["read_file", "list_dir"]);
    expect(s.tokensContexto).toBe(5000);
    expect(s.toolsAtivas).toEqual(["read_file", "list_dir"]);
  });

  it("múltiplas falhas consecutivas mantêm Pro", () => {
    const s = criarAutoEffortState();
    atualizarAutoEffort(s, true);
    atualizarAutoEffort(s, true);
    expect(resolverAutoEffort(s)).toBe("auto");
    // Sucesso reseta
    atualizarAutoEffort(s, false);
    expect(s.falhasConsecutivas).toBe(0);
  });
});
