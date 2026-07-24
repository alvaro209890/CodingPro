import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PASTAS_PADRAO = ["Documents", "Downloads", "Projects", ".memory"] as const;

/** Raiz dos workspaces VPS — sobrescrevível via CODINGPRO_WORKSPACE_ROOT. */
export function raizWorkspace(): string {
  return (
    process.env.CODINGPRO_WORKSPACE_ROOT?.trim() || join(homedir(), "Documentos", "vps-workspaces")
  );
}

/** Diretório isolado do usuário, com pastas padrão criadas. */
export function dirUsuario(id: number): string {
  const dir = join(raizWorkspace(), String(id));
  mkdirSync(dir, { recursive: true });
  for (const pasta of PASTAS_PADRAO) {
    mkdirSync(join(dir, pasta), { recursive: true });
  }
  return dir;
}
