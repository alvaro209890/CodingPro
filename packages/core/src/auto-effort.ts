/**
 * Resolvedor automático de esforço (auto-effort v1). Decide se o próximo turno usa Flash (rápido/barato)
 * ou Pro (forte/caro) baseado no tamanho do contexto, complexidade da tarefa e histórico de falhas.
 * O usuário NUNCA escolhe — a CLI decide sozinha e escala em caso de necessidade.
 *
 * Estratégia:
 *   1. Tarefas simples e contextos pequenos → Flash
 *   2. Contexto grande, ferramentas de edição, ou falha anterior → escala para Pro
 *   3. O papel é "auto" (resolve para Pro) ou "fast" (Flash)
 *
 * Meta: cache-hit >70% em sessão típica, auto-effort ≤60% do custo de fixo-high (doc 14.2).
 */

import type { ModelRole } from "@codingpro/llm";

/** Teto de tokens abaixo do qual Flash é suficiente. */
const FLASH_CONTEXT_THRESHOLD_TOKENS = 8_000;

/** Nomes de tools que indicam trabalho pesado → escala para Pro. */
const HEAVY_TOOL_NAMES: readonly string[] = ["edit_file", "task", "repo_map", "bash"];

export interface AutoEffortState {
  /** Quantas falhas consecutivas ocorreram (qualquer ProviderError retryable). */
  falhasConsecutivas: number;
  /** Estimativa de tokens do contexto atual (melhor esforço). */
  tokensContexto: number;
  /** Nomes das tools disponíveis no turno (vazio = sem tools). */
  toolsAtivas: readonly string[];
}

/**
 * Decide o papel de modelo para o próximo turno com base no estado acumulado.
 * Nunca retorna "main" — só "auto" (Pro) ou "fast" (Flash).
 */
export function resolverAutoEffort(state: AutoEffortState): ModelRole {
  // Se falhou consecutivamente, escala para Pro.
  if (state.falhasConsecutivas > 0) {
    return "auto";
  }

  // Contexto grande → precisa de Pro para entender tudo.
  if (state.tokensContexto > FLASH_CONTEXT_THRESHOLD_TOKENS) {
    return "auto";
  }

  // Tools pesadas → Pro lida melhor com edições e orquestração.
  if (state.toolsAtivas.some((n) => HEAVY_TOOL_NAMES.includes(n))) {
    return "auto";
  }

  // Tudo o mais: Flash é suficiente e econômico.
  return "fast";
}

/** Cria o estado inicial do auto-effort (zero falhas, sem contexto). */
export function criarAutoEffortState(): AutoEffortState {
  return { falhasConsecutivas: 0, tokensContexto: 0, toolsAtivas: [] };
}

/**
 * Atualiza o estado após um turno: registra falha (escala) ou sucesso (reseta contador).
 * `falhou` = true quando o provider retornou erro retryable.
 */
export function atualizarAutoEffort(state: AutoEffortState, falhou: boolean): void {
  state.falhasConsecutivas = falhou ? state.falhasConsecutivas + 1 : 0;
}

/** Atualiza o estado com a estimativa de contexto e tools disponíveis para o próximo turno. */
export function prepararAutoEffort(
  state: AutoEffortState,
  tokensContexto: number,
  toolsAtivas: readonly string[],
): void {
  state.tokensContexto = tokensContexto;
  state.toolsAtivas = toolsAtivas;
}
