import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CoreError } from "./errors.js";
import {
  buscarMemorias,
  descricaoDe,
  gerarIndice,
  hojeIso,
  MEMORY_MAX_BYTES,
  type Memoria,
  pareceSegredo,
  parseMemoria,
  type RetrievalOptions,
  serializarMemoria,
  slugify,
  type TipoMemoria,
} from "./memory.js";

/**
 * Armazenamento de memória num diretório (`~/.codingpro/memory` global ou `.codingpro/memory` do
 * projeto). Um arquivo `<slug>.md` por fato, índice `MEMORY.md` regenerado a cada escrita, arquivos
 * `_*` reservados (`_archive/`, `_changelog.md`). Toda escrita fica contida no diretório da memória.
 */
export class MemoryStore {
  private constructor(readonly dir: string) {}

  /** Não cria o diretório: só a escrita o materializa, para não poluir projetos sem memória. */
  static create(dir: string): MemoryStore {
    return new MemoryStore(dir);
  }

  private async garantirDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private arquivo(name: string): string {
    return join(this.dir, `${slugify(name)}.md`);
  }

  /** Lê todas as memórias válidas do diretório (ignora `MEMORY.md` e arquivos `_*`). */
  async list(): Promise<Memoria[]> {
    let entradas: string[];
    try {
      entradas = await readdir(this.dir);
    } catch {
      return [];
    }
    const memorias: Memoria[] = [];
    for (const nome of entradas.sort()) {
      if (!nome.endsWith(".md") || nome === "MEMORY.md" || nome.startsWith("_")) {
        continue;
      }
      try {
        const texto = await readFile(join(this.dir, nome), "utf8");
        const m = parseMemoria(nome.replace(/\.md$/u, ""), texto);
        if (m !== undefined) {
          memorias.push(m);
        }
      } catch {
        // arquivo ilegível → ignora
      }
    }
    return memorias;
  }

  /** Uma memória por slug, ou `undefined` se ausente/ilegível. */
  async get(name: string): Promise<Memoria | undefined> {
    try {
      const texto = await readFile(this.arquivo(name), "utf8");
      return parseMemoria(slugify(name), texto);
    } catch {
      return undefined;
    }
  }

  /**
   * Grava um fato: se já existe memória com o mesmo slug, reforça (`strength+1`, `updated=hoje`) e
   * substitui o corpo; senão cria. Recusa valores de segredo. Regenera o índice. Devolve a memória.
   */
  async remember(fato: string, type: TipoMemoria, name?: string): Promise<Memoria> {
    const corpo = fato.trim();
    if (corpo.length === 0) {
      throw new CoreError("invalid-input", "O fato a lembrar não pode ser vazio.");
    }
    if (Buffer.byteLength(corpo, "utf8") > MEMORY_MAX_BYTES) {
      throw new CoreError("too-large", "O fato é grande demais para uma única memória.");
    }
    if (pareceSegredo(corpo)) {
      throw new CoreError(
        "invalid-input",
        "Recusado: o texto parece conter um valor de segredo. Guarde onde encontrá-lo, não o valor.",
      );
    }
    const slug = slugify(name ?? descricaoDe(corpo));
    const existente = await this.get(slug);
    const hoje = hojeIso();
    const memoria: Memoria = {
      body: corpo,
      created: existente?.created ?? hoje,
      description: descricaoDe(corpo),
      name: slug,
      strength: (existente?.strength ?? 0) + 1,
      type,
      updated: hoje,
    };
    await this.garantirDir();
    await writeFile(this.arquivo(slug), serializarMemoria(memoria), "utf8");
    await this.reindexar();
    return memoria;
  }

  /** Move uma memória para `_archive/` (nunca deleta direto). `true` se havia o arquivo. */
  async forget(name: string): Promise<boolean> {
    const slug = slugify(name);
    const origem = this.arquivo(slug);
    const existente = await this.get(slug);
    if (existente === undefined) {
      return false;
    }
    const archiveDir = join(this.dir, "_archive");
    await mkdir(archiveDir, { recursive: true });
    try {
      await rename(origem, join(archiveDir, `${slug}.md`));
    } catch {
      // se o rename falhar (ex. cross-device), remove mesmo assim para não duplicar
      await unlink(origem).catch(() => undefined);
    }
    await registrarChangelog(this.dir, `arquivada ${slug}`);
    await this.reindexar();
    return true;
  }

  /** Regenera `MEMORY.md` a partir das memórias atuais. */
  async reindexar(): Promise<void> {
    const memorias = await this.list();
    await this.garantirDir();
    await writeFile(join(this.dir, "MEMORY.md"), gerarIndice(memorias), "utf8");
  }

  /** Lê o índice `MEMORY.md` (sempre injetado no contexto). Vazio se ausente. */
  async indice(): Promise<string> {
    try {
      return await readFile(join(this.dir, "MEMORY.md"), "utf8");
    } catch {
      return "";
    }
  }

  /** Top-K memórias relevantes para uma consulta, dentro do orçamento de tokens. */
  async buscar(consulta: string, options?: RetrievalOptions): Promise<Memoria[]> {
    return buscarMemorias(await this.list(), consulta, options);
  }
}

async function registrarChangelog(dir: string, linha: string): Promise<void> {
  const arquivo = join(dir, "_changelog.md");
  try {
    const anterior = await readFile(arquivo, "utf8").catch(() => "");
    await writeFile(arquivo, `${anterior}- ${hojeIso()} — ${linha}\n`, "utf8");
  } catch {
    // changelog é auditoria best-effort; nunca bloqueia a operação
  }
}
