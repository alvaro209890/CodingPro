/**
 * Skills: instruções empacotadas em Markdown com frontmatter (`~/.codingpro/skills/` e
 * `.codingpro/skills/`), no formato que o Álvaro já usa com Claude Code/Hermes. Este módulo é puro:
 * parsing e sugestão por relevância. O carregamento de disco e o comando `/skill` ficam no runtime.
 */
export interface Skill {
  readonly nome: string;
  readonly descricao: string;
  /** Corpo em Markdown injetado no contexto quando a skill é ativada. */
  readonly body: string;
}

export const SKILL_MAX_BYTES = 65_536;

/** Lê uma skill de um texto com frontmatter (`name`/`description`) + corpo. */
export function parseSkill(nome: string, texto: string): Skill | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(texto);
  if (m === null) {
    return undefined;
  }
  const meta: Record<string, string> = {};
  for (const linha of (m[1] ?? "").split(/\r?\n/u)) {
    const sep = linha.indexOf(":");
    if (sep > 0) {
      meta[linha.slice(0, sep).trim()] = linha.slice(sep + 1).trim();
    }
  }
  const body = (m[2] ?? "").trim();
  if (body.length === 0) {
    return undefined;
  }
  return {
    body,
    descricao: meta.description ?? "",
    nome: (meta.name ?? nome).trim(),
  };
}

const RE_TERMO = /[A-Za-zÀ-ÿ0-9_]{3,}/gu;

function termos(texto: string): Set<string> {
  const set = new Set<string>();
  const achados = texto.toLowerCase().match(RE_TERMO);
  if (achados !== null) {
    for (const t of achados) {
      set.add(t);
    }
  }
  return set;
}

/**
 * Sugere skills relevantes a um prompt por casamento de termos com nome+descrição. Retorna da mais
 * para a menos relevante, só as com casamento; sem embeddings (v1).
 */
export function sugerirSkills(skills: readonly Skill[], prompt: string, topK = 3): Skill[] {
  const termosPrompt = termos(prompt);
  if (termosPrompt.size === 0) {
    return [];
  }
  return skills
    .map((skill) => {
      const alvo = termos(`${skill.nome} ${skill.descricao}`);
      let score = 0;
      for (const t of alvo) {
        if (termosPrompt.has(t)) {
          score += 1;
        }
      }
      return { score, skill };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.nome.localeCompare(b.skill.nome))
    .slice(0, Math.max(1, topK))
    .map((x) => x.skill);
}

/** Bloco a injetar no contexto quando uma skill é ativada. */
export function blocoSkill(skill: Skill): string {
  return `## Skill: ${skill.nome}\n\n${skill.body}`;
}
