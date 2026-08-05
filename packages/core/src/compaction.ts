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
  /**
   * C1 — gera resumo estruturado dos turnos descartados (arquivos tocados, decisões,
   * pendências) em vez de jogá-los fora. Determinístico e sem custo de LLM (v1 do C1);
   * o resumo entra na posição `[system fixo][resumo][sufixo recente]`, preservando o
   * prefixo de cache. Desligado por padrão para não mudar comportamento existente.
   */
  readonly resumirDescartados?: boolean;
}

export interface CompactionResult {
  readonly dropped: number;
  readonly messages: ChatMessage[];
  /** C1 — resumo estruturado dos turnos descartados (vazio se não resumir). */
  readonly resumo?: string;
}

/** C1 — extrai arquivos tocados (edit_file/write_file/apply_patch) de uma mensagem tool/assistant. */
function arquivosTocadosDe(msg: ChatMessage): string[] {
  const out: string[] = [];
  if (msg.role === "tool") {
    const nome = msg.toolName;
    if (nome === "edit_file" || nome === "write_file" || nome === "apply_patch") {
      const alvo = (msg.result as { value?: unknown }).value;
      if (typeof alvo === "string") out.push(alvo.split("\n")[0] ?? "");
    }
    return out;
  }
  if (msg.role === "assistant") {
    for (const call of msg.toolCalls ?? []) {
      if (
        (call.name === "edit_file" ||
          call.name === "write_file" ||
          call.name === "apply_patch") &&
        typeof call.input.path === "string"
      ) {
        out.push(call.input.path);
      }
    }
  }
  return out.filter((x) => x.length > 0);
}

/** C1 — monta o resumo estruturado dos turnos descartados (sem LLM). */
export function resumirDescartados(descartados: readonly ChatMessage[]): string {
  const arquivos = new Set<string>();
  const decisoes: string[] = [];
  const pendencias: string[] = [];
  for (const msg of descartados) {
    for (const arq of arquivosTocadosDe(msg)) {
      arquivos.add(arq);
    }
    if (msg.role === "assistant" && msg.content.trim().length > 0) {
      decisoes.push(msg.content.trim().split("\n")[0]?.slice(0, 160) ?? "");
    }
    if (msg.role === "tool" && msg.result.type === "error-text") {
      pendencias.push(`falha em ${msg.toolName}: ${String(msg.result.value).slice(0, 120)}`);
    }
  }
  const partes: string[] = ["### Resumo de contexto antigo (compactado)"];
  if (arquivos.size > 0) {
    partes.push(`**Arquivos tocados:** ${[...arquivos].slice(0, 12).join(", ")}`);
  }
  if (decisoes.length > 0) {
    partes.push(`**Decisões:** ${decisoes.slice(-6).join(" · ")}`);
  }
  if (pendencias.length > 0) {
    partes.push(`**Pendências:** ${pendencias.slice(-4).join(" · ")}`);
  }
  return partes.join("\n");
}

/**
 * Compactação por truncamento: mantém o system inicial e o sufixo mais recente que couber no
 * orçamento, descartando os turnos mais antigos. Nunca quebra o pareamento tool-call/tool-result
 * (descarta mensagens `tool` órfãs no início do sufixo) e mantém ao menos a última mensagem.
 * Com `resumirDescartados`, os turnos antigos viram um resumo estruturado (C1) na posição
 * `[system][resumo][sufixo]` — o prefixo de cache fica estável e o contexto valioso não some.
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
  const descartados = rest.slice(0, startIndex);
  const suffix = rest.slice(startIndex);

  if (options.resumirDescartados === true && descartados.length > 0) {
    const resumo = resumirDescartados(descartados);
    const resumoMsg: ChatMessage = {
      content: resumo,
      role: "system",
    };
    return {
      dropped: messages.length - (system.length + 1 + suffix.length),
      messages: [...system, resumoMsg, ...suffix],
      resumo,
    };
  }

  return {
    dropped: messages.length - (system.length + suffix.length),
    messages: [...system, ...suffix],
  };
}
