import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { CoreError } from "./errors.js";
import type { Workspace } from "./workspace.js";

/** O_NOFOLLOW bloqueia symlink no componente final; ausente em alguns SOs → neutro (0). */
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const READ_FLAGS = constants.O_RDONLY | O_NOFOLLOW;
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | O_NOFOLLOW;

export function toReadError(error: unknown): CoreError {
  if (error instanceof CoreError) {
    return error;
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case "ENOENT":
      return new CoreError("not-found", "O caminho não existe.");
    case "ELOOP":
      return new CoreError("path-escape", "O caminho passa por um link simbólico.");
    case "EISDIR":
      return new CoreError("not-a-file", "O caminho é um diretório, não um arquivo.");
    case "ENOTDIR":
      return new CoreError("not-a-file", "Um trecho do caminho não é um diretório.");
    case "EACCES":
    case "EPERM":
      return new CoreError("execution-failed", "Sem permissão para ler o arquivo.");
    default:
      return new CoreError("execution-failed", "Não foi possível ler o arquivo.");
  }
}

/**
 * Lê um arquivo regular contido no workspace sem seguir symlink no componente final e
 * reconfirmando a contenção por realpath (defesa contra symlink que escapa). Falha fechada.
 */
export async function readFileWithin(
  workspace: Workspace,
  absolute: string,
  maxBytes: number,
): Promise<Buffer> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(absolute, READ_FLAGS);
  } catch (error) {
    throw toReadError(error);
  }
  try {
    const stats = await handle.stat();
    if (stats.isDirectory()) {
      throw new CoreError("not-a-file", "O caminho é um diretório, não um arquivo.");
    }
    if (!stats.isFile()) {
      throw new CoreError("not-a-file", "O caminho não é um arquivo regular.");
    }
    if (stats.size > maxBytes) {
      throw new CoreError("too-large", "O arquivo é grande demais para ser lido.");
    }
    await workspace.realpathInside(absolute);
    // O fstat acima já garantiu o tamanho no mesmo descritor/inode.
    return handle.readFile();
  } finally {
    await handle.close();
  }
}

export function toWriteError(error: unknown): CoreError {
  if (error instanceof CoreError) {
    return error;
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case "ELOOP":
      return new CoreError("path-escape", "O destino é um link simbólico.");
    case "EISDIR":
      return new CoreError("not-a-file", "O destino é um diretório, não um arquivo.");
    case "EACCES":
    case "EPERM":
      return new CoreError("execution-failed", "Sem permissão para escrever no arquivo.");
    default:
      return new CoreError("execution-failed", "Não foi possível escrever o arquivo.");
  }
}

/**
 * Escreve um arquivo dentro do workspace sem seguir symlink no componente final e ancorando
 * a escrita no realpath do diretório-pai (defesa contra pai symlink que escapa). O diretório-pai
 * precisa existir — não cria árvore automaticamente. Devolve o total de bytes gravados.
 */
export async function writeFileWithin(
  workspace: Workspace,
  absolute: string,
  content: string,
  maxBytes: number,
): Promise<number> {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maxBytes) {
    throw new CoreError("too-large", "O conteúdo é grande demais para ser escrito.");
  }
  const realParent = await workspace.realpathInside(dirname(absolute));
  const target = join(realParent, basename(absolute));
  workspace.assertInside(target);

  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(target, WRITE_FLAGS, 0o644);
  } catch (error) {
    throw toWriteError(error);
  }
  try {
    await handle.writeFile(content, "utf8");
    return bytes;
  } catch (error) {
    throw toWriteError(error);
  } finally {
    await handle.close();
  }
}

/**
 * Remove um arquivo contido no workspace, ancorando no realpath do diretório-pai. `unlink` não
 * segue symlink no componente final (remove o próprio link). Ausência do arquivo ou do pai é
 * tratada como sucesso (idempotente) — usado pela restauração de checkpoint ao desfazer um "criar".
 */
export async function removeFileWithin(workspace: Workspace, absolute: string): Promise<void> {
  let realParent: string;
  try {
    realParent = await workspace.realpathInside(dirname(absolute));
  } catch (error) {
    if (error instanceof CoreError && error.code === "not-found") {
      return;
    }
    throw error;
  }
  const target = join(realParent, basename(absolute));
  workspace.assertInside(target);
  try {
    await unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return;
    }
    throw toWriteError(error);
  }
}
