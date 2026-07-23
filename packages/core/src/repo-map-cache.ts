import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Simbolo } from "./symbols.js";

/**
 * Cache incremental do repo map, invalidado por `mtime`+`size` de cada arquivo. É best-effort:
 * qualquer falha de IO ou JSON corrompido é tratada como cache frio (nunca lança). Persistido como
 * JSON simples; a troca por SQLite/FTS5 fica planejada para uma fase futura.
 */

const VERSAO = 1;

interface EntradaCache {
  readonly mtimeMs: number;
  readonly size: number;
  readonly simbolos: readonly Simbolo[];
}

interface ArquivoCache {
  readonly versao: number;
  readonly entradas: Record<string, EntradaCache>;
}

export class RepoMapCache {
  private readonly entradas = new Map<string, EntradaCache>();
  private sujo = false;

  private constructor(private readonly caminho: string | undefined) {}

  /** Cache em memória apenas, sem persistência (usado quando não há diretório de cache). */
  static emMemoria(): RepoMapCache {
    return new RepoMapCache(undefined);
  }

  /** Carrega o cache do disco; entradas inválidas ou versão diferente viram cache frio. */
  static async carregar(caminho: string): Promise<RepoMapCache> {
    const cache = new RepoMapCache(caminho);
    try {
      const bruto = await readFile(caminho, "utf8");
      const dados = JSON.parse(bruto) as ArquivoCache;
      if (
        dados.versao === VERSAO &&
        dados.entradas !== null &&
        typeof dados.entradas === "object"
      ) {
        for (const [rel, entrada] of Object.entries(dados.entradas)) {
          if (
            typeof entrada?.mtimeMs === "number" &&
            typeof entrada.size === "number" &&
            Array.isArray(entrada.simbolos)
          ) {
            cache.entradas.set(rel, entrada);
          }
        }
      }
    } catch {
      // ausente, ilegível ou corrompido → cache frio
    }
    return cache;
  }

  /** Símbolos cacheados para o arquivo se `mtime`+`size` baterem; senão `undefined`. */
  obter(rel: string, mtimeMs: number, size: number): readonly Simbolo[] | undefined {
    const entrada = this.entradas.get(rel);
    if (entrada !== undefined && entrada.mtimeMs === mtimeMs && entrada.size === size) {
      return entrada.simbolos;
    }
    return undefined;
  }

  /** Registra (ou atualiza) os símbolos de um arquivo. */
  definir(rel: string, mtimeMs: number, size: number, simbolos: readonly Simbolo[]): void {
    this.entradas.set(rel, { mtimeMs, simbolos, size });
    this.sujo = true;
  }

  /** Persiste no disco se houve mudança e há caminho. Best-effort: nunca lança. */
  async salvar(): Promise<void> {
    if (!this.sujo || this.caminho === undefined) {
      return;
    }
    const dados: ArquivoCache = { entradas: Object.fromEntries(this.entradas), versao: VERSAO };
    try {
      await mkdir(dirname(this.caminho), { recursive: true });
      await writeFile(this.caminho, JSON.stringify(dados), "utf8");
      this.sujo = false;
    } catch {
      // best-effort: falha ao persistir não invalida o mapa já construído
    }
  }
}
