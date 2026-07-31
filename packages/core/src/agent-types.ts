import type { ModelRole } from "@codingpro/llm";

/**
 * Tipos de subagente: perfil (papel de esforço), tools permitidas e system prompt. Os quatro padrões
 * de fábrica cobrem exploração, trabalho, planejamento e revisão. Tipos custom vêm de
 * `.codingpro/agents/<nome>.md` (frontmatter `role`/`tools` + corpo = prompt), sem provider nem ID de
 * modelo arbitrário — todos os papéis usam **DeepSeek V4 Flash**; o papel decide só o esforço de
 * raciocínio (`main`/`auto` → `max`, `fast` → `high`).
 */
export interface TipoAgente {
  readonly nome: string;
  readonly descricao: string;
  readonly role: ModelRole;
  /** Nomes de tools que o subagente pode usar; vazio = nenhuma. */
  readonly tools: readonly string[];
  readonly systemPrompt: string;
}

const TOOLS_LEITURA = ["read_file", "list_dir", "grep", "repo_map", "code_search"] as const;

/** Tipo `explorer`: só leitura/busca, modelo rápido. */
export const AGENTE_EXPLORER: TipoAgente = {
  descricao: "Explora e busca no código (só leitura).",
  nome: "explorer",
  role: "fast",
  systemPrompt:
    "Você é um subagente explorador. Investigue o código do projeto com as ferramentas de leitura e " +
    "busca e devolva um relatório objetivo do que encontrou (arquivos, símbolos, caminhos relevantes). " +
    "Não escreva nem altere nada. Responda em português, conciso.",
  tools: [...TOOLS_LEITURA],
};

/** Tipo `reviewer`: só leitura, reporta achados por severidade. */
export const AGENTE_REVIEWER: TipoAgente = {
  descricao: "Revisa código e reporta achados (só leitura).",
  nome: "reviewer",
  role: "main",
  systemPrompt:
    "Você é um subagente revisor. Analise o código indicado e reporte achados no formato " +
    "`{arquivo, linha, severidade, resumo, cenário de falha}`, do mais grave ao menos grave. " +
    "Não altere nada. Responda em português.",
  tools: [...TOOLS_LEITURA],
};

/** Tipo `architect`: só leitura, produz plano em Markdown; reasoning alto. */
export const AGENTE_ARCHITECT: TipoAgente = {
  descricao: "Planeja tarefas grandes em Markdown (só leitura).",
  nome: "architect",
  role: "main",
  systemPrompt:
    "Você é um subagente arquiteto. Sem alterar arquivos, produza um PLANO em Markdown para a tarefa " +
    "pedida: contexto, passos numerados (checklist), riscos e critério de pronto. Use as ferramentas " +
    "de leitura para embasar o plano. Responda apenas com o plano, em português.",
  tools: [...TOOLS_LEITURA],
};

/** Tipo `worker`: geral. Efeitos ainda passam pelo gate (negados sem aprovação na v1). */
export const AGENTE_WORKER: TipoAgente = {
  descricao: "Trabalho geral (leitura + edição sob permissão).",
  nome: "worker",
  role: "auto",
  systemPrompt:
    "Você é um subagente de trabalho. Execute a tarefa pedida usando as ferramentas disponíveis e " +
    "devolva um relatório do que fez. Responda em português, conciso.",
  tools: [...TOOLS_LEITURA, "edit_file", "write_file", "remember"],
};

/** Tipos de fábrica, por nome. */
export const TIPOS_AGENTE_PADRAO: Readonly<Record<string, TipoAgente>> = {
  architect: AGENTE_ARCHITECT,
  explorer: AGENTE_EXPLORER,
  reviewer: AGENTE_REVIEWER,
  worker: AGENTE_WORKER,
};

function roleValido(valor: string | undefined): ModelRole | undefined {
  return valor === "auto" || valor === "main" || valor === "fast" ? valor : undefined;
}

/**
 * Lê um tipo custom de um arquivo `.md` com frontmatter (`role`, `tools`) e corpo = system prompt.
 * Best-effort: campos ausentes herdam defaults sensatos; frontmatter ausente → `undefined`.
 */
export function parseTipoAgente(nome: string, texto: string): TipoAgente | undefined {
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
  const tools =
    meta.tools === undefined
      ? [...TOOLS_LEITURA]
      : meta.tools
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
  return {
    descricao: meta.description ?? `Tipo custom ${nome}.`,
    nome,
    role: roleValido(meta.role) ?? "auto",
    systemPrompt: body.length > 0 ? body : `Você é o subagente ${nome}. Responda em português.`,
    tools,
  };
}

/** Resolve um nome de tipo contra os padrões + os custom carregados. */
export function resolverTipoAgente(
  nome: string,
  custom: Readonly<Record<string, TipoAgente>> = {},
): TipoAgente | undefined {
  return custom[nome] ?? TIPOS_AGENTE_PADRAO[nome];
}
