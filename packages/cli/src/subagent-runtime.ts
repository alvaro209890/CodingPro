import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EFFECT_TOOLS,
  executarSubagente,
  type MemoryScope,
  MEMORY_TOOLS,
  parseTipoAgente,
  READ_ONLY_TOOLS,
  resolverTipoAgente,
  type SubagenteRelatorio,
  type SubagenteSpawner,
  type TipoAgente,
  TIPOS_AGENTE_PADRAO,
  type Workspace,
} from "@codingpro/core";
import type { Provider } from "@codingpro/llm";

/** Pool de tools que um subagente pode receber (o tipo filtra); nunca inclui `task` (sem aninhar). */
const POOL_SUBAGENTE = [...READ_ONLY_TOOLS, ...MEMORY_TOOLS, ...EFFECT_TOOLS];

/** Timeout padrão de um subagente. */
const SUBAGENTE_TIMEOUT_MS = 120_000;

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
  readonly memory?: MemoryScope;
  /** Tipos custom já carregados (de `.codingpro/agents`). */
  readonly custom?: Record<string, TipoAgente>;
  readonly maxParalelo?: number;
  readonly timeoutMs?: number;
}

/**
 * Cria a fábrica de subagentes para o `ToolContext`. Reusa o provider da sessão (roteamento por
 * papel fica de upgrade). Contexto isolado: workspace + memória, sem checkpoints.
 */
export function criarSpawnerSubagentes(options: SpawnerOptions): SubagenteSpawner {
  const custom = options.custom ?? {};
  const tiposDisponiveis = [
    ...new Set([...Object.keys(TIPOS_AGENTE_PADRAO), ...Object.keys(custom)]),
  ].sort();
  return {
    async executar(tipoNome, prompt, signal): Promise<SubagenteRelatorio> {
      const tipo = resolverTipoAgente(tipoNome, custom);
      if (tipo === undefined) {
        throw new Error(`Tipo de subagente desconhecido: ${tipoNome}.`);
      }
      return executarSubagente({
        context: {
          workspace: options.workspace,
          ...(options.memory === undefined ? {} : { memory: options.memory }),
        },
        prompt,
        provider: options.provider,
        timeoutMs: options.timeoutMs ?? SUBAGENTE_TIMEOUT_MS,
        tipo,
        toolPool: POOL_SUBAGENTE,
        ...(signal === undefined ? {} : { signal }),
      });
    },
    maxParalelo: options.maxParalelo ?? 3,
    tiposDisponiveis,
  };
}
