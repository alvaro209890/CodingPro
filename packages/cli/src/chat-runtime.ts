import { join } from "node:path";
import {
  ALL_TOOLS,
  type CheckpointMeta,
  CheckpointStore,
  createReadTracker,
  describeAgentEvent,
  newSessionId,
  PermissionController,
  runAgent,
  SessionStore,
  ToolGate,
  ToolRegistry,
  Workspace,
} from "@codingpro/core";
import { type ChatMessage, type CostBreakdown, formatCost, type Provider } from "@codingpro/llm";
import { sanitizarTextoTerminal } from "./headless.js";
import { criarAprovadorInterativo } from "./interactive.js";

export interface ChatIo {
  /** Faz uma pergunta (aprovações) e resolve com a resposta digitada. */
  readonly pergunta: (texto: string) => Promise<string>;
  readonly progresso: (texto: string) => void;
  /** Lê a próxima mensagem do usuário; `undefined` encerra (EOF / Ctrl-D). */
  readonly proximaMensagem: () => Promise<string | undefined>;
  readonly saida: (texto: string) => void;
}

export interface ChatOptions {
  readonly cwd: string;
  readonly maxContexto?: number;
  readonly provider: Provider;
  readonly sessaoDir?: string;
  readonly signal?: AbortSignal;
}

const AJUDA =
  "Comandos: /sair encerra · /custo mostra o custo do último turno · /limpar esquece o histórico · " +
  "/undo [N] desfaz as últimas edições · /redo [N] refaz · /checkpoint lista a linha do tempo\n";

/** Lê o argumento numérico opcional de um comando como /undo ou /redo (default 1). */
function parseQuantidade(mensagem: string): number {
  const arg = mensagem.split(/\s+/)[1];
  const n = arg === undefined ? 1 : Number.parseInt(arg, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Resumo pt-BR de um checkpoint para a linha do tempo. */
function descreverCheckpoint(meta: CheckpointMeta): string {
  const arquivos = meta.files.map((f) => f.path).join(", ");
  const rotulo = meta.label.trim().length > 0 ? meta.label.trim() : "(sem rótulo)";
  return `#${meta.seq} · ${rotulo} · ${arquivos}`;
}

/**
 * Chat interativo do agente: cada mensagem roda o loop com TODAS as ferramentas; efeitos
 * (escrever/rodar) pedem aprovação interativa (sem checkpoint, sempre perguntam). O transcrito
 * é persistido a cada turno. A camada visual Ink/Aurora é polimento posterior (doc 16).
 */
export async function executarChat(options: ChatOptions, io: ChatIo): Promise<void> {
  options.signal?.throwIfAborted();
  const workspace = await Workspace.create(options.cwd);
  const registry = new ToolRegistry();
  for (const tool of ALL_TOOLS) {
    registry.register(tool);
  }
  const aprovador = criarAprovadorInterativo({ pergunta: io.pergunta }, io.progresso);
  const gate = new ToolGate(registry, new PermissionController({ mode: "ask" }, aprovador));

  const store =
    options.sessaoDir === undefined ? undefined : await SessionStore.create(options.sessaoDir);
  const sessaoId = newSessionId();
  // Um rastreador para toda a sessão de chat: uma leitura habilita edições nos turnos seguintes.
  const readTracker = createReadTracker();
  // Checkpoints do projeto: cada turno com escrita vira um passo desfazível com /undo.
  const checkpoints = await CheckpointStore.create(
    join(workspace.root, ".codingpro", "checkpoints"),
    workspace,
  );

  let transcrito: ChatMessage[] = [];
  let ultimoCusto: CostBreakdown | undefined;

  io.progresso("CodingPro — chat do agente.\n");
  io.progresso(AJUDA);

  for (;;) {
    options.signal?.throwIfAborted();
    const linha = await io.proximaMensagem();
    if (linha === undefined) {
      break;
    }
    const mensagem = linha.trim();
    if (mensagem.length === 0) {
      continue;
    }
    if (mensagem === "/sair" || mensagem === "/exit") {
      break;
    }
    if (mensagem === "/limpar") {
      transcrito = [];
      io.progresso("· histórico esquecido\n");
      continue;
    }
    if (mensagem === "/custo") {
      io.progresso(
        ultimoCusto === undefined ? "· sem custo ainda\n" : `${formatCost(ultimoCusto)}\n`,
      );
      continue;
    }
    if (mensagem === "/ajuda") {
      io.progresso(AJUDA);
      continue;
    }
    if (mensagem === "/undo" || mensagem.startsWith("/undo ")) {
      const r = await checkpoints.undo(parseQuantidade(mensagem));
      if (r.passos === 0) {
        io.progresso("· nada a desfazer\n");
      } else {
        for (const c of r.checkpoints) {
          io.progresso(`· desfeito ${descreverCheckpoint(c)}\n`);
        }
      }
      continue;
    }
    if (mensagem === "/redo" || mensagem.startsWith("/redo ")) {
      const r = await checkpoints.redo(parseQuantidade(mensagem));
      if (r.passos === 0) {
        io.progresso("· nada a refazer\n");
      } else {
        for (const c of r.checkpoints) {
          io.progresso(`· refeito ${descreverCheckpoint(c)}\n`);
        }
      }
      continue;
    }
    if (mensagem === "/checkpoint" || mensagem === "/checkpoints") {
      const lista = checkpoints.list();
      if (lista.length === 0) {
        io.progresso("· sem checkpoints ainda\n");
      } else {
        for (const c of lista) {
          io.progresso(`· ${descreverCheckpoint(c)}\n`);
        }
      }
      continue;
    }

    checkpoints.begin(mensagem);
    const entrada: ChatMessage[] = [...transcrito, { content: mensagem, role: "user" }];
    let respondeu = false;
    const result = await runAgent({
      context: {
        checkpoints,
        readTracker,
        workspace,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      gate,
      messages: entrada,
      onEvent: (event) => {
        if (event.type === "text-delta") {
          respondeu = true;
          io.saida(sanitizarTextoTerminal(event.text));
          return;
        }
        const progresso = describeAgentEvent(event);
        if (progresso !== undefined) {
          io.progresso(`· ${sanitizarTextoTerminal(progresso)}\n`);
        }
      },
      provider: options.provider,
      tools: registry.definitions(),
      ...(options.maxContexto === undefined ? {} : { contextBudget: options.maxContexto }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    if (respondeu) {
      io.saida("\n");
    }
    // Fecha o passo: se o turno escreveu algo, vira um checkpoint desfazível.
    const checkpoint = await checkpoints.commit();
    if (checkpoint !== undefined) {
      io.progresso(`· checkpoint ${descreverCheckpoint(checkpoint)} (/undo desfaz)\n`);
    }
    transcrito = [...result.messages];
    ultimoCusto = result.cost;
    if (store !== undefined) {
      await store.save(sessaoId, transcrito);
    }
  }
}
