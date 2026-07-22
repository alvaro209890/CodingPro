import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { CoreError } from "./errors.js";
import type { Workspace } from "./workspace.js";

/** O_NOFOLLOW bloqueia symlink no componente final; ausente em alguns SOs → neutro (0). */
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

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
