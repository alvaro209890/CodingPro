import { describe, expect, it } from "vitest";
import { formatarSaldoUsd, parseSaldoMicro } from "../src/shared/saldo-conta.js";

/**
 * Saldo da conta Cloud — o proxy devolve micro-dólares (US$ × 1e6) no header
 * `x-codingpro-creditos-micro` de toda resposta. O parse é a fronteira confiável
 * entre o main (captura) e o badge da UI.
 */
describe("parse do header do proxy", () => {
  it("interpreta micro-dólares inteiros", () => {
    expect(parseSaldoMicro("1234567")).toBe(1_234_567);
    expect(parseSaldoMicro("0")).toBe(0);
    expect(parseSaldoMicro("1000000")).toBe(1_000_000);
  });

  it("aceita espaços ao redor", () => {
    expect(parseSaldoMicro("  42  ")).toBe(42);
  });

  it("rejeita ausência, vazio, negativo, decimal e texto", () => {
    expect(parseSaldoMicro(undefined)).toBeUndefined();
    expect(parseSaldoMicro(null)).toBeUndefined();
    expect(parseSaldoMicro("")).toBeUndefined();
    expect(parseSaldoMicro("abc")).toBeUndefined();
    expect(parseSaldoMicro("-5")).toBeUndefined();
    expect(parseSaldoMicro("1.5")).toBeUndefined();
    expect(parseSaldoMicro("1e6")).toBeUndefined();
  });
});

describe("formatação em dólares pt-BR", () => {
  it("converte micro em US$ com 2 casas", () => {
    // O Intl pt-BR usa espaço não-separável (U+00A0) entre "US$" e o valor;
    // NFKC o normaliza para espaço comum — visual idêntico no badge.
    expect(formatarSaldoUsd(1_234_567).normalize("NFKC")).toBe("US$ 1,23");
    expect(formatarSaldoUsd(0).normalize("NFKC")).toBe("US$ 0,00");
    expect(formatarSaldoUsd(99_999_999).normalize("NFKC")).toBe("US$ 100,00");
  });
});
