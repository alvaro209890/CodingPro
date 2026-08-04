import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CoreError } from "./errors.js";
import { readFileWithin, removeFileWithin, writeFileWithin } from "./fs-safe.js";
import type { Workspace } from "./workspace.js";

/** Teto por arquivo capturado num checkpoint: 4 MiB. Acima disso o arquivo é omitido do undo. */
export const CHECKPOINT_MAX_FILE_BYTES = 4_194_304;

/**
 * Estado de um arquivo num instantâneo: `present` guarda o conteúdo, `absent` marca que o arquivo
 * não existia (undo de um "criar" apaga), `omitido` marca que era grande demais para versionar.
 */
export type FileStatus = "absent" | "omitido" | "present";

export interface FileSnapshot {
  readonly path: string;
  readonly status: FileStatus;
  readonly content?: string;
}

/** Metadados persistidos de um checkpoint (um passo de escrita, geralmente um turno). */
export interface CheckpointMeta {
  readonly seq: number;
  readonly id: string;
  readonly label: string;
  readonly timestamp: string;
  readonly files: readonly FileSnapshot[];
}

/** Interface estreita entregue às tools: captura pré-escrita e (no store completo) undo. */
export interface CheckpointRecorder {
  capture(relativePath: string): Promise<void>;
  undo?(n?: number): Promise<UndoResult>;
}

/** Resultado de um `undo`/`redo`: quantos passos e quais checkpoints foram aplicados. */
export interface UndoResult {
  readonly passos: number;
  readonly checkpoints: readonly CheckpointMeta[];
}

function novoId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nomeDir(seq: number): string {
  return String(seq).padStart(6, "0");
}

function ehSnapshot(value: unknown): value is FileSnapshot {
  const s = value as FileSnapshot | undefined;
  return (
    typeof s?.path === "string" &&
    (s.status === "present" || s.status === "absent" || s.status === "omitido") &&
    (s.status !== "present" || typeof s.content === "string")
  );
}

function ehMeta(value: unknown): value is CheckpointMeta {
  const m = value as CheckpointMeta | undefined;
  return (
    typeof m?.seq === "number" &&
    typeof m.id === "string" &&
    typeof m.label === "string" &&
    typeof m.timestamp === "string" &&
    Array.isArray(m.files) &&
    m.files.every(ehSnapshot)
  );
}

/**
 * Registro de checkpoints com desfazer/refazer. Antes de cada escrita, uma tool captura o estado
 * atual em disco do arquivo (incluindo edições manuais do usuário). `commit` fecha o passo num
 * checkpoint persistido em `.codingpro/checkpoints/<seq>/meta.json`. `undo` restaura o estado
 * anterior e guarda o estado atual numa pilha de refazer (só em memória, zerada a cada nova
 * escrita). Nunca toca no git do usuário — funciona igual em pastas com ou sem git.
 */
export class CheckpointStore implements CheckpointRecorder {
  private constructor(
    private readonly dir: string,
    private readonly workspace: Workspace,
    private readonly maxFileBytes: number,
    private readonly ativos: CheckpointMeta[],
    private proximoSeq: number,
  ) {}

  static async create(
    dir: string,
    workspace: Workspace,
    options?: { readonly maxFileBytes?: number },
  ): Promise<CheckpointStore> {
    await mkdir(dir, { recursive: true });
    const ativos = await CheckpointStore.carregar(dir);
    const maiorSeq = ativos.reduce((max, c) => Math.max(max, c.seq), 0);
    return new CheckpointStore(
      dir,
      workspace,
      options?.maxFileBytes ?? CHECKPOINT_MAX_FILE_BYTES,
      ativos,
      maiorSeq + 1,
    );
  }

  private static async carregar(dir: string): Promise<CheckpointMeta[]> {
    let entradas: Dirent[];
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const metas: CheckpointMeta[] = [];
    for (const entrada of entradas) {
      if (!entrada.isDirectory()) {
        continue;
      }
      try {
        const bruto = await readFile(join(dir, entrada.name, "meta.json"), "utf8");
        const meta = JSON.parse(bruto) as unknown;
        // Checkpoint corrompido é ignorado (não brica a CLI), não abortado.
        if (ehMeta(meta)) {
          metas.push(meta);
        }
      } catch {
        // dir sem meta.json legível → ignora
      }
    }
    return metas.sort((a, b) => a.seq - b.seq);
  }

  private pendente: { label: string; capturas: Map<string, FileSnapshot> } | undefined;
  private readonly refazer: CheckpointMeta[] = [];

  /** Abre um novo passo de escrita, descartando qualquer passo pendente não commitado. */
  begin(label: string): void {
    this.pendente = { capturas: new Map(), label };
  }

  async capture(relativePath: string): Promise<void> {
    if (this.pendente === undefined) {
      this.pendente = { capturas: new Map(), label: "" };
    }
    const absolute = this.workspace.resolve(relativePath);
    const rel = this.workspace.toRelative(absolute);
    if (this.pendente.capturas.has(rel)) {
      return; // primeira captura do passo vence (é o estado pré-escrita)
    }
    this.pendente.capturas.set(rel, await this.snapshot(rel, absolute));
  }

  private async snapshot(rel: string, absolute: string): Promise<FileSnapshot> {
    try {
      const conteudo = (await readFileWithin(this.workspace, absolute, this.maxFileBytes)).toString(
        "utf8",
      );
      return { content: conteudo, path: rel, status: "present" };
    } catch (error) {
      if (error instanceof CoreError && error.code === "not-found") {
        return { path: rel, status: "absent" };
      }
      if (error instanceof CoreError && error.code === "too-large") {
        return { path: rel, status: "omitido" };
      }
      throw error;
    }
  }

  /** Fecha o passo pendente num checkpoint persistido; descarta se nada foi capturado. */
  async commit(): Promise<CheckpointMeta | undefined> {
    const pendente = this.pendente;
    this.pendente = undefined;
    if (pendente === undefined || pendente.capturas.size === 0) {
      return undefined;
    }
    const meta: CheckpointMeta = {
      files: [...pendente.capturas.values()],
      id: novoId(),
      label: pendente.label,
      seq: this.proximoSeq,
      timestamp: new Date().toISOString(),
    };
    this.proximoSeq += 1;
    await this.persistir(meta);
    this.ativos.push(meta);
    this.refazer.length = 0; // nova escrita invalida o refazer
    return meta;
  }

  private async persistir(meta: CheckpointMeta): Promise<void> {
    const destino = join(this.dir, nomeDir(meta.seq));
    await mkdir(destino, { recursive: true });
    await writeFile(join(destino, "meta.json"), JSON.stringify(meta), "utf8");
  }

  private async restaurar(snap: FileSnapshot): Promise<void> {
    const absolute = this.workspace.resolve(snap.path);
    if (snap.status === "present") {
      await writeFileWithin(this.workspace, absolute, snap.content ?? "", this.maxFileBytes);
    } else if (snap.status === "absent") {
      await removeFileWithin(this.workspace, absolute);
    }
    // "omitido" não pode ser restaurado (arquivo grande demais) → pulado
  }

  private async snapshotAtual(files: readonly FileSnapshot[]): Promise<FileSnapshot[]> {
    const atuais: FileSnapshot[] = [];
    for (const f of files) {
      const absolute = this.workspace.resolve(f.path);
      atuais.push(await this.snapshot(f.path, absolute));
    }
    return atuais;
  }

  private async undoOnce(): Promise<CheckpointMeta | undefined> {
    const alvo = this.ativos.pop();
    if (alvo === undefined) {
      return undefined;
    }
    // Guarda o estado atual (o "depois") para permitir refazer.
    const registroRefazer: CheckpointMeta = {
      ...alvo,
      files: await this.snapshotAtual(alvo.files),
    };
    for (const snap of alvo.files) {
      await this.restaurar(snap);
    }
    await rm(join(this.dir, nomeDir(alvo.seq)), { force: true, recursive: true });
    this.refazer.push(registroRefazer);
    return alvo;
  }

  private async redoOnce(): Promise<CheckpointMeta | undefined> {
    const registro = this.refazer.pop();
    if (registro === undefined) {
      return undefined;
    }
    // Recria um checkpoint com o estado atual (o "antes" do redo) para que undo funcione depois.
    const antes: CheckpointMeta = {
      files: await this.snapshotAtual(registro.files),
      id: novoId(),
      label: registro.label,
      seq: this.proximoSeq,
      timestamp: new Date().toISOString(),
    };
    this.proximoSeq += 1;
    await this.persistir(antes);
    this.ativos.push(antes);
    for (const snap of registro.files) {
      await this.restaurar(snap);
    }
    return registro;
  }

  /** Desfaz os `n` últimos passos de escrita (restaura o estado anterior a cada um). */
  async undo(n = 1): Promise<UndoResult> {
    const checkpoints: CheckpointMeta[] = [];
    for (let i = 0; i < n; i += 1) {
      const c = await this.undoOnce();
      if (c === undefined) {
        break;
      }
      checkpoints.push(c);
    }
    return { checkpoints, passos: checkpoints.length };
  }

  /** Refaz os `n` últimos passos desfeitos (enquanto não houve nova escrita). */
  async redo(n = 1): Promise<UndoResult> {
    const checkpoints: CheckpointMeta[] = [];
    for (let i = 0; i < n; i += 1) {
      const c = await this.redoOnce();
      if (c === undefined) {
        break;
      }
      checkpoints.push(c);
    }
    return { checkpoints, passos: checkpoints.length };
  }

  /** Linha do tempo de checkpoints ativos (do mais recente para o mais antigo). */
  list(): readonly CheckpointMeta[] {
    return [...this.ativos].reverse();
  }

  /** Se há passos a refazer (só em memória, na sessão atual). */
  temRefazer(): boolean {
    return this.refazer.length > 0;
  }
}
