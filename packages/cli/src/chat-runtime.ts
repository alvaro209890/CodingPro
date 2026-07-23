import { join } from "node:path";
import {
  ALL_TOOLS,
  type CheckpointMeta,
  CheckpointStore,
  construirRepoMap,
  createReadTracker,
  describeAgentEvent,
  detectarProjeto,
  gerarCodingproMd,
  MEMORY_TOOL_NAMES,
  newSessionId,
  PermissionController,
  readFileWithin,
  resumoProjeto,
  runAgent,
  SessionStore,
  SYSTEM_PROMPT_V1,
  ToolGate,
  ToolRegistry,
  Workspace,
  WRITE_FILE_MAX_BYTES,
  writeFileWithin,
} from "@codingpro/core";
import { type ChatMessage, type CostBreakdown, formatCost, type Provider } from "@codingpro/llm";
import { sanitizarTextoTerminal } from "./headless.js";
import { criarAprovadorInterativo } from "./interactive.js";
import { criarMemoriaSessao, type MemoriaSessao } from "./memory-runtime.js";

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
  /** Diretório da memória global; ausente usa `~/.codingpro/memory`. */
  readonly memoriaGlobalDir?: string;
  readonly provider: Provider;
  readonly sessaoDir?: string;
  readonly signal?: AbortSignal;
}

const AJUDA =
  "Comandos: /sair encerra · /custo mostra o custo do último turno · /limpar esquece o histórico · " +
  "/undo [N] desfaz as últimas edições · /redo [N] refaz · /checkpoint lista a linha do tempo · " +
  "/mapa mostra o repo map do projeto · /lembrar <fato> salva na memória · " +
  "/memory [list|forget <slug>|edit <slug>] gerencia a memória · " +
  "/init gera CODINGPRO.md com o projeto detectado\n";

/** Gera (ou regenera, com confirmação) o CODINGPRO.md a partir do projeto detectado. */
async function comandoInit(workspace: Workspace, io: ChatIo): Promise<void> {
  const alvo = workspace.resolve("CODINGPRO.md");
  let existente = false;
  try {
    await readFileWithin(workspace, alvo, WRITE_FILE_MAX_BYTES);
    existente = true;
  } catch {
    existente = false;
  }
  if (existente) {
    const resposta = (await io.pergunta("CODINGPRO.md já existe. Sobrescrever? [s/N] "))
      .trim()
      .toLowerCase();
    if (resposta !== "s" && resposta !== "sim" && resposta !== "y") {
      io.progresso("· /init cancelado\n");
      return;
    }
  }
  const info = await detectarProjeto(workspace);
  await writeFileWithin(workspace, alvo, gerarCodingproMd(info), WRITE_FILE_MAX_BYTES);
  io.progresso(`· CODINGPRO.md gerado (${resumoProjeto(info)})\n`);
}

/** Trata `/lembrar <fato>` e `/memory [list|forget <slug>|edit <slug>]`. */
async function comandoMemoria(memoria: MemoriaSessao, mensagem: string, io: ChatIo): Promise<void> {
  const partes = mensagem.trim().split(/\s+/u);
  const primeiro = partes[0];

  if (primeiro === "/lembrar" || primeiro === "/remember") {
    const fato = mensagem.slice(primeiro.length).trim();
    if (fato.length === 0) {
      io.progresso("· uso: /lembrar <fato>\n");
      return;
    }
    try {
      const m = await memoria.projeto.remember(fato, "project");
      io.progresso(`· memorizado (projeto): ${m.name} — força ${m.strength}\n`);
    } catch (error) {
      io.progresso(`· ${error instanceof Error ? error.message : "falha ao lembrar"}\n`);
    }
    return;
  }

  // /memory ...
  const sub = partes[1];
  const alvo = partes[2];
  if (sub === "forget") {
    if (alvo === undefined) {
      io.progresso("· uso: /memory forget <slug>\n");
      return;
    }
    const ok = (await memoria.projeto.forget(alvo)) || (await memoria.global.forget(alvo));
    io.progresso(ok ? `· esquecido: ${alvo}\n` : `· não encontrei: ${alvo}\n`);
    return;
  }
  if (sub === "edit") {
    if (alvo === undefined) {
      io.progresso("· uso: /memory edit <slug>\n");
      return;
    }
    io.progresso(
      `· edite à mão: ${join(memoria.projeto.dir, `${alvo}.md`)} ou ${join(memoria.global.dir, `${alvo}.md`)}\n`,
    );
    return;
  }
  // list (default)
  const [g, p] = await Promise.all([memoria.global.list(), memoria.projeto.list()]);
  if (g.length === 0 && p.length === 0) {
    io.progresso("· memória vazia\n");
    return;
  }
  for (const m of p) {
    io.progresso(`· [projeto] ${m.name} (${m.type}, força ${m.strength}) — ${m.description}\n`);
  }
  for (const m of g) {
    io.progresso(`· [global] ${m.name} (${m.type}, força ${m.strength}) — ${m.description}\n`);
  }
}

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
  const gate = new ToolGate(
    registry,
    new PermissionController({ alwaysAllow: MEMORY_TOOL_NAMES, mode: "ask" }, aprovador),
  );
  // Memória persistente: índices sempre no contexto + retrieval por turno; `remember` grava aqui.
  const memoria = criarMemoriaSessao(workspace.root, options.memoriaGlobalDir);

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
  io.progresso(`Projeto: ${resumoProjeto(await detectarProjeto(workspace))}\n`);
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
    if (mensagem === "/init") {
      await comandoInit(workspace, io);
      continue;
    }
    if (
      mensagem === "/lembrar" ||
      mensagem.startsWith("/lembrar ") ||
      mensagem === "/remember" ||
      mensagem.startsWith("/remember ") ||
      mensagem === "/memory" ||
      mensagem.startsWith("/memory ")
    ) {
      await comandoMemoria(memoria, mensagem, io);
      continue;
    }
    if (mensagem === "/mapa" || mensagem === "/map") {
      const mapa = await construirRepoMap(workspace, {
        cacheDir: join(workspace.root, ".codingpro"),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      io.progresso(`${mapa.texto}\n`);
      if (mapa.truncado) {
        io.progresso(`· mapa truncado (${mapa.totalArquivos} arquivos indexados)\n`);
      }
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
    // System prompt fresco por turno: base + memória (índices sempre + retrieval do pedido).
    const systemPrompt = await memoria.promptDoTurno(SYSTEM_PROMPT_V1, mensagem);
    const semSystem = transcrito[0]?.role === "system" ? transcrito.slice(1) : transcrito;
    const entrada: ChatMessage[] = [
      { content: systemPrompt, role: "system" },
      ...semSystem,
      { content: mensagem, role: "user" },
    ];
    let respondeu = false;
    const result = await runAgent({
      context: {
        checkpoints,
        memory: memoria.scope,
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
