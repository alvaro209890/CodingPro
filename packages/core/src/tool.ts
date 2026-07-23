import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
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

export function textResult(value: string): ToolResult {
  return { type: "text", value };
}

export function errorResult(value: string): ToolResult {
  return { type: "error-text", value };
}
