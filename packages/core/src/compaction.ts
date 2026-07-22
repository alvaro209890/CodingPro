import type { ChatMessage } from "@codingpro/llm";

/**
 * Estimativa grosseira de tokens por mensagem (~4 bytes/token + folga de estrutura).
 * Suficiente para decidir compactação; a contagem exata vem do `usage` do provider.
 */
export function estimateMessageTokens(message: ChatMessage): number {
  let chars = message.role.length;
  if (message.role === "tool") {
    chars += message.toolName.length + JSON.stringify(message.result).length;
  } else {
    chars += message.content.length;
    if (message.role === "assistant") {
      chars += message.reasoning?.length ?? 0;
      for (const call of message.toolCalls ?? []) {
        chars += call.name.length + JSON.stringify(call.input).length;
      }
    }
  }
  return Math.ceil(chars / 4) + 4;
}

export interface CompactionOptions {
  /** Orçamento de tokens do transcrito inteiro (system incluído). */
  readonly maxTokens: number;
  readonly estimateTokens?: (message: ChatMessage) => number;
}

export interface CompactionResult {
  readonly dropped: number;
  readonly messages: ChatMessage[];
}

/**
 * Compactação por truncamento: mantém o system inicial e o sufixo mais recente que couber no
 * orçamento, descartando os turnos mais antigos. Nunca quebra o pareamento tool-call/tool-result
 * (descarta mensagens `tool` órfãs no início do sufixo) e mantém ao menos a última mensagem.
 * Resumo estruturado por LLM fica para uma fase futura.
 */
export function compactMessages(
  messages: readonly ChatMessage[],
  options: CompactionOptions,
): CompactionResult {
  const estimate = options.estimateTokens ?? estimateMessageTokens;
  if (messages.length === 0) {
    return { dropped: 0, messages: [] };
  }

  const hasSystem = messages[0]?.role === "system";
  const system = hasSystem ? [messages[0] as ChatMessage] : [];
  const rest = hasSystem ? messages.slice(1) : messages.slice();
  if (rest.length === 0) {
    return { dropped: 0, messages: [...system] };
  }

  const budget = options.maxTokens - system.reduce((sum, message) => sum + estimate(message), 0);

  let total = 0;
  let startIndex = 0;
  for (let index = rest.length - 1; index >= 0; index -= 1) {
    total += estimate(rest[index] as ChatMessage);
    // Corta assim que estourar, desde que ainda reste mais de uma mensagem para manter.
    if (total > budget && rest.length - index > 1) {
      startIndex = index + 1;
      break;
    }
    startIndex = index;
  }

  // Integridade acima do orçamento: nunca começar o sufixo num resultado de ferramenta órfão.
  // Recua o corte até incluir o assistant dono da chamada (pode passar um pouco do orçamento).
  while (startIndex > 0 && rest[startIndex]?.role === "tool") {
    startIndex -= 1;
  }
  const suffix = rest.slice(startIndex);

  return {
    dropped: messages.length - (system.length + suffix.length),
    messages: [...system, ...suffix],
  };
}
