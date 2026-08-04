import type { JsonObject, JsonValue, Tool, ToolResult } from "@codingpro/llm";
import type { CheckpointRecorder } from "./checkpoints.js";
import type { MemoryStore } from "./memory-store.js";
import type { SubagenteSpawner } from "./subagent.js";
import type { Workspace } from "./workspace.js";

/**
 * Lojas de memória disponíveis à sessão: `projeto` (`.codingpro/memory`) tem prioridade quando
 * existe; `global` (`~/.codingpro/memory`) é o padrão. A tool `remember` escreve aqui — nunca no
 * projeto do usuário — por isso é pré-autorizada no gate.
 */
export interface MemoryScope {
  readonly global: MemoryStore;
  readonly projeto?: MemoryStore;
}

/**
 * Rastreador de leitura por sessão: `read_file` registra cada arquivo lido e `edit_file`
 * exige que o arquivo tenha sido lido antes de editar (impede edição às cegas). O estado
 * é da sessão, não do processo — cada runtime cria o seu.
 */
export interface ReadTracker {
  markRead(relativePath: string): void;
  wasRead(relativePath: string): boolean;
}

/** Cria um rastreador de leitura vazio (um por sessão de agente). */
export function createReadTracker(): ReadTracker {
  const lidos = new Set<string>();
  return {
    markRead: (relativePath) => {
      lidos.add(relativePath);
    },
    wasRead: (relativePath) => lidos.has(relativePath),
  };
}

/** Ambiente entregue a cada execução de tool. Sem credenciais, sem rede implícita. */
export interface ToolContext {
  readonly workspace: Workspace;
  readonly signal?: AbortSignal;
  /** Rastreador de leitura da sessão; `edit_file` o consulta para a guarda de leitura. */
  readonly readTracker?: ReadTracker;
  /** Registro de checkpoints; tools de escrita capturam o estado pré-escrita antes de gravar. */
  readonly checkpoints?: CheckpointRecorder;
  /** Lojas de memória; a tool `remember` grava aqui. */
  readonly memory?: MemoryScope;
  /** Fábrica de subagentes; a tool `task` delega através dela. */
  readonly subagentes?: SubagenteSpawner;
}

/**
 * Classe de efeito da tool, base do gate de permissão:
 * `read` nunca pede aprovação; `write`/`exec` passam pelo controlador de permissões.
 */
export type ToolSideEffect = "exec" | "read" | "write";

/**
 * Descritor puro (validável por `isTool`) acoplado à sua execução e à sua classe de efeito.
 * `execute` recebe input já validado contra o schema e sempre devolve um `ToolResult`;
 * erros de execução viram `ToolResult` de erro na fronteira do registry.
 */
export interface ExecutableTool {
  readonly definition: Tool;
  readonly sideEffect: ToolSideEffect;
  execute(input: JsonObject, context: ToolContext): Promise<ToolResult>;
}

/**
 * Normaliza texto de tool result para o contrato do provider:
 * - CRLF/CR → LF (Windows)
 * - remove controles perigosos (mantém \\n e \\t)
 * Sem isto, `isChatRequest` rejeita o histórico no turno seguinte
 * (“A requisição ao provider é inválida”) após um `read_file` com CRLF.
 */
export function sanitizeToolText(text: string): string {
  return (
    text
      .replace(/\r\n?/gu, "\n")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: sanitização intencional.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu, "")
  );
}

/** Teto padrão de saída de tool no histórico (tokens estimados). */
export const DEFAULT_TOOL_OUTPUT_MAX_TOKENS = 8000;

/** Estimativa rápida de tokens (~4 caracteres por token). */
export function estimateToolTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Trunca texto longo preservando início (~60%) e fim (~30%) do orçamento,
 * com aviso em português no meio.
 */
export function truncateToolOutput(
  text: string,
  maxTokens = DEFAULT_TOOL_OUTPUT_MAX_TOKENS,
): { text: string; truncated: boolean } {
  const tokens = estimateToolTokens(text);
  if (tokens <= maxTokens) {
    return { text, truncated: false };
  }
  const headTokens = Math.floor(maxTokens * 0.6);
  const tailTokens = Math.floor(maxTokens * 0.3);
  const headChars = headTokens * 4;
  const tailChars = tailTokens * 4;
  const omitted = Math.max(0, tokens - headTokens - tailTokens);
  const notice = `\n…[truncado: ${omitted} tokens omitidos; teto ${maxTokens} tok]…\n`;
  return {
    text: text.slice(0, headChars) + notice + text.slice(-tailChars),
    truncated: true,
  };
}

function truncateJsonStrings(value: JsonValue, maxFieldTokens: number): JsonValue {
  if (typeof value === "string") {
    const { text } = truncateToolOutput(value, maxFieldTokens);
    return text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateJsonStrings(item, maxFieldTokens));
  }
  if (typeof value === "object" && value !== null) {
    const saida: Record<string, JsonValue> = {};
    for (const [chave, item] of Object.entries(value)) {
      saida[chave] = truncateJsonStrings(item as JsonValue, maxFieldTokens);
    }
    return saida;
  }
  return value;
}

/** Aplica o teto de saída ao resultado de uma tool antes de entrar no histórico. */
export function applyOutputCeiling(
  result: ToolResult,
  maxTokens = DEFAULT_TOOL_OUTPUT_MAX_TOKENS,
): ToolResult {
  if (result.type === "text" || result.type === "error-text") {
    const { text, truncated } = truncateToolOutput(result.value, maxTokens);
    if (!truncated) {
      return result;
    }
    return { type: result.type, value: sanitizeToolText(text) };
  }
  if (result.type === "json") {
    const bruto = JSON.stringify(result.value);
    if (estimateToolTokens(bruto) <= maxTokens) {
      return result;
    }
    const fieldBudget = Math.max(256, Math.floor(maxTokens / 4));
    const reduzido = truncateJsonStrings(result.value, fieldBudget);
    const serializado = JSON.stringify(reduzido);
    if (estimateToolTokens(serializado) <= maxTokens) {
      return { type: "json", value: reduzido };
    }
    const { text } = truncateToolOutput(serializado, maxTokens);
    return { type: "text", value: sanitizeToolText(`[json truncado]\n${text}`) };
  }
  if (result.type === "error-json") {
    const bruto = JSON.stringify(result.value);
    if (estimateToolTokens(bruto) <= maxTokens) {
      return result;
    }
    const fieldBudget = Math.max(256, Math.floor(maxTokens / 4));
    const reduzido = truncateJsonStrings(result.value, fieldBudget);
    const serializado = JSON.stringify(reduzido);
    if (estimateToolTokens(serializado) <= maxTokens) {
      return { type: "error-json", value: reduzido };
    }
    const { text } = truncateToolOutput(serializado, maxTokens);
    return { type: "error-text", value: sanitizeToolText(`[json truncado]\n${text}`) };
  }
  return result;
}

export function textResult(value: string): ToolResult {
  return { type: "text", value: sanitizeToolText(value) };
}

export function errorResult(value: string): ToolResult {
  return { type: "error-text", value: sanitizeToolText(value) };
}
