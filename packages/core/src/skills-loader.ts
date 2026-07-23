import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseSkill, SKILL_MAX_BYTES, type Skill } from "./skills.js";

/** Diretórios de skills: global (`~/.codingpro/skills`) + do projeto (`.codingpro/skills`). */
export function dirsSkills(cwd: string, homeDir: string = homedir()): string[] {
  return [join(homeDir, ".codingpro", "skills"), join(cwd, ".codingpro", "skills")];
}

/** Carrega skills de `*.md` dos diretórios dados (best-effort; a do projeto vence por nome). */
export async function carregarSkills(dirs: readonly string[]): Promise<Skill[]> {
  const porNome = new Map<string, Skill>();
  for (const dir of dirs) {
    let arquivos: string[];
    try {
      arquivos = await readdir(dir);
    } catch {
      continue;
    }
    for (const nome of arquivos.sort()) {
      if (!nome.endsWith(".md")) {
        continue;
      }
      try {
        const texto = await readFile(join(dir, nome), "utf8");
        if (Buffer.byteLength(texto, "utf8") > SKILL_MAX_BYTES) {
          continue;
        }
        const skill = parseSkill(nome.replace(/\.md$/u, ""), texto);
        if (skill !== undefined) {
          porNome.set(skill.nome, skill);
        }
      } catch {
        // ignora arquivo ilegível
      }
    }
  }
  return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}
