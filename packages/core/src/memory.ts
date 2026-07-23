/**
 * Memória persistente em arquivos Markdown legíveis (1 arquivo = 1 fato), no formato que o Álvaro
 * já usa com Claude Code/Hermes. Este módulo é puro (sem IO): parsing/serialização de frontmatter,
 * geração de slug e do índice `MEMORY.md`, e o retrieval léxico (v1; FTS5/SQLite fica de upgrade).
 */

export type TipoMemoria = "feedback" | "project" | "reference" | "user";

const TIPOS = new Set<TipoMemoria>(["feedback", "project", "reference", "user"]);

/** Um fato de memória com seus metadados de frontmatter. */
export interface Memoria {
  readonly name: string;
  readonly description: string;
  readonly type: TipoMemoria;
  /** Data ISO (YYYY-MM-DD) de criação. */
  readonly created: string;
  /** Data ISO (YYYY-MM-DD) da última atualização/reforço. */
  readonly updated: string;
  /** Reforçada a cada uso/confirmação; base da poda por idade×força. */
  readonly strength: number;
  readonly body: string;
}

export const MEMORY_MAX_NOME = 64;
export const MEMORY_MAX_BYTES = 16_384;
const MEMORY_DESC_MAX = 200;

/** Normaliza um texto em um slug de arquivo estável e seguro (`a-z0-9-`). */
export function slugify(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, MEMORY_MAX_NOME)
    .replace(/-+$/gu, "");
  return base.length > 0 ? base : "memoria";
}

function tipoValido(valor: string | undefined): TipoMemoria | undefined {
  return valor !== undefined && TIPOS.has(valor as TipoMemoria)
    ? (valor as TipoMemoria)
    : undefined;
}

/** Data de hoje em ISO curto (YYYY-MM-DD). */
export function hojeIso(data = new Date()): string {
  return data.toISOString().slice(0, 10);
}

/** Serializa uma memória no formato Markdown+frontmatter. */
export function serializarMemoria(m: Memoria): string {
  return [
    "---",
    `name: ${m.name}`,
    `description: ${m.description}`,
    `type: ${m.type}`,
    `created: ${m.created}`,
    `updated: ${m.updated}`,
    `strength: ${m.strength}`,
    "---",
    "",
    m.body.trimEnd(),
    "",
  ].join("\n");
}

/**
 * Lê uma memória de um texto com frontmatter. Best-effort e fail-closed: campos ausentes recebem
 * default sensato; `type` inválido ou frontmatter ausente → `undefined` (arquivo ignorado).
 */
export function parseMemoria(name: string, texto: string): Memoria | undefined {
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
  const tipo = tipoValido(meta.type);
  if (tipo === undefined) {
    return undefined;
  }
  const strengthNum = Number.parseInt(meta.strength ?? "1", 10);
  return {
    body: (m[2] ?? "").trim(),
    created: meta.created ?? hojeIso(),
    description: (meta.description ?? "").slice(0, MEMORY_DESC_MAX),
    name: slugify(meta.name ?? name),
    strength: Number.isInteger(strengthNum) && strengthNum > 0 ? strengthNum : 1,
    type: tipo,
    updated: meta.updated ?? meta.created ?? hojeIso(),
  };
}

/** Deriva uma descrição de uma linha a partir do corpo do fato. */
export function descricaoDe(fato: string): string {
  const primeira = fato.trim().split(/\r?\n/u)[0] ?? "";
  const limpa = primeira.replace(/\s+/gu, " ").trim();
  return limpa.length > MEMORY_DESC_MAX ? `${limpa.slice(0, MEMORY_DESC_MAX - 1)}…` : limpa;
}

/** Conteúdo do índice `MEMORY.md` — uma linha por fato, carregado sempre no contexto. */
export function gerarIndice(memorias: readonly Memoria[]): string {
  if (memorias.length === 0) {
    return "# Índice de memória\n\n_Nenhuma memória ainda._\n";
  }
  const linhas = [...memorias]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => `- **${m.name}** (${m.type}) — ${m.description}`);
  return `# Índice de memória\n\n${linhas.join("\n")}\n`;
}

const RE_TERMO = /[A-Za-zÀ-ÿ0-9_]{2,}/gu;

/** Extrai termos de busca (>=2 chars, minúsculos) de um texto. */
export function termosDe(texto: string): string[] {
  const achados = texto.toLowerCase().match(RE_TERMO);
  return achados === null ? [] : achados;
}

/**
 * Pontuação léxica de uma memória contra um conjunto de termos: casamento em name/description
 * pesa mais que no corpo; a força (`strength`) dá um leve desempate. Sem embeddings (v1).
 */
export function pontuarMemoria(m: Memoria, termos: readonly string[]): number {
  if (termos.length === 0) {
    return 0;
  }
  const cabecalho = `${m.name} ${m.description}`.toLowerCase();
  const corpo = m.body.toLowerCase();
  let score = 0;
  for (const termo of new Set(termos)) {
    if (cabecalho.includes(termo)) {
      score += 3;
    }
    if (corpo.includes(termo)) {
      score += 1;
    }
  }
  return score > 0 ? score + Math.min(m.strength, 5) * 0.1 : 0;
}

export interface RetrievalOptions {
  readonly topK?: number;
  readonly orcamentoTokens?: number;
}

export const MEMORY_RETRIEVAL_TOP_K = 6;
export const MEMORY_RETRIEVAL_ORCAMENTO = 2_000;

function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 4);
}

/**
 * Seleciona as memórias mais relevantes para uma consulta, dentro de um orçamento de tokens.
 * Retorna da mais para a menos relevante; memórias com score zero são descartadas.
 */
export function buscarMemorias(
  memorias: readonly Memoria[],
  consulta: string,
  options: RetrievalOptions = {},
): Memoria[] {
  const topK = Math.max(1, options.topK ?? MEMORY_RETRIEVAL_TOP_K);
  const orcamento = Math.max(1, options.orcamentoTokens ?? MEMORY_RETRIEVAL_ORCAMENTO);
  const termos = termosDe(consulta);
  const ranqueadas = memorias
    .map((m) => ({ m, score: pontuarMemoria(m, termos) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.m.name.localeCompare(b.m.name));

  const escolhidas: Memoria[] = [];
  let tokens = 0;
  for (const { m } of ranqueadas) {
    if (escolhidas.length >= topK) {
      break;
    }
    const custo = estimarTokens(serializarMemoria(m));
    if (tokens + custo > orcamento && escolhidas.length > 0) {
      break;
    }
    escolhidas.push(m);
    tokens += custo;
  }
  return escolhidas;
}

const RE_SEGREDO: readonly RegExp[] = [
  /\b(sk|pk|rk)[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{16,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /-----BEGIN[ A-Z]*PRIVATE KEY-----/u,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
  /\b(?:senha|password|passwd|secret|token|api[_-]?key)\b\s*[:=]\s*\S{8,}/iu,
];

/** Heurística conservadora: parece conter um VALOR de segredo (não só a menção)? */
export function pareceSegredo(texto: string): boolean {
  return RE_SEGREDO.some((re) => re.test(texto));
}

export interface BlocoMemoriaEntrada {
  /** Índice `MEMORY.md` global (sempre injetado). */
  readonly indiceGlobal?: string;
  /** Índice `MEMORY.md` do projeto (sempre injetado quando há repo). */
  readonly indiceProjeto?: string;
  /** Memórias completas recuperadas por relevância para o turno. */
  readonly relevantes?: readonly Memoria[];
}

function limpoOuVazio(texto: string | undefined): string {
  const t = (texto ?? "").trim();
  return t.length === 0 || t.endsWith("_Nenhuma memória ainda._") ? "" : t;
}

/**
 * Monta o bloco de memória para anexar ao system prompt: os índices (sempre) + as memórias
 * relevantes completas (retrieval do turno). Devolve `""` quando não há nada útil a injetar.
 */
export function montarBlocoMemoria(entrada: BlocoMemoriaEntrada): string {
  const partes: string[] = [];
  const global = limpoOuVazio(entrada.indiceGlobal);
  const projeto = limpoOuVazio(entrada.indiceProjeto);
  if (global.length > 0) {
    partes.push(`### Memória global (índice)\n${global}`);
  }
  if (projeto.length > 0) {
    partes.push(`### Memória do projeto (índice)\n${projeto}`);
  }
  const relevantes = entrada.relevantes ?? [];
  if (relevantes.length > 0) {
    const corpos = relevantes.map((m) => `#### ${m.name} (${m.type})\n${m.body}`).join("\n\n");
    partes.push(`### Memórias relevantes ao pedido\n${corpos}`);
  }
  if (partes.length === 0) {
    return "";
  }
  return `## Memória\n\nUse estes fatos lembrados de sessões anteriores. Salve fatos novos com a ferramenta \`remember\`.\n\n${partes.join(
    "\n\n",
  )}`;
}
