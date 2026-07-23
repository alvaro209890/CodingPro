import { describe, expect, it } from "vitest";
import type { CostBreakdown } from "@codingpro/llm";
import {
  atualizarEstimativaContexto,
  atualizarStatsAposTurno,
  barraContexto,
  COMPACT_TARGET_RATIO,
  contextoRestante,
  criarSessionStats,
  DEFAULT_CONTEXT_BUDGET,
  DEEPSEEK_CONTEXT_WINDOW,
  estimarTokensTranscrito,
  formatarStatusLinha,
  percentContexto,
  resolverOrcamentoContexto,
} from "../src/status.js";

const custo: CostBreakdown = {
  cacheHitRate: 0.5,
  cacheMissTokens: 50,
  cacheReadTokens: 50,
  inputCostUsd: 0.001,
  inputTokens: 100,
  model: "deepseek-v4-pro",
  outputCostUsd: 0.002,
  outputTokens: 20,
  reasoningTokens: 0,
  totalCostUsd: 0.003,
};

describe("status — sessão e contexto", () => {
  it("constantes DeepSeek 1M e default 800k", () => {
    expect(DEEPSEEK_CONTEXT_WINDOW).toBe(1_000_000);
    expect(DEFAULT_CONTEXT_BUDGET).toBe(800_000);
    expect(COMPACT_TARGET_RATIO).toBeLessThan(1);
  });

  it("resolverOrcamentoContexto limita à janela", () => {
    expect(resolverOrcamentoContexto(undefined)).toBe(DEFAULT_CONTEXT_BUDGET);
    expect(resolverOrcamentoContexto(50_000)).toBe(50_000);
    expect(resolverOrcamentoContexto(9_999_999)).toBe(DEEPSEEK_CONTEXT_WINDOW - 1_000);
    expect(resolverOrcamentoContexto(0)).toBe(DEFAULT_CONTEXT_BUDGET);
  });

  it("estima tokens e atualiza stats após turno", () => {
    const msgs = [
      { content: "system " + "x".repeat(40), role: "system" as const },
      { content: "oi " + "y".repeat(40), role: "user" as const },
    ];
    expect(estimarTokensTranscrito(msgs)).toBeGreaterThan(10);

    let s = criarSessionStats(1000);
    s = atualizarStatsAposTurno(s, custo, msgs, "Pro");
    expect(s.turns).toBe(1);
    expect(s.totalCostUsd).toBeCloseTo(0.003);
    expect(s.inputTokens).toBe(100);
    expect(s.outputTokens).toBe(20);
    expect(s.lastModel).toBe("Pro");
    expect(s.contextTokens).toBeGreaterThan(0);

    s = atualizarEstimativaContexto(s, []);
    expect(s.contextTokens).toBe(0);
  });

  it("barra, percent e linha de status", () => {
    const s = {
      ...criarSessionStats(1000),
      contextTokens: 250,
      inputTokens: 100,
      cacheReadTokens: 40,
      totalCostUsd: 0.01,
      turns: 1,
      lastModel: "Flash",
    };
    expect(percentContexto(s)).toBe(25);
    expect(contextoRestante(s)).toBe(750);
    expect(barraContexto(25, 10, true)).toContain("#");
    expect(barraContexto(25, 10, false)).toContain("█");
    const linha = formatarStatusLinha(s, true);
    expect(linha).toContain("Flash");
    expect(linha).toContain("rest");
    expect(linha).toMatch(/ctx|1\.00k|250/u);
  });
});
