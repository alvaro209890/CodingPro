import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ALL_TOOLS,
  atualizarAutoEffort,
  type AutoEffortState,
  type CheckpointMeta,
  CheckpointStore,
  blocoSkill,
  construirRepoMap,
  createReadTracker,
  criarAutoEffortState,
  criarHookRunner,
  diretrizAtribuicao,
  describeAgentEvent,
  detectarProjeto,
  type ExecutableTool,
  gerarCodingproMd,
  type Hook,
  MEMORY_TOOL_NAMES,
  newSessionId,
  PermissionController,
  prepararAutoEffort,
  readFileWithin,
  resolverAutoEffort,
  resumoProjeto,
  rodarHooksStop,
  runAgent,
  SessionStore,
  type Skill,
  slugify,
  type SubagenteSpawner,
  sugerirSkills,
  SYSTEM_PROMPT_V1,
  ToolGate,
  ToolRegistry,
  Workspace,
  WRITE_FILE_MAX_BYTES,
  writeFileWithin,
} from "@codingpro/core";
import {
  DeepSeekProvider,
  type ChatMessage,
  type CostBreakdown,
  formatCost,
  type Provider,
} from "@codingpro/llm";
import { sanitizarTextoTerminal } from "./headless.js";
import { criarAprovadorInterativo } from "./interactive.js";
import { carregarAtribuicao } from "./attribution-runtime.js";
import { criarMemoriaSessao, type MemoriaSessao } from "./memory-runtime.js";
import { verificarQualidade } from "./quality-runtime.js";
import { obterDiff, promptRevisao } from "./review-runtime.js";
import { carregarTiposCustom, criarSpawnerSubagentes } from "./subagent-runtime.js";

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
  /** Hooks de shell (pre/post-tool, stop), já carregados do settings. */
  readonly hooks?: readonly Hook[];
  readonly maxContexto?: number;
  /** Tools de servidores MCP já conectados (registradas junto às nativas). */
  readonly mcpTools?: readonly ExecutableTool[];
  /** Diretório da memória global; ausente usa `~/.codingpro/memory`. */
  readonly memoriaGlobalDir?: string;
  readonly provider: Provider;
  readonly sessaoDir?: string;
  /** Skills disponíveis (`.md`), já carregadas dos diretórios de skills. */
  readonly skills?: readonly Skill[];
  readonly signal?: AbortSignal;
}

const AJUDA =
  "Comandos: /sair | /exit encerra · /custo mostra o custo do último turno · /limpar esquece o histórico · " +
  "/undo | /desfazer [N] desfaz as últimas edições · /redo | /refazer [N] refaz · /checkpoint lista a linha do tempo · " +
  "/mapa | /map mostra o repo map do projeto · /lembrar | /remember <fato> salva na memória · " +
  "/memory [list|forget <slug>|edit <slug>] gerencia a memória · " +
  "/plan | /plano <objetivo> gera um plano (subagente arquiteto) · " +
  "/review [alvo] revisa o diff (subagente revisor) · " +
  "/skills lista skills · /skill <nome> ativa uma skill · " +
  "/init gera CODINGPRO.md com o projeto detectado · " +
  "/ajuda mostra esta mensagem\n";

/** Revisa o diff (não commitado, ou `git diff <alvo>`) com o subagente revisor. */
async function comandoReview(
  spawner: SubagenteSpawner,
  cwd: string,
  mensagem: string,
  io: ChatIo,
  signal?: AbortSignal,
): Promise<void> {
  const alvo = mensagem.replace(/^\/review\s*/u, "").trim();
  const { diff, erro } = await obterDiff(cwd, alvo.length > 0 ? alvo : undefined);
  if (erro !== undefined) {
    io.progresso(`· ${erro}\n`);
    return;
  }
  io.progresso("· revisor analisando o diff…\n");
  const rel = await spawner.executar("reviewer", promptRevisao(diff), signal);
  io.saida(`${rel.texto.length > 0 ? rel.texto : "(sem achados)"}\n`);
}

/** Trata `/skills` (lista + sugere) e `/skill <nome>` (ativa para a sessão). */
function comandoSkill(
  skills: readonly Skill[],
  ativas: Set<string>,
  mensagem: string,
  io: ChatIo,
): void {
  const partes = mensagem.trim().split(/\s+/u);
  if (partes[0] === "/skill") {
    const nome = partes[1];
    if (nome === undefined) {
      io.progresso("· uso: /skill <nome>\n");
      return;
    }
    if (!skills.some((s) => s.nome === nome)) {
      io.progresso(`· skill não encontrada: ${nome}\n`);
      return;
    }
    ativas.add(nome);
    io.progresso(`· skill ativada: ${nome}\n`);
    return;
  }
  // /skills
  if (skills.length === 0) {
    io.progresso("· nenhuma skill disponível (crie .md em .codingpro/skills)\n");
    return;
  }
  for (const s of skills) {
    const marca = ativas.has(s.nome) ? "●" : "○";
    io.progresso(`· ${marca} ${s.nome} — ${s.descricao}\n`);
  }
}

/** Roda o subagente arquiteto para produzir um plano, salva em `.codingpro/plans/` e o exibe. */
async function comandoPlan(
  spawner: SubagenteSpawner,
  root: string,
  objetivo: string,
  io: ChatIo,
  signal?: AbortSignal,
): Promise<void> {
  if (objetivo.trim().length === 0) {
    io.progresso("· uso: /plan <objetivo>\n");
    return;
  }
  io.progresso("· arquiteto planejando…\n");
  const rel = await spawner.executar("architect", objetivo, signal);
  const plano = rel.texto.length > 0 ? rel.texto : "(o arquiteto não produziu plano)";
  io.saida(`${plano}\n`);
  try {
    const dir = join(root, ".codingpro", "plans");
    await mkdir(dir, { recursive: true });
    const arquivo = join(dir, `${new Date().toISOString().slice(0, 10)}-${slugify(objetivo)}.md`);
    await writeFile(arquivo, `# Plano: ${objetivo}\n\n${plano}\n`, "utf8");
    io.progresso(`· plano salvo em ${arquivo}\n`);
  } catch {
    io.progresso("· não consegui salvar o plano em disco\n");
  }
}

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
  for (const tool of [...ALL_TOOLS, ...(options.mcpTools ?? [])]) {
    registry.register(tool);
  }
  const aprovador = criarAprovadorInterativo({ pergunta: io.pergunta }, io.progresso);
  const hooks = options.hooks ?? [];
  const gate = new ToolGate(
    registry,
    new PermissionController({ alwaysAllow: MEMORY_TOOL_NAMES, mode: "ask" }, aprovador),
    hooks.length > 0 ? criarHookRunner(hooks) : undefined,
  );
  const skills = options.skills ?? [];
  const skillsAtivas = new Set<string>();
  // Modo undercover: diretriz de assinatura de commits anexada ao system prompt.
  const promptBase = `${SYSTEM_PROMPT_V1}\n\n${diretrizAtribuicao(await carregarAtribuicao(workspace.root))}`;
  // Memória persistente: índices sempre no contexto + retrieval por turno; `remember` grava aqui.
  const memoria = criarMemoriaSessao(workspace.root, options.memoriaGlobalDir);
  // Subagentes: tipos padrão + custom de `.codingpro/agents`; a tool `task` e o `/plan` usam isto.
  const tiposCustom = await carregarTiposCustom(join(workspace.root, ".codingpro", "agents"));
  const spawner = criarSpawnerSubagentes({
    custom: tiposCustom,
    memory: memoria.scope,
    provider: options.provider,
    workspace,
  });

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
  // Estado do auto-effort: decide automaticamente Flash/Pro a cada turno.
  const autoEffort: AutoEffortState = criarAutoEffortState();

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
    if (mensagem === "/plan" || mensagem.startsWith("/plan ") || mensagem.startsWith("/plano ")) {
      const objetivo = mensagem.replace(/^\/plan(o)?\s*/u, "");
      await comandoPlan(spawner, workspace.root, objetivo, io, options.signal);
      continue;
    }
    if (mensagem === "/review" || mensagem.startsWith("/review ")) {
      await comandoReview(spawner, workspace.root, mensagem, io, options.signal);
      continue;
    }
    if (mensagem === "/skills" || mensagem === "/skill" || mensagem.startsWith("/skill ")) {
      comandoSkill(skills, skillsAtivas, mensagem, io);
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
    if (
      mensagem === "/undo" ||
      mensagem === "/desfazer" ||
      mensagem.startsWith("/undo ") ||
      mensagem.startsWith("/desfazer ")
    ) {
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
    if (
      mensagem === "/redo" ||
      mensagem === "/refazer" ||
      mensagem.startsWith("/redo ") ||
      mensagem.startsWith("/refazer ")
    ) {
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

    // Auto-sugestão de skill: dica não-intrusiva quando uma skill casa e ainda não está ativa.
    const sugeridas = sugerirSkills(skills, mensagem, 1).filter((s) => !skillsAtivas.has(s.nome));
    if (sugeridas[0] !== undefined) {
      io.progresso(
        `· skill sugerida: ${sugeridas[0].nome} (ative com /skill ${sugeridas[0].nome})\n`,
      );
    }

    checkpoints.begin(mensagem);
    // System prompt fresco por turno: base + skills ativas + memória (índices + retrieval do pedido).
    const blocosSkill = [...skillsAtivas]
      .map((nome) => skills.find((s) => s.nome === nome))
      .filter((s): s is Skill => s !== undefined)
      .map((s) => blocoSkill(s))
      .join("\n\n");
    const base = blocosSkill.length > 0 ? `${promptBase}\n\n${blocosSkill}` : promptBase;
    const systemPrompt = await memoria.promptDoTurno(base, mensagem);
    const semSystem = transcrito[0]?.role === "system" ? transcrito.slice(1) : transcrito;
    const entrada: ChatMessage[] = [
      { content: systemPrompt, role: "system" },
      ...semSystem,
      { content: mensagem, role: "user" },
    ];

    // Auto-effort: estima contexto, decide Flash/Pro, cria provider adequado.
    const tokensContexto = Math.round(JSON.stringify(entrada).length / 2);
    prepararAutoEffort(
      autoEffort,
      tokensContexto,
      Array.from(registry.definitions(), (t) => t.name),
    );
    const papel = resolverAutoEffort(autoEffort);
    const modeloNome = papel === "fast" ? "Flash" : "Pro";
    let providerTurno: Provider = options.provider;
    if (options.provider.id === "deepseek" && papel === "fast") {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (apiKey !== undefined && apiKey.trim().length > 0) {
        providerTurno = new DeepSeekProvider({ apiKey, role: "fast" });
      }
    }
    io.progresso(`· ${modeloNome}\n`);

    let respondeu = false;
    const arquivosEfeito: string[] = [];
    const result = await runAgent({
      context: {
        checkpoints,
        memory: memoria.scope,
        readTracker,
        subagentes: spawner,
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
        if (event.type === "tool-call") {
          const path = (event.call.input as { path?: string }).path;
          if (
            path !== undefined &&
            (event.call.name === "write_file" || event.call.name === "edit_file")
          ) {
            arquivosEfeito.push(path);
          }
        }
        const progresso = describeAgentEvent(event);
        if (progresso !== undefined) {
          io.progresso(`· ${sanitizarTextoTerminal(progresso)}\n`);
        }
      },
      provider: providerTurno,
      tools: registry.definitions(),
      ...(options.maxContexto === undefined ? {} : { contextBudget: options.maxContexto }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    if (respondeu) {
      io.saida("\n");
    }

    // Atualiza auto-effort: um erro de ferramenta neste turno escala o próximo para Pro.
    const houveErroDeTool = result.messages.some(
      (m) => m.role === "tool" && m.result.type === "error-text",
    );
    atualizarAutoEffort(autoEffort, houveErroDeTool);

    // Loop de qualidade: passa os arquivos editados pelo biome do projeto (se houver). Non-blocking.
    await verificarQualidade(workspace.root, arquivosEfeito, io);

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
  if (hooks.length > 0) {
    await rodarHooksStop(hooks);
  }
}
