/**
 * Catálogo de slash commands do Desktop — paridade com a CLI (`packages/cli/src/commands.ts`)
 * + extras desktop (`/abrir`, `/pwd`, `/cancelar`).
 */

export interface ComandoChat {
  readonly nome: string;
  readonly aliases: readonly string[];
  readonly descricao: string;
  readonly aceitaArgs: boolean;
}

export interface SugestaoComando {
  readonly nome: string;
  readonly descricao: string;
  readonly aceitaArgs: boolean;
  readonly match: string;
}

/** Comandos canônicos (CLI + desktop). */
export const COMANDOS_CHAT: readonly ComandoChat[] = Object.freeze([
  { nome: "/ajuda", aliases: ["/help"], descricao: "lista os comandos disponíveis", aceitaArgs: false },
  {
    nome: "/abrir",
    aliases: ["/open", "/workspace"],
    descricao: "abre pasta do projeto (diálogo ou caminho)",
    aceitaArgs: true,
  },
  { nome: "/pwd", aliases: [], descricao: "mostra a pasta aberta agora", aceitaArgs: false },
  {
    nome: "/custo",
    aliases: ["/cost", "/gasto"],
    descricao: "custo e tokens da sessão + contexto estimado",
    aceitaArgs: false,
  },
  {
    nome: "/compact",
    aliases: ["/compactar"],
    descricao: "compacta o histórico da conversa",
    aceitaArgs: false,
  },
  { nome: "/limpar", aliases: ["/clear"], descricao: "esquece o histórico da conversa", aceitaArgs: false },
  {
    nome: "/desfazer",
    aliases: ["/undo"],
    descricao: "desfaz as últimas edições ([N] passos)",
    aceitaArgs: true,
  },
  {
    nome: "/refazer",
    aliases: ["/redo"],
    descricao: "refaz as últimas edições desfeitas ([N])",
    aceitaArgs: true,
  },
  {
    nome: "/checkpoint",
    aliases: ["/checkpoints"],
    descricao: "linha do tempo de checkpoints",
    aceitaArgs: false,
  },
  { nome: "/mapa", aliases: ["/map"], descricao: "repo map (arquivos e assinaturas)", aceitaArgs: false },
  {
    nome: "/index",
    aliases: ["/indexar"],
    descricao: "indexa o repo (busca vetorial local SQLite)",
    aceitaArgs: false,
  },
  {
    nome: "/lembrar",
    aliases: ["/remember"],
    descricao: "salva um fato na memória do projeto",
    aceitaArgs: true,
  },
  {
    nome: "/memory",
    aliases: [],
    descricao: "list | forget <slug> | edit <slug>",
    aceitaArgs: true,
  },
  {
    nome: "/plan",
    aliases: ["/plano"],
    descricao: "pede um plano ao agente; /plan clear limpa o aviso",
    aceitaArgs: true,
  },
  {
    nome: "/review",
    aliases: [],
    descricao: "revisa o projeto/diff com o agente",
    aceitaArgs: true,
  },
  { nome: "/skills", aliases: [], descricao: "lista skills do projeto (se houver)", aceitaArgs: false },
  {
    nome: "/skill",
    aliases: [],
    descricao: "mostra uso de skill (desktop: use o chat para ativar)",
    aceitaArgs: true,
  },
  { nome: "/init", aliases: [], descricao: "gera CODINGPRO.md do projeto", aceitaArgs: true },
  {
    nome: "/cancelar",
    aliases: ["/stop"],
    descricao: "cancela a execução em andamento",
    aceitaArgs: false,
  },
  {
    nome: "/nova",
    aliases: ["/new"],
    descricao: "nova sessão (limpa histórico e id)",
    aceitaArgs: false,
  },
]);

export function tokenComando(buffer: string): string | undefined {
  if (!buffer.startsWith("/")) return undefined;
  const espaco = buffer.indexOf(" ");
  if (espaco === -1) return buffer;
  return undefined;
}

export function filtrarSugestoes(
  buffer: string,
  catalogo: readonly ComandoChat[] = COMANDOS_CHAT,
): SugestaoComando[] {
  const token = tokenComando(buffer);
  if (token === undefined) return [];
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

export function textoAjudaComandos(catalogo: readonly ComandoChat[] = COMANDOS_CHAT): string {
  const linhas = catalogo.map((c) => {
    const aliases = c.aliases.length > 0 ? ` (${c.aliases.join(", ")})` : "";
    return `  ${c.nome}${aliases} — ${c.descricao}`;
  });
  return [
    "Comandos do CodingPro Desktop (paridade CLI):",
    ...linhas,
    "",
    "Atalhos: Ctrl+K paleta · Ctrl+. cancela · digite / para sugerir",
    "Escopo: tools só veem a pasta aberta — use /abrir para outro projeto.",
  ].join("\n");
}
