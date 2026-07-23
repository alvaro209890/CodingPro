import { describe, expect, it } from "vitest";
import {
  barraXp,
  estadoInicialPet,
  estagioPara,
  formatarPet,
  ganharXp,
  limiarNivel,
  nivelDeXp,
  sanitizarPet,
  XP_POR_EDICAO,
  XP_POR_TURNO,
} from "../src/pet.js";

describe("pet — curva de XP", () => {
  it("limiarNivel é 0 no nível 1 e cresce quadraticamente", () => {
    expect(limiarNivel(1)).toBe(0);
    expect(limiarNivel(2)).toBe(50);
    expect(limiarNivel(3)).toBe(150);
    expect(limiarNivel(0)).toBe(0); // clamp para nível 1
  });

  it("nivelDeXp mapeia XP para o maior nível alcançado", () => {
    expect(nivelDeXp(0)).toBe(1);
    expect(nivelDeXp(49)).toBe(1);
    expect(nivelDeXp(50)).toBe(2);
    expect(nivelDeXp(150)).toBe(3);
    expect(nivelDeXp(-10)).toBe(1);
  });
});

describe("pet — estágios", () => {
  it("evolui de ovo a dragão conforme o nível", () => {
    expect(estagioPara(1).nome).toBe("ovo");
    expect(estagioPara(2).nome).toBe("filhote");
    expect(estagioPara(5).nome).toBe("aprendiz");
    expect(estagioPara(7).nome).toBe("coruja");
    expect(estagioPara(12).nome).toBe("dragão");
  });
});

describe("pet — ganho de XP", () => {
  it("turno sem edição soma o base e zera a sequência", () => {
    const inicio = { ...estadoInicialPet(), sequencia: 3 };
    const r = ganharXp(inicio, false);
    expect(r.estado.xp).toBe(XP_POR_TURNO);
    expect(r.estado.sequencia).toBe(0);
    expect(r.subiuNiveis).toBe(0);
  });

  it("turno com edição soma o bônus e incrementa a sequência", () => {
    const r = ganharXp(estadoInicialPet(), true);
    expect(r.estado.xp).toBe(XP_POR_TURNO + XP_POR_EDICAO);
    expect(r.estado.sequencia).toBe(1);
  });

  it("detecta subida de nível", () => {
    // 45 XP → nível 1; +18 (com edição) = 63 → nível 2
    const base = { ...estadoInicialPet(), xp: 45, nivel: 1 };
    const r = ganharXp(base, true);
    expect(r.estado.nivel).toBe(2);
    expect(r.subiuNiveis).toBe(1);
  });

  it("carimba atualizadoEm com o relógio fornecido", () => {
    const agora = new Date("2026-07-23T12:00:00.000Z");
    expect(ganharXp(estadoInicialPet(), false, agora).estado.atualizadoEm).toBe(
      agora.toISOString(),
    );
  });
});

describe("pet — sanitização", () => {
  it("aceita objeto válido e reconcilia o nível a partir do XP", () => {
    const s = sanitizarPet({
      atualizadoEm: "2026-01-01T00:00:00.000Z",
      nivel: 99,
      sequencia: 2,
      xp: 150,
    });
    expect(s.xp).toBe(150);
    expect(s.nivel).toBe(3);
    expect(s.sequencia).toBe(2);
  });

  it("rejeita lixo e devolve o estado inicial", () => {
    expect(sanitizarPet(null).xp).toBe(0);
    expect(sanitizarPet("x").xp).toBe(0);
    expect(sanitizarPet({ xp: -5, sequencia: -1 }).xp).toBe(0);
    expect(sanitizarPet({ xp: Number.NaN }).xp).toBe(0);
    expect(sanitizarPet({ xp: 10, atualizadoEm: 5 }).atualizadoEm).toBe(
      estadoInicialPet().atualizadoEm,
    );
  });
});

describe("pet — formatação", () => {
  it("barraXp reflete o progresso e respeita ASCII", () => {
    const cheia = barraXp({ ...estadoInicialPet(), xp: 49 }, 8, false);
    expect([...cheia].every((c) => c === "▓" || c === "░")).toBe(true);
    const ascii = barraXp({ ...estadoInicialPet(), xp: 25 }, 8, true);
    expect(ascii).toMatch(/^[#-]{8}$/u);
  });

  it("formatarPet mostra ícone, nível, XP e barra", () => {
    const linha = formatarPet({ ...estadoInicialPet(), xp: 60, sequencia: 3 }, false);
    expect(linha).toContain("nível 2");
    expect(linha).toContain("60/150 XP");
    expect(linha).toContain("seq 3");
    expect(linha).toContain("🐣");
    const asciiLinha = formatarPet(estadoInicialPet(), true);
    expect(asciiLinha).toContain("(o)");
    expect(asciiLinha).not.toContain("🥚");
  });
});
