import {
  type DeepSeekModel,
  DEEPSEEK_MODEL_FLASH,
  DEEPSEEK_MODEL_PRO,
} from "./providers/deepseek.js";
import type { TokenUsage } from "./provider.js";

/** Preços em USD por 1M de tokens. */
export interface ModelPricing {
  readonly inputCacheHit: number;
  readonly inputCacheMiss: number;
  readonly output: number;
}

/**
 * Tabela de preços DeepSeek (doc 14.1, pesquisa de 2026-07-22).
 * Pro é o preço oficial documentado; Flash é derivado (~10× mais barato, decisão 14.2) —
 * estimativa até haver número oficial do Flash. `reasoning` é cobrado como output (já incluso
 * em `outputTokens`), então não entra separado no cálculo.
 */
export const DEEPSEEK_PRICING: Readonly<Record<DeepSeekModel, ModelPricing>> = Object.freeze({
  [DEEPSEEK_MODEL_PRO]: { inputCacheHit: 0.0036, inputCacheMiss: 0.435, output: 0.87 },
  [DEEPSEEK_MODEL_FLASH]: { inputCacheHit: 0.00036, inputCacheMiss: 0.0435, output: 0.087 },
});

export interface CostBreakdown {
  readonly cacheHitRate: number;
  readonly cacheMissTokens: number;
  readonly cacheReadTokens: number;
  readonly inputCostUsd: number;
  readonly inputTokens: number;
  readonly model: DeepSeekModel;
  readonly outputCostUsd: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalCostUsd: number;
}

/**
 * Estima o custo de um uso de tokens no modelo dado. Entrada em cache-miss e cache-hit têm
 * preços distintos; a taxa de cache-hit é a alavanca principal de economia (doc 14.3).
 */
export function estimateCost(usage: TokenUsage, model: DeepSeekModel): CostBreakdown {
  const pricing = DEEPSEEK_PRICING[model];
  const inputTokens = usage.inputTokens;
  const cacheReadTokens = Math.min(usage.cacheReadInputTokens ?? 0, inputTokens);
  const cacheMissTokens = inputTokens - cacheReadTokens;
  const outputTokens = usage.outputTokens;

  const inputCostUsd =
    (cacheMissTokens * pricing.inputCacheMiss + cacheReadTokens * pricing.inputCacheHit) /
    1_000_000;
  const outputCostUsd = (outputTokens * pricing.output) / 1_000_000;

  return {
    cacheHitRate: inputTokens > 0 ? cacheReadTokens / inputTokens : 0,
    cacheMissTokens,
    cacheReadTokens,
    inputCostUsd,
    inputTokens,
    model,
    outputCostUsd,
    outputTokens,
    reasoningTokens: usage.reasoningTokens ?? 0,
    totalCostUsd: inputCostUsd + outputCostUsd,
  };
}

function formatUsd(value: number): string {
  return `US$ ${value.toFixed(6)}`;
}

function formatInteger(value: number): string {
  return value.toLocaleString("pt-BR");
}

/** Linha única em pt-BR para o comando `/cost` / statusline. */
export function formatCost(breakdown: CostBreakdown): string {
  const label = breakdown.model === DEEPSEEK_MODEL_PRO ? "Pro" : "Flash";
  const cachePercent = Math.round(breakdown.cacheHitRate * 100);
  return (
    `Custo: ${formatUsd(breakdown.totalCostUsd)} · ` +
    `entrada ${formatInteger(breakdown.inputTokens)} tok (cache ${cachePercent}%) · ` +
    `saída ${formatInteger(breakdown.outputTokens)} tok · modelo ${label}`
  );
}
