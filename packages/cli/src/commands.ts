/**
 * Catálogo canônico dos comandos do chat (`/` …). Usado pela UI de autocomplete e pela
 * mensagem de /ajuda — uma única fonte de verdade.
 */

export interface ComandoChat {
  /** Nome principal, com barra (ex.: `/ajuda`). */
  readonly nome: string;
  /** Aliases com barra (ex.: `/exit`). */
  readonly aliases: readonly string[];
  /** Descrição curta em pt-BR. */
  readonly descricao: string;
  /** Se true, após completar o nome a UI deixa um espaço para argumentos. */
  readonly aceitaArgs: boolean;
}

export const COMANDOS_CHAT: readonly ComandoChat[] = Object.freeze([
  {
    aceitaArgs: false,
    aliases: [],
    descricao: "lista os comandos disponíveis",
    nome: "/ajuda",
  },
  {
    aceitaArgs: false,
    aliases: ["/exit"],
    descricao: "encerra o chat",
    nome: "/sair",
  },
  {
    aceitaArgs: false,
    aliases: ["/cost"],
    descricao: "custo e tokens da sessão + contexto restante",
    nome: "/custo",
  },
  {
    aceitaArgs: false,
    aliases: ["/compactar"],
    descricao: "compacta o histórico agora (auto-compact já roda no orçamento)",
    nome: "/compact",
  },
  {
    aceitaArgs: false,
    aliases: [],
    descricao: "esquece o histórico da conversa",
    nome: "/limpar",
  },
  {
    aceitaArgs: true,
    aliases: ["/desfazer"],
    descricao: "desfaz as últimas edições ([N] passos)",
    nome: "/undo",
  },
  {
    aceitaArgs: true,
    aliases: ["/refazer"],
    descricao: "refaz as últimas edições desfeitas ([N])",
    nome: "/redo",
  },
  {
    aceitaArgs: false,
    aliases: ["/checkpoints"],
    descricao: "linha do tempo de checkpoints",
    nome: "/checkpoint",
  },
  {
    aceitaArgs: false,
    aliases: ["/map"],
    descricao: "repo map (arquivos e assinaturas)",
    nome: "/mapa",
  },
  {
    aceitaArgs: true,
    aliases: ["/remember"],
    descricao: "salva um fato na memória do projeto",
    nome: "/lembrar",
  },
  {
    aceitaArgs: true,
    aliases: [],
    descricao: "list | forget <slug> | edit <slug>",
    nome: "/memory",
  },
  {
    aceitaArgs: true,
    aliases: ["/plano"],
    descricao: "plano interativo (perguntas + ativo na sessão); /plan clear limpa",
    nome: "/plan",
  },
  {
    aceitaArgs: true,
    aliases: [],
    descricao: "revisa o diff (subagente revisor)",
    nome: "/review",
  },
  {
    aceitaArgs: false,
    aliases: [],
    descricao: "lista skills disponíveis",
    nome: "/skills",
  },
  {
    aceitaArgs: true,
    aliases: [],
    descricao: "ativa uma skill na sessão",
    nome: "/skill",
  },
  {
    aceitaArgs: false,
    aliases: [],
    descricao: "gera CODINGPRO.md do projeto",
    nome: "/init",
  },
]);

export interface SugestaoComando {
  readonly nome: string;
  readonly descricao: string;
  readonly aceitaArgs: boolean;
  /** Nome/alias que casou com o prefixo digitado. */
  readonly match: string;
}

/** Prefixo do comando atual (token que começa com `/` até o primeiro espaço). */
export function tokenComando(buffer: string): string | undefined {
  if (!buffer.startsWith("/")) {
    return undefined;
  }
  // Enquanto digita o nome do comando (sem espaço), o buffer inteiro é o token.
  const espaco = buffer.indexOf(" ");
  if (espaco === -1) {
    return buffer;
  }
  // Já há argumentos → não sugere (exceto buffer só com "/cmd " e queremos fechar a lista).
  return undefined;
}

/** Filtra o catálogo pelo prefixo do token `/…` (case-insensitive). */
export function filtrarSugestoes(
  buffer: string,
  catalogo: readonly ComandoChat[] = COMANDOS_CHAT,
): SugestaoComando[] {
  const token = tokenComando(buffer);
  if (token === undefined) {
    return [];
  }
  const lower = token.toLowerCase();
  const out: SugestaoComando[] = [];
  for (const cmd of catalogo) {
    const candidatos = [cmd.nome, ...cmd.aliases];
    for (const c of candidatos) {
      if (c.toLowerCase().startsWith(lower)) {
        out.push({
          aceitaArgs: cmd.aceitaArgs,
          descricao: cmd.descricao,
          match: c,
          nome: cmd.nome,
        });
        break;
      }
    }
  }
  return out;
}

/** Texto de ajuda multi-linha derivado do catálogo. */
export function textoAjudaComandos(catalogo: readonly ComandoChat[] = COMANDOS_CHAT): string {
  const linhas = catalogo.map((c) => {
    const aliases = c.aliases.length > 0 ? ` (${c.aliases.join(", ")})` : "";
    return `  ${c.nome}${aliases} — ${c.descricao}`;
  });
  return `Comandos:\n${linhas.join("\n")}\n`;
}
