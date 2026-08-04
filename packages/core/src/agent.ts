import {
  type ChatMessage,
  type ChatRequest,
  type CostBreakdown,
  DEEPSEEK_PRICING,
  type DeepSeekModel,
  estimateCost,
  type FinishReason,
  type Provider,
  ProviderError,
  type TokenUsage,
  type Tool,
  type ToolCall,
  type ToolResult,
} from "@codingpro/llm";
import { compactMessages } from "./compaction.js";
import type { ToolGate } from "./gate.js";
import { SYSTEM_PROMPT_V1 } from "./system-prompt.js";
import { sanitizeToolText, type ToolContext } from "./tool.js";

/** Teto de passos do loop, para nunca girar sem fim quando o modelo insiste em ferramentas. */
export const AGENT_DEFAULT_MAX_STEPS = 40;

/** Tentativas extras por turno em erro transitório do provider (backoff exponencial). */
export const AGENT_DEFAULT_MAX_RETRIES = 2;
export const AGENT_DEFAULT_RETRY_BASE_MS = 500;

/** Correções máximas de chamada de ferramenta inválida antes de desistir do turno. */
export const AGENT_MAX_TOOL_CALL_FIXES = 5;

/** Uma tentativa extra se a requisição for rejeitada por histórico sujo (ex. CRLF em tool text). */
export const AGENT_MAX_INVALID_REQUEST_FIXES = 1;

export interface RetryOptions {
  readonly baseDelayMs?: number;
  readonly maxRetries?: number;
}

export type AgentFinishReason = "max-steps" | "stop";

/** Eventos observáveis do loop — a UI (TUI/headless) os traduz para a tela. */
export type AgentEvent =
  | { readonly text: string; readonly type: "text-delta" }
  | { readonly text: string; readonly type: "reasoning-delta" }
  | { readonly call: ToolCall; readonly type: "tool-call" }
  | { readonly call: ToolCall; readonly result: ToolResult; readonly type: "tool-result" }
  /** Aviso não-fatal do loop (ex.: recuperação de uma chamada de ferramenta inválida). */
  | {
      readonly text: string;
      readonly type: "notice";
      /** Chave estável para a UI consolidar tentativas do mesmo reparo. */
      readonly key?: string;
      readonly attempt?: number;
      readonly total?: number;
    }
  | {
      readonly reason: FinishReason;
      readonly step: number;
      readonly type: "step";
      readonly usage?: TokenUsage;
    };

export interface RunAgentOptions {
  /** Orçamento de tokens: acima dele, o transcrito é compactado antes do turno. */
  readonly contextBudget?: number;
  readonly context: ToolContext;
  readonly gate: ToolGate;
  /** Mensagens iniciais (ex.: a pergunta do usuário). O system prompt é prefixado. */
  readonly messages: readonly ChatMessage[];
  readonly maxSteps?: number;
  readonly onEvent?: (event: AgentEvent) => void;
  readonly provider: Provider;
  readonly retry?: RetryOptions;
  readonly signal?: AbortSignal;
  readonly systemPrompt?: string;
  /** Definições de ferramentas anunciadas ao provider. Vazio → nenhuma ferramenta. */
  readonly tools?: readonly Tool[];
}

export interface AgentResult {
  /** Custo estimado do uso agregado, quando o modelo do provider tem tabela de preço. */
  readonly cost?: CostBreakdown;
  readonly finishReason: AgentFinishReason;
  /** Transcrito completo, incluindo a mensagem de sistema e os resultados de ferramentas. */
  readonly messages: readonly ChatMessage[];
  readonly steps: number;
  readonly usage: TokenUsage;
}

interface TurnOutcome {
  readonly message: Extract<ChatMessage, { role: "assistant" }>;
  readonly reason: FinishReason;
  readonly usage?: TokenUsage;
}

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

function addUsage(total: TokenUsage, turn: TokenUsage | undefined): TokenUsage {
  if (turn === undefined) {
    return total;
  }
  const cacheRead = (total.cacheReadInputTokens ?? 0) + (turn.cacheReadInputTokens ?? 0);
  const reasoning = (total.reasoningTokens ?? 0) + (turn.reasoningTokens ?? 0);
  return {
    ...(cacheRead > 0 ? { cacheReadInputTokens: cacheRead } : {}),
    inputTokens: total.inputTokens + turn.inputTokens,
    outputTokens: total.outputTokens + turn.outputTokens,
    ...(reasoning > 0 ? { reasoningTokens: reasoning } : {}),
  };
}

async function streamTurn(
  provider: Provider,
  request: ChatRequest,
  onEvent: ((event: AgentEvent) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<TurnOutcome> {
  let outcome: TurnOutcome | undefined;

  for await (const event of provider.stream(
    request,
    signal === undefined ? undefined : { signal },
  )) {
    if (outcome !== undefined) {
      throw new ProviderError("invalid-response", "O provider enviou dados após finalizar.");
    }
    switch (event.type) {
      case "text-delta":
        onEvent?.({ text: event.text, type: "text-delta" });
        break;
      case "reasoning-delta":
        onEvent?.({ text: event.text, type: "reasoning-delta" });
        break;
      case "tool-call":
        onEvent?.({ call: event.call, type: "tool-call" });
        break;
      default:
        outcome = {
          message: event.message,
          reason: event.reason,
          ...(event.usage === undefined ? {} : { usage: event.usage }),
        };
    }
  }

  if (outcome === undefined) {
    throw new ProviderError("invalid-response", "O provider terminou sem finalizar a resposta.");
  }
  return outcome;
}

function isRetryable(error: unknown): boolean {
  return error instanceof ProviderError && error.retryable;
}

function delayWithAbort(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Operação cancelada.", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Transmite um turno com retry/backoff em erro transitório do provider. Só re-tenta se NADA
 * foi emitido ainda (falha na conexão, antes do primeiro token): isso evita duplicar deltas e,
 * como as ferramentas só rodam após um `finish`, nunca duplica efeitos colaterais.
 */
async function streamTurnWithRetry(
  provider: Provider,
  request: ChatRequest,
  onEvent: ((event: AgentEvent) => void) | undefined,
  signal: AbortSignal | undefined,
  retry: RetryOptions | undefined,
): Promise<TurnOutcome> {
  const maxRetries = retry?.maxRetries ?? AGENT_DEFAULT_MAX_RETRIES;
  const baseDelayMs = retry?.baseDelayMs ?? AGENT_DEFAULT_RETRY_BASE_MS;
  let attempt = 0;

  for (;;) {
    let emitted = false;
    const track = (event: AgentEvent): void => {
      emitted = true;
      onEvent?.(event);
    };
    try {
      return await streamTurn(provider, request, track, signal);
    } catch (error) {
      if (emitted || attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }
      signal?.throwIfAborted();
      onEvent?.({
        attempt: attempt + 1,
        key: "provider-retry",
        text: `A conexão com a IA demorou ou foi interrompida; tentando novamente (${attempt + 1}/${maxRetries})…`,
        total: maxRetries,
        type: "notice",
      });
      await delayWithAbort(baseDelayMs * 2 ** attempt, signal);
      attempt += 1;
    }
  }
}

function isPricedModel(model: string): model is DeepSeekModel {
  return Object.hasOwn(DEEPSEEK_PRICING, model);
}

function sanitizeToolResult(result: ToolResult): ToolResult {
  if (result.type === "text" || result.type === "error-text") {
    return { type: result.type, value: sanitizeToolText(result.value) };
  }
  if (result.type === "execution-denied") {
    return {
      type: result.type,
      ...(result.reason === undefined ? {} : { reason: sanitizeToolText(result.reason) }),
    };
  }
  return result;
}

/**
 * Limpa o histórico antes de mandar ao provider — corrige sessões antigas no Windows
 * com CR/LF em tool text (read_file) que fazem isChatRequest falhar.
 */
export function sanitizeMessagesForProvider(messages: readonly ChatMessage[]): ChatMessage[] {
  const cleaned = messages.map((message) => {
    if (message.role === "tool") {
      return {
        result: sanitizeToolResult(message.result),
        role: "tool" as const,
        toolCallId: message.toolCallId,
        toolName: message.toolName,
      };
    }
    if (message.role === "assistant") {
      return {
        content: sanitizeToolText(message.content),
        ...(message.reasoning === undefined
          ? {}
          : { reasoning: sanitizeToolText(message.reasoning) }),
        role: "assistant" as const,
        ...(message.toolCalls === undefined ? {} : { toolCalls: message.toolCalls }),
      };
    }
    return {
      content: sanitizeToolText(message.content),
      role: message.role,
    };
  });
  return dropIncompleteToolRound(cleaned);
}

/** Remove rodadas assistant+tools incompletas no fim (abort/crash) que invalidam a API. */
function dropIncompleteToolRound(messages: ChatMessage[]): ChatMessage[] {
  const pending = new Set<string>();
  let lastAssistantWithTools = -1;
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message === undefined) continue;
    if (message.role === "tool") {
      pending.delete(message.toolCallId);
      continue;
    }
    if (pending.size > 0) {
      // mensagem no meio de tool results — corta a rodada aberta
      return messages.slice(0, lastAssistantWithTools >= 0 ? lastAssistantWithTools : i);
    }
    if (message.role === "assistant" && message.toolCalls !== undefined) {
      lastAssistantWithTools = i;
      for (const call of message.toolCalls) {
        pending.add(call.id);
      }
    }
  }
  if (pending.size > 0 && lastAssistantWithTools >= 0) {
    return messages.slice(0, lastAssistantWithTools);
  }
  return messages;
}

/**
 * Loop agêntico mínimo: transmite um turno do provider, executa as ferramentas pedidas pelo
 * `ToolGate` (que aplica permissão) e realimenta os resultados até o modelo parar de pedir
 * ferramentas ou o teto de passos ser atingido. As ferramentas só rodam após um `finish`
 * limpo, então uma falha de streaming nunca duplica efeitos colaterais.
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const maxSteps =
    options.maxSteps !== undefined && options.maxSteps > 0
      ? Math.trunc(options.maxSteps)
      : AGENT_DEFAULT_MAX_STEPS;
  const tools = options.tools ?? [];
  // Ao retomar uma sessão, o transcrito já começa com o system prompt: não duplicar.
  const hasSystem = options.messages[0]?.role === "system";
  const messages: ChatMessage[] = hasSystem
    ? [...options.messages]
    : [{ content: options.systemPrompt ?? SYSTEM_PROMPT_V1, role: "system" }, ...options.messages];

  let usage = ZERO_USAGE;
  let steps = 0;
  let finishReason: AgentFinishReason = "max-steps";
  let working = sanitizeMessagesForProvider(messages);
  // Auto-recuperação: uma chamada de ferramenta inválida do modelo não deve matar a tarefa.
  // Realimentamos o erro como mensagem e deixamos o modelo refazer, com um teto pequeno.
  let correcoesToolCall = 0;
  let correcoesInvalidRequest = 0;

  while (steps < maxSteps) {
    options.signal?.throwIfAborted();
    steps += 1;
    // Compacta antes do turno quando o transcrito passa do orçamento (preserva pareamento).
    if (options.contextBudget !== undefined) {
      working = compactMessages(working, { maxTokens: options.contextBudget }).messages;
    }
    working = sanitizeMessagesForProvider(working);
    const request: ChatRequest = { messages: working, ...(tools.length > 0 ? { tools } : {}) };
    let turn: TurnOutcome;
    try {
      turn = await streamTurnWithRetry(
        options.provider,
        request,
        options.onEvent,
        options.signal,
        options.retry,
      );
    } catch (error) {
      // Chamada de ferramenta inválida: nenhum efeito rodou ainda (o throw é antes da execução),
      // então é seguro corrigir e repetir o turno em vez de abortar toda a demanda.
      if (
        error instanceof ProviderError &&
        error.code === "invalid-tool-call" &&
        correcoesToolCall < AGENT_MAX_TOOL_CALL_FIXES
      ) {
        // Conta correções CONSECUTIVAS: um turno bem-sucedido zera o contador (abaixo),
        // então uma tarefa longa com hiccups ocasionais nunca esgota o orçamento — só
        // aborta se o modelo travar em N chamadas inválidas seguidas.
        correcoesToolCall += 1;
        options.onEvent?.({
          attempt: correcoesToolCall,
          key: "tool-call-recovery",
          text: `recuperando de chamada de ferramenta inválida (${correcoesToolCall}/${AGENT_MAX_TOOL_CALL_FIXES})`,
          total: AGENT_MAX_TOOL_CALL_FIXES,
          type: "notice",
        });
        const nomeNoErro = tools.find((tool) => error.safeMessage.includes(`"${tool.name}"`));
        const schemaExato = nomeNoErro
          ? JSON.stringify({ name: nomeNoErro.name, inputSchema: nomeNoErro.inputSchema })
          : JSON.stringify(
              tools.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema })),
            );
        working = [
          ...working,
          {
            content:
              `${error.safeMessage} Schema exato permitido: ${schemaExato}. ` +
              "Responda de novo com o nome exato e apenas os argumentos declarados nesse schema; " +
              "se já tiver a resposta, responda apenas texto.",
            role: "user",
          },
        ];
        continue;
      }
      // Histórico inválido (ex.: sessão antiga com CRLF em tool text no Windows).
      if (
        error instanceof ProviderError &&
        error.code === "invalid-request" &&
        correcoesInvalidRequest < AGENT_MAX_INVALID_REQUEST_FIXES
      ) {
        correcoesInvalidRequest += 1;
        options.onEvent?.({
          text: "corrigindo histórico da sessão e tentando de novo…",
          type: "notice",
        });
        working = sanitizeMessagesForProvider(working);
        steps -= 1; // não conta o passo abortado
        continue;
      }
      throw error;
    }
    correcoesToolCall = 0; // turno bem-sucedido: zera o orçamento de correções consecutivas
    working = [...working, turn.message];
    usage = addUsage(usage, turn.usage);
    options.onEvent?.({
      reason: turn.reason,
      step: steps,
      type: "step",
      ...(turn.usage === undefined ? {} : { usage: turn.usage }),
    });

    const calls = turn.message.toolCalls;
    if (calls === undefined || calls.length === 0) {
      finishReason = "stop";
      break;
    }
    if (steps >= maxSteps) {
      break;
    }
    // Captura o ponto do transcrito antes de executar as ferramentas deste turno.
    // Se um abort ocorrer no meio, restauramos para não deixar resultados parciais
    // que o modelo não consegue parear (toolCalls sem tool-result correspondente).
    const resultsStart = working.length;
    try {
      for (const call of calls) {
        options.signal?.throwIfAborted();
        const result = await options.gate.run(call.name, call.input, options.context);
        working.push({
          result: sanitizeToolResult(result),
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
        });
        options.onEvent?.({ call, result, type: "tool-result" });
      }
    } catch (error) {
      // Abort ou erro de tool: descarta resultados parciais do turno e para o loop.
      working = working.slice(0, resultsStart);
      throw error;
    }
  }

  // Esgotou o orçamento de passos ainda pedindo ferramentas: força UMA síntese sem ferramentas,
  // para o usuário sempre receber uma resposta (em vez de sair sem texto algum).
  if (finishReason === "max-steps") {
    options.signal?.throwIfAborted();
    options.onEvent?.({
      text: "limite de passos atingido — sintetizando a resposta com o que já foi coletado",
      type: "notice",
    });
    const sintese: ChatMessage = {
      content:
        "Você atingiu o limite de exploração de ferramentas. Responda agora, de forma objetiva e " +
        "completa, usando apenas o que já coletou. Não chame mais nenhuma ferramenta.",
      role: "user",
    };
    // O loop quebrou LOGO APÓS anexar a mensagem do assistente com chamadas de ferramenta,
    // mas ANTES de executá-las — então há tool calls pendentes sem resultado. Removê-la deixa
    // o transcrito válido (termina em tool-result/user) para a síntese sem ferramentas.
    const ultima = working.at(-1);
    const base =
      ultima?.role === "assistant" && ultima.toolCalls !== undefined
        ? working.slice(0, -1)
        : working;
    // Mantém as tools declaradas (o histórico as referencia) mas com `toolChoice: "none"`:
    // a API proíbe novas chamadas e o modelo é obrigado a produzir o texto final.
    const requestFinal: ChatRequest = {
      messages: [...base, sintese],
      ...(tools.length > 0 ? { toolChoice: "none", tools } : {}),
    };
    try {
      const turnoFinal = await streamTurnWithRetry(
        options.provider,
        requestFinal,
        options.onEvent,
        options.signal,
        options.retry,
      );
      working = [...base, sintese, turnoFinal.message];
      usage = addUsage(usage, turnoFinal.usage);
      // Mantém finishReason "max-steps": a resposta veio de síntese forçada, não de uma parada
      // natural do modelo — o caller ainda sabe que a exploração foi truncada.
    } catch (error) {
      // Best-effort: um abort ainda cancela; qualquer outra falha na síntese não deve
      // apagar todo o trabalho de exploração — mantém o resultado com finishReason "max-steps".
      options.signal?.throwIfAborted();
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
    }
  }

  const cost = isPricedModel(options.provider.model)
    ? estimateCost(usage, options.provider.model)
    : undefined;
  return {
    ...(cost === undefined ? {} : { cost }),
    finishReason,
    messages: working,
    steps,
    usage,
  };
}
