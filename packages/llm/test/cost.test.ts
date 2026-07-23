import { describe, expect, it } from "vitest";
import { DEEPSEEK_PRICING, estimateCost, formatCost, somarCustos } from "../src/cost.js";
import { DEEPSEEK_MODEL_FLASH, DEEPSEEK_MODEL_PRO } from "../src/providers/deepseek.js";
import type { TokenUsage } from "../src/provider.js";

describe("estimateCost", () => {
  it("cobra cache-miss e cache-hit com preços distintos e output à parte", () => {
    const usage: TokenUsage = {
      cacheReadInputTokens: 800_000,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningTokens: 300_000,
    };
    const cost = estimateCost(usage, DEEPSEEK_MODEL_PRO);
    expect(cost.cacheMissTokens).toBe(200_000);
    expect(cost.cacheReadTokens).toBe(800_000);
    expect(cost.cacheHitRate).toBeCloseTo(0.8, 10);
    // 0,2M*0,435 + 0,8M*0,0036 = 0,087 + 0,00288 = 0,08988
    expect(cost.inputCostUsd).toBeCloseTo(0.08988, 8);
    expect(cost.outputCostUsd).toBeCloseTo(0.87, 8);
    expect(cost.totalCostUsd).toBeCloseTo(0.95988, 8);
    expect(cost.reasoningTokens).toBe(300_000);
  });

  it("usa a tabela do Flash (mais barata) e trata usage sem cache", () => {
    const usage: TokenUsage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    const cost = estimateCost(usage, DEEPSEEK_MODEL_FLASH);
    expect(cost.cacheReadTokens).toBe(0);
    expect(cost.cacheHitRate).toBe(0);
    expect(cost.inputCostUsd).toBeCloseTo(0.0435, 8);
    expect(cost.outputCostUsd).toBeCloseTo(0.087, 8);
  });

  it("limita cache read ao total e zera a taxa quando não há input", () => {
    const strange: TokenUsage = {
      cacheReadInputTokens: 5_000,
      inputTokens: 1_000,
      outputTokens: 0,
    };
    const cost = estimateCost(strange, DEEPSEEK_MODEL_PRO);
    expect(cost.cacheReadTokens).toBe(1_000);
    expect(cost.cacheMissTokens).toBe(0);

    const zero = estimateCost({ inputTokens: 0, outputTokens: 0 }, DEEPSEEK_MODEL_PRO);
    expect(zero.cacheHitRate).toBe(0);
    expect(zero.totalCostUsd).toBe(0);
  });

  it("o Flash é mais barato que o Pro em todas as faixas", () => {
    expect(DEEPSEEK_PRICING[DEEPSEEK_MODEL_FLASH].inputCacheMiss).toBeLessThan(
      DEEPSEEK_PRICING[DEEPSEEK_MODEL_PRO].inputCacheMiss,
    );
    expect(DEEPSEEK_PRICING[DEEPSEEK_MODEL_FLASH].output).toBeLessThan(
      DEEPSEEK_PRICING[DEEPSEEK_MODEL_PRO].output,
    );
  });
});

describe("formatCost", () => {
  it("produz uma linha pt-BR com custo, cache e modelo", () => {
    const line = formatCost(
      estimateCost(
        { cacheReadInputTokens: 900, inputTokens: 1_000, outputTokens: 50 },
        DEEPSEEK_MODEL_PRO,
      ),
    );
    expect(line).toContain("US$ ");
    expect(line).toContain("cache 90%");
    expect(line).toContain("modelo Pro");
  });

  it("rotula o Flash", () => {
    const line = formatCost(
      estimateCost({ inputTokens: 10, outputTokens: 2 }, DEEPSEEK_MODEL_FLASH),
    );
    expect(line).toContain("modelo Flash");
  });
});

describe("somarCustos", () => {
  it("acumula tokens e USD de dois turnos", () => {
    const a = estimateCost(
      { cacheReadInputTokens: 100, inputTokens: 200, outputTokens: 10 },
      DEEPSEEK_MODEL_PRO,
    );
    const b = estimateCost({ inputTokens: 50, outputTokens: 5 }, DEEPSEEK_MODEL_FLASH);
    const s = somarCustos(a, b);
    expect(s.inputTokens).toBe(250);
    expect(s.outputTokens).toBe(15);
    expect(s.totalCostUsd).toBeCloseTo(a.totalCostUsd + b.totalCostUsd);
    expect(s.model).toBe(DEEPSEEK_MODEL_FLASH);
  });
});
