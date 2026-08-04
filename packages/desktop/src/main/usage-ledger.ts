import type { TokenUsage } from "@codingpro/llm";
import type { PersistedUsage } from "./project-index.js";

export type UsageSource = "main" | "repair" | `subagent:${string}`;

export interface UsageSourceSnapshot {
  source: UsageSource;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  costUsd: number;
  apiCalls: number;
}

export interface UsageTotals extends PersistedUsage {
  sources: UsageSourceSnapshot[];
}

interface MutableSource extends UsageSourceSnapshot {
  keys: Set<string>;
}

function emptySource(source: UsageSource): MutableSource {
  return {
    apiCalls: 0,
    cacheReadTokens: 0,
    costUsd: 0,
    inputTokens: 0,
    keys: new Set(),
    outputTokens: 0,
    reasoningTokens: 0,
    source,
  };
}

/** Ledger incremental: cada chamada só entra uma vez por (fonte, chave). */
export class UsageLedger {
  readonly #sources = new Map<UsageSource, MutableSource>();
  #turns: number;
  #subagentCalls: number;
  #base: PersistedUsage;

  constructor(initial?: Partial<PersistedUsage>) {
    this.#base = {
      apiCalls: initial?.apiCalls ?? 0,
      cacheReadTokens: initial?.cacheReadTokens ?? 0,
      inputTokens: initial?.inputTokens ?? 0,
      outputTokens: initial?.outputTokens ?? 0,
      reasoningTokens: initial?.reasoningTokens ?? 0,
      subagentCalls: initial?.subagentCalls ?? 0,
      totalCostUsd: initial?.totalCostUsd ?? 0,
      turns: initial?.turns ?? 0,
    };
    this.#turns = this.#base.turns;
    this.#subagentCalls = this.#base.subagentCalls;
  }

  beginUserTurn(): void {
    this.#turns += 1;
  }

  beginSubagent(): void {
    this.#subagentCalls += 1;
  }

  record(source: UsageSource, key: string, usage: TokenUsage, costUsd: number): boolean {
    const bucket = this.#sources.get(source) ?? emptySource(source);
    if (bucket.keys.has(key)) return false;
    bucket.keys.add(key);
    bucket.apiCalls += 1;
    bucket.inputTokens += usage.inputTokens;
    bucket.outputTokens += usage.outputTokens;
    bucket.cacheReadTokens += usage.cacheReadInputTokens ?? 0;
    bucket.reasoningTokens += usage.reasoningTokens ?? 0;
    bucket.costUsd += costUsd;
    this.#sources.set(source, bucket);
    return true;
  }

  totals(): UsageTotals {
    const sources = [...this.#sources.values()].map(({ keys: _keys, ...source }) => ({
      ...source,
    }));
    const total: UsageTotals = {
      ...this.#base,
      sources,
      subagentCalls: this.#subagentCalls,
      turns: this.#turns,
    };
    for (const source of sources) {
      total.apiCalls += source.apiCalls;
      total.cacheReadTokens += source.cacheReadTokens;
      total.inputTokens += source.inputTokens;
      total.outputTokens += source.outputTokens;
      total.reasoningTokens += source.reasoningTokens;
      total.totalCostUsd += source.costUsd;
    }
    return total;
  }
}
