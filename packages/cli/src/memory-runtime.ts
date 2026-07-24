import { homedir } from "node:os";
import { join } from "node:path";
import {
  MEMORY_RETRIEVAL_TOP_K,
  type MemoryScope,
  MemoryStore,
  montarBlocoMemoria,
} from "@codingpro/core";

/**
 * Memória de uma sessão da CLI: duas lojas (global em `~/.codingpro/memory` e do projeto em
 * `.codingpro/memory`) e a composição do system prompt do turno (índices sempre + memórias
 * recuperadas por relevância). A tool `remember` grava aqui via `scope`.
 */
export interface MemoriaSessao {
  readonly scope: MemoryScope;
  readonly global: MemoryStore;
  readonly projeto: MemoryStore;
  /** Anexa o bloco de memória (índices + retrieval do turno) ao prompt base. */
  promptDoTurno(base: string, consulta: string): Promise<string>;
}

/** Diretório padrão da memória global (`~/.codingpro/memory`). */
export function dirMemoriaGlobalPadrao(homeDir: string = homedir()): string {
  return join(homeDir, ".codingpro", "memory");
}

export function criarMemoriaSessao(
  cwd: string,
  globalDir: string = dirMemoriaGlobalPadrao(),
): MemoriaSessao {
  const global = MemoryStore.create(globalDir);
  const projeto = MemoryStore.create(join(cwd, ".codingpro", "memory"));
  const scope: MemoryScope = { global, projeto };
  return {
    global,
    projeto,
    scope,
    async promptDoTurno(base, consulta) {
      const [indiceGlobal, indiceProjeto, relGlobal, relProjeto] = await Promise.all([
        global.indice(),
        projeto.indice(),
        global.buscar(consulta),
        projeto.buscar(consulta),
      ]);
      const relevantes = [...relProjeto, ...relGlobal].slice(0, MEMORY_RETRIEVAL_TOP_K);
      const bloco = montarBlocoMemoria({ indiceGlobal, indiceProjeto, relevantes });
      return bloco.length === 0 ? base : `${base}\n\n${bloco}`;
    },
  };
}
