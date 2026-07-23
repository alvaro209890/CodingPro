import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { CoreError } from "./errors.js";
import { readFileWithin } from "./fs-safe.js";
import type { Workspace } from "./workspace.js";

/** Resumo do projeto detectado, exibido no contexto e materializado pelo `/init`. */
export interface ProjetoInfo {
  readonly nome?: string;
  readonly linguagens: readonly string[];
  readonly gerenciador?: string;
  readonly framework?: string;
  readonly ferramentaTestes?: string;
  readonly monorepo: boolean;
  readonly scripts: Readonly<Record<string, string>>;
}

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

const EXT_LINGUAGEM: Readonly<Record<string, string>> = {
  ".c": "C",
  ".cc": "C++",
  ".cpp": "C++",
  ".cs": "C#",
  ".go": "Go",
  ".java": "Java",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".php": "PHP",
  ".py": "Python",
  ".rb": "Ruby",
  ".rs": "Rust",
  ".sql": "SQL",
  ".svelte": "Svelte",
  ".swift": "Swift",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".vue": "Vue",
};

const MAX_ARQUIVOS = 5000;
const MAX_PROFUNDIDADE = 6;

async function lerSeExiste(workspace: Workspace, rel: string): Promise<string | undefined> {
  try {
    const absolute = workspace.resolve(rel);
    return (await readFileWithin(workspace, absolute, 262_144)).toString("utf8");
  } catch (error) {
    if (error instanceof CoreError) {
      return undefined; // ausente, grande demais ou fora do sandbox → ignora
    }
    throw error;
  }
}

function jsonSeguro(texto: string | undefined): Record<string, unknown> | undefined {
  if (texto === undefined) {
    return undefined;
  }
  try {
    const valor = JSON.parse(texto) as unknown;
    return typeof valor === "object" && valor !== null
      ? (valor as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Varre a árvore (raso, com ignore e tetos) e conta extensões de código. */
export async function contarExtensoes(workspace: Workspace): Promise<Map<string, number>> {
  const contagem = new Map<string, number>();
  let total = 0;
  const fila: { rel: string; profundidade: number }[] = [{ profundidade: 0, rel: "." }];
  while (fila.length > 0 && total < MAX_ARQUIVOS) {
    const atual = fila.shift();
    if (atual === undefined) {
      break;
    }
    const absolute = atual.rel === "." ? workspace.root : join(workspace.root, atual.rel);
    let entradas: Dirent[];
    try {
      entradas = await readdir(absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entrada of entradas) {
      if (entrada.isSymbolicLink()) {
        continue;
      }
      if (entrada.isDirectory()) {
        if (IGNORAR_DIRS.has(entrada.name) || atual.profundidade >= MAX_PROFUNDIDADE) {
          continue;
        }
        fila.push({
          profundidade: atual.profundidade + 1,
          rel: atual.rel === "." ? entrada.name : `${atual.rel}/${entrada.name}`,
        });
      } else if (entrada.isFile()) {
        total += 1;
        const ext = extname(entrada.name).toLowerCase();
        if (EXT_LINGUAGEM[ext] !== undefined) {
          contagem.set(ext, (contagem.get(ext) ?? 0) + 1);
        }
      }
    }
  }
  return contagem;
}

function linguagensDe(contagem: Map<string, number>): string[] {
  const porLinguagem = new Map<string, number>();
  for (const [ext, n] of contagem) {
    const lang = EXT_LINGUAGEM[ext];
    if (lang !== undefined) {
      porLinguagem.set(lang, (porLinguagem.get(lang) ?? 0) + n);
    }
  }
  return [...porLinguagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([lang]) => lang);
}

const FRAMEWORKS_NODE: readonly (readonly [string, string])[] = [
  ["next", "Next.js"],
  ["nuxt", "Nuxt"],
  ["@remix-run/react", "Remix"],
  ["astro", "Astro"],
  ["react-native", "React Native"],
  ["@angular/core", "Angular"],
  ["@nestjs/core", "NestJS"],
  ["electron", "Electron"],
  ["svelte", "Svelte"],
  ["vue", "Vue"],
  ["react", "React"],
  ["fastify", "Fastify"],
  ["koa", "Koa"],
  ["express", "Express"],
];

const TESTES_NODE: readonly (readonly [string, string])[] = [
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["@playwright/test", "Playwright"],
  ["cypress", "Cypress"],
  ["mocha", "Mocha"],
  ["ava", "AVA"],
];

function primeiroPresente(
  deps: Readonly<Record<string, unknown>>,
  tabela: readonly (readonly [string, string])[],
): string | undefined {
  for (const [chave, nome] of tabela) {
    if (deps[chave] !== undefined) {
      return nome;
    }
  }
  return undefined;
}

function depsDe(pkg: Record<string, unknown>): Record<string, unknown> {
  const dep = (pkg.dependencies as Record<string, unknown> | undefined) ?? {};
  const dev = (pkg.devDependencies as Record<string, unknown> | undefined) ?? {};
  return { ...dep, ...dev };
}

function scriptsDe(pkg: Record<string, unknown>): Record<string, string> {
  const scripts = pkg.scripts;
  if (typeof scripts !== "object" || scripts === null) {
    return {};
  }
  const saida: Record<string, string> = {};
  for (const [nome, cmd] of Object.entries(scripts)) {
    if (typeof cmd === "string") {
      saida[nome] = cmd;
    }
  }
  return saida;
}

/** Alvos de um Makefile (linhas `alvo:` que não são variáveis nem `.PHONY`). */
export function alvosMakefile(texto: string): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const linha of texto.split("\n")) {
    const m = /^([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\s*:(?!=)/.exec(linha);
    if (m?.[1] !== undefined && !m[1].startsWith(".")) {
      saida[m[1]] = "make";
    }
  }
  return saida;
}

async function gerenciadorNode(
  workspace: Workspace,
  pkg: Record<string, unknown>,
): Promise<string | undefined> {
  const campo = pkg.packageManager;
  if (typeof campo === "string") {
    return campo.split("@")[0];
  }
  const locks: readonly (readonly [string, string])[] = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "Yarn"],
    ["bun.lockb", "Bun"],
    ["package-lock.json", "npm"],
  ];
  for (const [arquivo, nome] of locks) {
    if ((await lerSeExiste(workspace, arquivo)) !== undefined) {
      return nome;
    }
  }
  return "npm";
}

/**
 * Detecta linguagens, framework, gerenciador de pacotes, ferramenta de testes, scripts e se é
 * monorepo — a partir de arquivos-marcador na raiz e de uma varredura rasa de extensões. Pura de
 * efeitos: só lê. Faz o melhor esforço; campos indetectáveis ficam ausentes.
 */
export async function detectarProjeto(workspace: Workspace): Promise<ProjetoInfo> {
  const linguagens = linguagensDe(await contarExtensoes(workspace));
  const scripts: Record<string, string> = {};
  let nome: string | undefined;
  let gerenciador: string | undefined;
  let framework: string | undefined;
  let ferramentaTestes: string | undefined;
  let monorepo = false;

  const pkg = jsonSeguro(await lerSeExiste(workspace, "package.json"));
  if (pkg !== undefined) {
    if (typeof pkg.name === "string") {
      nome = pkg.name;
    }
    Object.assign(scripts, scriptsDe(pkg));
    const deps = depsDe(pkg);
    framework = primeiroPresente(deps, FRAMEWORKS_NODE);
    ferramentaTestes = primeiroPresente(deps, TESTES_NODE);
    gerenciador = await gerenciadorNode(workspace, pkg);
    monorepo = pkg.workspaces !== undefined;
  }

  for (const marcador of ["pnpm-workspace.yaml", "lerna.json", "turbo.json", "nx.json"]) {
    if ((await lerSeExiste(workspace, marcador)) !== undefined) {
      monorepo = true;
    }
  }

  const makefile = await lerSeExiste(workspace, "Makefile");
  if (makefile !== undefined) {
    Object.assign(scripts, alvosMakefile(makefile));
  }

  // Marcadores de outras linguagens (framework/gerenciador quando o Node não cobriu).
  const cargo = await lerSeExiste(workspace, "Cargo.toml");
  if (cargo !== undefined) {
    gerenciador ??= "Cargo";
    nome ??= /name\s*=\s*"([^"]+)"/.exec(cargo)?.[1];
  }
  if ((await lerSeExiste(workspace, "go.mod")) !== undefined) {
    gerenciador ??= "go modules";
  }
  const pyproject = await lerSeExiste(workspace, "pyproject.toml");
  const requirements = await lerSeExiste(workspace, "requirements.txt");
  const py = `${pyproject ?? ""}\n${requirements ?? ""}`.toLowerCase();
  if (pyproject !== undefined || requirements !== undefined) {
    gerenciador ??= py.includes("[tool.poetry]") ? "Poetry" : "pip";
    framework ??= py.includes("django")
      ? "Django"
      : py.includes("fastapi")
        ? "FastAPI"
        : py.includes("flask")
          ? "Flask"
          : undefined;
    ferramentaTestes ??= py.includes("pytest") ? "pytest" : undefined;
  }

  return {
    ferramentaTestes,
    framework,
    gerenciador,
    linguagens,
    monorepo,
    scripts,
    ...(nome === undefined ? {} : { nome }),
  } as ProjetoInfo;
}

/** Linha única pt-BR resumindo o projeto (para o cabeçalho do chat). */
export function resumoProjeto(info: ProjetoInfo): string {
  const partes: string[] = [];
  if (info.linguagens.length > 0) {
    partes.push(info.linguagens.join("/"));
  }
  if (info.framework !== undefined) {
    partes.push(info.framework);
  }
  if (info.gerenciador !== undefined) {
    partes.push(info.gerenciador);
  }
  if (info.monorepo) {
    partes.push("monorepo");
  }
  return partes.length === 0 ? "projeto sem marcadores conhecidos" : partes.join(" · ");
}

/** Gera o conteúdo de CODINGPRO.md a partir do projeto detectado. */
export function gerarCodingproMd(info: ProjetoInfo, data = new Date()): string {
  const iso = data.toISOString().slice(0, 10);
  const linha = (rotulo: string, valor: string | undefined): string =>
    `- **${rotulo}:** ${valor === undefined || valor.length === 0 ? "—" : valor}`;
  const nomesScripts = Object.keys(info.scripts);
  const blocoScripts =
    nomesScripts.length === 0
      ? "_Nenhum script detectado._"
      : nomesScripts
          .slice(0, 20)
          .map((n) => `- \`${n}\`: \`${info.scripts[n]}\``)
          .join("\n");

  return `# CODINGPRO.md

> Gerado por \`codingpro /init\` em ${iso}. Edite à vontade — este arquivo entra no contexto do agente.

## Projeto

${linha("Nome", info.nome)}
${linha("Linguagens", info.linguagens.join(", "))}
${linha("Framework", info.framework)}
${linha("Gerenciador de pacotes", info.gerenciador)}
${linha("Testes", info.ferramentaTestes)}
${linha("Monorepo", info.monorepo ? "sim" : "não")}

## Scripts

${blocoScripts}

## Convenções

_Descreva aqui as convenções que o agente deve seguir (estilo de código, padrões, o que evitar)._
`;
}
