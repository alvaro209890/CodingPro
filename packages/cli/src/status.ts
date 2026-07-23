/**
 * Status da sessão de chat: custo acumulado, tokens e contexto restante.
 * DeepSeek V4 expõe janela de **1M tokens** — usamos isso como referência do orçamento.
 */

import { estimateMessageTokens } from "@codingpro/core";
import type { ChatMessage, CostBreakdown } from "@codingpro/llm";

/** Janela de contexto da API DeepSeek V4 (doc 14.1). */
export const DEEPSEEK_CONTEXT_WINDOW = 1_000_000;

/**
 * Orçamento padrão para compactação automática no chat.
 * Deixa folga (~200k) para saída + tools + reasoning no mesmo request.
 */
export const DEFAULT_CONTEXT_BUDGET = 800_000;

/** Compactação manual (/compact) mira este fator do orçamento. */
export const COMPACT_TARGET_RATIO = 0.45;

export interface SessionStats {
  /** Soma dos custos dos turnos (USD). */
  readonly totalCostUsd: number;
  /** Tokens de entrada somados (usage do provider). */
  readonly inputTokens: number;
  /** Tokens de saída somados. */
  readonly outputTokens: number;
  /** Tokens lidos de cache somados. */
  readonly cacheReadTokens: number;
  /** Estimativa atual do transcrito (chars/4). */
  readonly contextTokens: number;
  /** Orçamento de compactação (não necessariamente a janela cheia). */
  readonly contextBudget: number;
  /** Janela máxima do modelo (1M). */
  readonly contextWindow: number;
  /** Número de turnos de agente concluídos. */
  readonly turns: number;
  /** Modelo do último turno (Pro/Flash). */
  readonly lastModel?: string;
}

export function criarSessionStats(contextBudget = DEFAULT_CONTEXT_BUDGET): SessionStats {
  return {
    cacheReadTokens: 0,
    contextBudget,
    contextTokens: 0,
    contextWindow: DEEPSEEK_CONTEXT_WINDOW,
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    turns: 0,
  };
}

/** Estima tokens do transcrito (system + histórico). */
export function estimarTokensTranscrito(messages: readonly ChatMessage[]): number {
  let total = 0;
  for (const m of messages) {
    total += estimateMessageTokens(m);
  }
  return total;
}

/** Incorpora o custo de um turno e atualiza a estimativa de contexto. */
export function atualizarStatsAposTurno(
  stats: SessionStats,
  cost: CostBreakdown | undefined,
  messages: readonly ChatMessage[],
  modelLabel?: string,
): SessionStats {
  const ctx = estimarTokensTranscrito(messages);
  if (cost === undefined) {
    return {
      ...stats,
      contextTokens: ctx,
      ...(modelLabel === undefined ? {} : { lastModel: modelLabel }),
      turns: stats.turns + 1,
    };
  }
  return {
    cacheReadTokens: stats.cacheReadTokens + cost.cacheReadTokens,
    contextBudget: stats.contextBudget,
    contextTokens: ctx,
    contextWindow: stats.contextWindow,
    inputTokens: stats.inputTokens + cost.inputTokens,
    lastModel: modelLabel ?? (cost.model.includes("flash") ? "Flash" : "Pro"),
    outputTokens: stats.outputTokens + cost.outputTokens,
    totalCostUsd: stats.totalCostUsd + cost.totalCostUsd,
    turns: stats.turns + 1,
  };
}

export function atualizarEstimativaContexto(
  stats: SessionStats,
  messages: readonly ChatMessage[],
): SessionStats {
  return { ...stats, contextTokens: estimarTokensTranscrito(messages) };
}

/** % do orçamento de compactação já usado (0–100+). */
export function percentContexto(stats: SessionStats): number {
  if (stats.contextBudget <= 0) {
    return 0;
  }
  return Math.round((stats.contextTokens / stats.contextBudget) * 100);
}

/** Tokens restantes até o orçamento de compactação. */
export function contextoRestante(stats: SessionStats): number {
  return Math.max(0, stats.contextBudget - stats.contextTokens);
}

/** Barra visual de uso de contexto (ASCII-safe). */
export function barraContexto(percent: number, largura = 10, ascii = false): string {
  const p = Math.max(0, Math.min(100, percent));
  const cheios = Math.round((p / 100) * largura);
  const fill = ascii ? "#" : "█";
  const empty = ascii ? "-" : "░";
  return fill.repeat(cheios) + empty.repeat(Math.max(0, largura - cheios));
}

function formatUsd(value: number): string {
  if (value < 0.0001 && value > 0) {
    return `$${value.toFixed(6)}`;
  }
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(3)}`;
}

function formatTok(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  if (n >= 10_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(2)}k`;
  }
  return String(n);
}

/**
 * Linha de status (puro, sem ANSI). O tema aplica cor.
 * Ex.: `sessão $0.012 · 4.2k in / 1.1k out · ctx 45.2k/800k (6%) ████░░░░░░ · rest 754k`
 */
export function formatarStatusLinha(stats: SessionStats, ascii = false): string {
  const pct = percentContexto(stats);
  const rest = contextoRestante(stats);
  const bar = barraContexto(pct, 10, ascii);
  const modelo = stats.lastModel ?? "—";
  const cache =
    stats.inputTokens > 0 ? Math.round((stats.cacheReadTokens / stats.inputTokens) * 100) : 0;
  // Linha curta: cabe no terminal sem wrap (evita “sumir” o prompt).
  return (
    `${modelo} ${formatUsd(stats.totalCostUsd)} · ` +
    `${formatTok(stats.inputTokens)}↓ ${formatTok(stats.outputTokens)}↑ · ` +
    `ctx ${formatTok(stats.contextTokens)}/${formatTok(stats.contextBudget)} ` +
    `${bar} ${pct}% · rest ${formatTok(rest)}` +
    (cache > 0 ? ` · cache ${cache}%` : "")
  );
}

/** Resolve orçamento efetivo: flag do usuário ou default 800k (dentro do 1M DeepSeek). */
export function resolverOrcamentoContexto(maxContexto?: number): number {
  if (maxContexto === undefined) {
    return DEFAULT_CONTEXT_BUDGET;
  }
  if (!Number.isFinite(maxContexto) || maxContexto <= 0) {
    return DEFAULT_CONTEXT_BUDGET;
  }
  // Nunca acima da janela DeepSeek (com folga mínima de 1k).
  return Math.min(Math.trunc(maxContexto), DEEPSEEK_CONTEXT_WINDOW - 1_000);
}
