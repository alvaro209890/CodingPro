import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Provider } from "@codingpro/llm";
import {
  parseTipoAgente,
  resolverTipoAgente,
  TIPOS_AGENTE_PADRAO,
  type TipoAgente,
} from "./agent-types.js";
import type { Approver, PermissionMode } from "./permissions.js";
import {
  executarSubagente,
  SUBAGENTE_TIMEOUT_PADRAO_MS,
  type SubagenteEvento,
  type SubagenteRelatorio,
  type SubagenteSpawner,
} from "./subagent.js";
import type { ExecutableTool, MemoryScope } from "./tool.js";
import { SUBAGENT_TOOL_POOL } from "./tool-groups.js";
import type { Workspace } from "./workspace.js";

/** Carrega tipos custom de `.codingpro/agents/*.md` (best-effort; arquivos inválidos ignorados). */
export async function carregarTiposCustom(dir: string): Promise<Record<string, TipoAgente>> {
  let arquivos: string[];
  try {
    arquivos = await readdir(dir);
  } catch {
    return {};
  }
  const tipos: Record<string, TipoAgente> = {};
  for (const nome of arquivos.sort()) {
    if (!nome.endsWith(".md")) {
      continue;
    }
    try {
      const texto = await readFile(join(dir, nome), "utf8");
      const tipo = parseTipoAgente(nome.replace(/\.md$/u, ""), texto);
      if (tipo !== undefined) {
        tipos[tipo.nome] = tipo;
      }
    } catch {
      // ignora arquivo ilegível
    }
  }
  return tipos;
}

export interface SpawnerOptions {
  readonly workspace: Workspace;
  readonly provider: Provider;
  /** Provider por papel do subagente; se ausente, usa `provider` para todos. */
  readonly criarProvider?: (role: TipoAgente["role"]) => Provider;
  readonly memory?: MemoryScope;
  /** Tipos custom já carregados (de `.codingpro/agents`). */
  readonly custom?: Record<string, TipoAgente>;
  /** Pool de tools disponível no runtime (ex.: sem `code_search` no Electron). */
  readonly toolPool?: readonly ExecutableTool[];
  readonly maxParalelo?: number;
  readonly timeoutMs?: number;
  /** Teto de caracteres do relatório devolvido ao agente pai (O2); head+tail com aviso. */
  readonly maxRelatorioChars?: number;
  /** Aprovador do runtime pai, para que subagentes com tools de efeito possam escrever. */
  readonly approver?: Approver;
  /** Modo de permissão dos subagentes; padrão `ask`. */
  readonly permissionMode?: PermissionMode;
  readonly onEvent?: (event: SubagenteEvento) => void;
}

/** Default do teto de relatório (O2): ~3 k tokens de texto. */
const RELATORIO_MAX_CHARS_PADRAO = 12_000;

/**
 * O2 — limita o relatório devolvido ao agente pai: mantém cabeça (resumo) + cauda (conclusão)
 * com marcador de omissão. Relatórios longos inflam o histórico do agente principal.
 */
function limitarRelatorio(texto: string, maxChars: number): string {
  if (texto.length <= maxChars) return texto;
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head;
  return `${texto.slice(0, head)}\n\n…(relatório truncado: ${texto.length - maxChars} caracteres omitidos)…\n\n${texto.slice(-tail)}`;
}

/**
 * Cria a fábrica de subagentes para o `ToolContext`. Reusa o provider da sessão (roteamento por
 * papel fica de upgrade). Contexto isolado: workspace + memória, sem checkpoints.
 */
export function criarSpawnerSubagentes(options: SpawnerOptions): SubagenteSpawner {
  const custom = options.custom ?? {};
  const toolPool = options.toolPool ?? SUBAGENT_TOOL_POOL;
  const maxRelatorio = options.maxRelatorioChars ?? RELATORIO_MAX_CHARS_PADRAO;
  const tiposDisponiveis = [
    ...new Set([...Object.keys(TIPOS_AGENTE_PADRAO), ...Object.keys(custom)]),
  ].sort();
  return {
    async executar(tipoNome, prompt, signal): Promise<SubagenteRelatorio> {
      const tipo = resolverTipoAgente(tipoNome, custom);
      if (tipo === undefined) {
        throw new Error(`Tipo de subagente desconhecido: ${tipoNome}.`);
      }
      const provider = options.criarProvider?.(tipo.role) ?? options.provider;
      const relatorio = await executarSubagente({
        context: {
          workspace: options.workspace,
          ...(options.memory === undefined ? {} : { memory: options.memory }),
        },
        prompt,
        provider,
        timeoutMs: options.timeoutMs ?? SUBAGENTE_TIMEOUT_PADRAO_MS,
        tipo,
        toolPool,
        ...(options.approver === undefined ? {} : { approver: options.approver }),
        ...(options.permissionMode === undefined ? {} : { permissionMode: options.permissionMode }),
        ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
        ...(signal === undefined ? {} : { signal }),
      });
      const textoLimitado = limitarRelatorio(relatorio.texto, maxRelatorio);
      if (textoLimitado !== relatorio.texto) {
        return { ...relatorio, texto: textoLimitado };
      }
      return relatorio;
    },
    maxParalelo: options.maxParalelo ?? 3,
    tiposDisponiveis,
  };
}
