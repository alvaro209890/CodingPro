import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readFileWithin } from "./fs-safe.js";
import { RepoMapCache } from "./repo-map-cache.js";
import { extrairSimbolos, linguagemDeArquivo, type Simbolo } from "./symbols.js";
import type { Workspace } from "./workspace.js";

/**
 * Repo map estilo Aider, em TS puro: varre o projeto, extrai assinaturas (não corpos), ranqueia
 * arquivos por importância (quantas vezes seus símbolos são citados em outros arquivos + vizinhos
 * do foco) e emite um mapa textual compacto e estável dentro de um orçamento de tokens. Só lê.
 */

const IGNORAR_DIRS = new Set([
  ".cache",
  ".codingpro",
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
  "venv",
]);

export const REPO_MAP_MAX_ARQUIVOS = 2_000;
export const REPO_MAX_FILE_BYTES = 1_048_576; // 1 MiB por arquivo
export const REPO_MAP_ORCAMENTO_TOKENS = 2_000;
const MAX_PROFUNDIDADE = 12;
const MAX_SIMBOLOS_POR_ARQUIVO = 30;
const MAX_IDENTIFICADORES = 4_000;
const FOCO_BOOST = 1_000;
const VIZINHO_BOOST = 50;

export interface RepoMapOptions {
  /** Caminhos relativos a priorizar (arquivos citados no pedido); recebem boost de ranking. */
  readonly foco?: readonly string[];
  readonly maxArquivos?: number;
  readonly orcamentoTokens?: number;
  /** Diretório onde persistir o cache incremental; ausente → cache só em memória. */
  readonly cacheDir?: string;
  readonly signal?: AbortSignal;
}

export interface RepoMapArquivo {
  readonly caminho: string;
  readonly simbolos: readonly Simbolo[];
  readonly score: number;
}

export interface RepoMap {
  /** Mapa textual pronto para o contexto do modelo. */
  readonly texto: string;
  /** Arquivos incluídos no mapa, do mais para o menos importante. */
  readonly arquivos: readonly RepoMapArquivo[];
  /** Total de arquivos indexáveis encontrados (antes do orçamento). */
  readonly totalArquivos: number;
  /** `true` se o orçamento de tokens cortou arquivos/símbolos. */
  readonly truncado: boolean;
}

interface ArquivoIndexado {
  readonly rel: string;
  readonly simbolos: readonly Simbolo[];
  readonly identificadores: ReadonlySet<string>;
}

const RE_IDENTIFICADOR = /[A-Za-z_$][\w$]*/gu;

/** Conjunto de identificadores distintos de um texto (com teto), base do grafo de referências. */
function identificadoresDe(texto: string): Set<string> {
  const set = new Set<string>();
  const encontrados = texto.match(RE_IDENTIFICADOR);
  if (encontrados === null) {
    return set;
  }
  for (const id of encontrados) {
    set.add(id);
    if (set.size >= MAX_IDENTIFICADORES) {
      break;
    }
  }
  return set;
}

/** Estima tokens de um trecho (~4 chars/token, alinhado ao resto do núcleo). */
function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 4);
}

async function coletarArquivos(
  workspace: Workspace,
  maxArquivos: number,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  const relativos: string[] = [];
  const fila: { rel: string; profundidade: number }[] = [{ profundidade: 0, rel: "." }];
  while (fila.length > 0 && relativos.length < maxArquivos) {
    const atual = fila.shift();
    if (atual === undefined || signal?.aborted === true) {
      break;
    }
    const absolute = atual.rel === "." ? workspace.root : join(workspace.root, atual.rel);
    let entradas: Dirent[];
    try {
      entradas = await readdir(absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entrada of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entrada.isSymbolicLink()) {
        continue;
      }
      const rel = atual.rel === "." ? entrada.name : `${atual.rel}/${entrada.name}`;
      if (entrada.isDirectory()) {
        if (!IGNORAR_DIRS.has(entrada.name) && atual.profundidade < MAX_PROFUNDIDADE) {
          fila.push({ profundidade: atual.profundidade + 1, rel });
        }
      } else if (entrada.isFile() && linguagemDeArquivo(entrada.name) !== undefined) {
        relativos.push(rel);
        if (relativos.length >= maxArquivos) {
          break;
        }
      }
    }
  }
  return relativos;
}

async function indexarArquivo(
  workspace: Workspace,
  rel: string,
  cache: RepoMapCache,
): Promise<ArquivoIndexado | undefined> {
  const linguagem = linguagemDeArquivo(rel);
  if (linguagem === undefined) {
    return undefined;
  }
  const absolute = workspace.resolve(rel);
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(absolute);
  } catch {
    return undefined;
  }
  let texto: string;
  try {
    texto = (await readFileWithin(workspace, absolute, REPO_MAX_FILE_BYTES)).toString("utf8");
  } catch {
    return undefined;
  }
  const cacheado = cache.obter(rel, stats.mtimeMs, stats.size);
  const simbolos = cacheado ?? extrairSimbolos(linguagem, texto);
  if (cacheado === undefined) {
    cache.definir(rel, stats.mtimeMs, stats.size, simbolos);
  }
  return { identificadores: identificadoresDe(texto), rel, simbolos };
}

/** Normaliza um caminho de foco (aceita citações com barra invertida do Windows). */
function normalizarFoco(foco: readonly string[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const f of foco ?? []) {
    const limpo = f.replaceAll("\\", "/").replace(/^\.\//, "").trim();
    if (limpo.length > 0) {
      set.add(limpo);
    }
  }
  return set;
}

function ranquear(
  indexados: readonly ArquivoIndexado[],
  foco: ReadonlySet<string>,
): RepoMapArquivo[] {
  // Índice invertido: identificador → nº de arquivos que o contêm. Base das referências.
  const contagem = new Map<string, number>();
  for (const arq of indexados) {
    for (const id of arq.identificadores) {
      contagem.set(id, (contagem.get(id) ?? 0) + 1);
    }
  }
  // Identificadores citados nos arquivos de foco → vizinhos no grafo ganham boost.
  const idsFoco = new Set<string>();
  for (const arq of indexados) {
    if (foco.has(arq.rel)) {
      for (const id of arq.identificadores) {
        idsFoco.add(id);
      }
    }
  }

  const ranqueados = indexados.map((arq) => {
    let referencias = 0;
    let vizinho = 0;
    for (const s of arq.simbolos) {
      const emOutros = (contagem.get(s.nome) ?? 0) - (arq.identificadores.has(s.nome) ? 1 : 0);
      referencias += Math.max(0, emOutros);
      if (idsFoco.has(s.nome) && !foco.has(arq.rel)) {
        vizinho = VIZINHO_BOOST;
      }
    }
    const score =
      referencias + arq.simbolos.length * 0.25 + vizinho + (foco.has(arq.rel) ? FOCO_BOOST : 0);
    return { caminho: arq.rel, score, simbolos: arq.simbolos };
  });

  return ranqueados
    .filter((a) => a.simbolos.length > 0 || foco.has(a.caminho))
    .sort((a, b) => b.score - a.score || a.caminho.localeCompare(b.caminho));
}

const TIPO_SIGLA: Readonly<Record<Simbolo["tipo"], string>> = {
  classe: "classe",
  constante: "const",
  função: "fn",
  interface: "interface",
  método: "método",
  tabela: "tabela",
  tipo: "tipo",
};

function renderizarArquivo(arq: RepoMapArquivo): string {
  if (arq.simbolos.length === 0) {
    return `${arq.caminho}\n`;
  }
  const linhas = arq.simbolos
    .slice(0, MAX_SIMBOLOS_POR_ARQUIVO)
    .map((s) => `  ${TIPO_SIGLA[s.tipo]} ${s.nome}`);
  if (arq.simbolos.length > MAX_SIMBOLOS_POR_ARQUIVO) {
    linhas.push(`  … (+${arq.simbolos.length - MAX_SIMBOLOS_POR_ARQUIVO})`);
  }
  return `${arq.caminho}\n${linhas.join("\n")}\n`;
}

/**
 * Constrói o repo map do workspace. Varre (com ignore/tetos), extrai assinaturas (com cache
 * incremental por mtime+size), ranqueia e monta o texto dentro do orçamento de tokens.
 */
export async function construirRepoMap(
  workspace: Workspace,
  options: RepoMapOptions = {},
): Promise<RepoMap> {
  const maxArquivos = Math.max(1, Math.min(options.maxArquivos ?? REPO_MAP_MAX_ARQUIVOS, 10_000));
  const orcamento = Math.max(1, options.orcamentoTokens ?? REPO_MAP_ORCAMENTO_TOKENS);
  const cache =
    options.cacheDir === undefined
      ? RepoMapCache.emMemoria()
      : await RepoMapCache.carregar(join(options.cacheDir, "repo-map-cache.json"));

  const relativos = await coletarArquivos(workspace, maxArquivos, options.signal);
  const indexados: ArquivoIndexado[] = [];
  for (const rel of relativos) {
    if (options.signal?.aborted === true) {
      break;
    }
    const arq = await indexarArquivo(workspace, rel, cache);
    if (arq !== undefined) {
      indexados.push(arq);
    }
  }
  await cache.salvar();

  const foco = normalizarFoco(options.foco);
  const ranqueados = ranquear(indexados, foco);

  const incluidos: RepoMapArquivo[] = [];
  const partes: string[] = [];
  let tokens = 0;
  let truncado = false;
  for (const arq of ranqueados) {
    const bloco = renderizarArquivo(arq);
    const custo = estimarTokens(bloco);
    if (tokens + custo > orcamento && incluidos.length > 0) {
      truncado = true;
      break;
    }
    partes.push(bloco);
    incluidos.push(arq);
    tokens += custo;
  }
  if (incluidos.length < ranqueados.length) {
    truncado = true;
  }

  const texto =
    partes.length === 0
      ? "(nenhum arquivo de código indexável encontrado)"
      : partes.join("\n").trimEnd();

  return { arquivos: incluidos, texto, totalArquivos: indexados.length, truncado };
}
