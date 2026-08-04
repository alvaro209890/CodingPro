import { describe, expect, it } from "vitest";
import { UsageLedger } from "../src/main/usage-ledger.js";

describe("UsageLedger", () => {
  it("contabiliza cada etapa uma vez e separa fontes", () => {
    const ledger = new UsageLedger();
    ledger.beginUserTurn();
    ledger.beginSubagent();
    expect(ledger.record("main", "run:1", { inputTokens: 100, outputTokens: 20 }, 0.01)).toBe(true);
    expect(ledger.record("main", "run:1", { inputTokens: 100, outputTokens: 20 }, 0.01)).toBe(
      false,
    );
    ledger.record(
      "subagent:abc",
      "sub:1",
      { cacheReadInputTokens: 40, inputTokens: 60, outputTokens: 15, reasoningTokens: 10 },
      0.004,
    );
    const total = ledger.totals();
    expect(total).toMatchObject({
      apiCalls: 2,
      cacheReadTokens: 40,
      inputTokens: 160,
      outputTokens: 35,
      reasoningTokens: 10,
      subagentCalls: 1,
      totalCostUsd: 0.014,
      turns: 1,
    });
    expect(total.sources.map((source) => source.source)).toEqual(["main", "subagent:abc"]);
  });
});
