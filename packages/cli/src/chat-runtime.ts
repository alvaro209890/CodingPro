import { join } from "node:path";
import {
  ALL_TOOLS,
  type AutoEffortState,
  atualizarAutoEffort,
  blocoSkill,
  type CheckpointMeta,
  CheckpointStore,
  compactMessages,
  construirRepoMap,
  createReadTracker,
  criarAutoEffortState,
  criarHookRunner,
  describeAgentEvent,
  detectarProjeto,
  diretrizAtribuicao,
  type ExecutableTool,
  gerarCodingproMd,
  type Hook,
  indexarRepositorio,
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
  type SubagenteSpawner,
  SYSTEM_PROMPT_V1,
  sugerirSkills,
  ToolGate,
  ToolRegistry,
  Workspace,
  WRITE_FILE_MAX_BYTES,
  writeFileWithin,
} from "@codingpro/core";
import { type ChatMessage, DeepSeekProvider, type Provider } from "@codingpro/llm";
import type { SpinnerHandle } from "./animacao.js";
import { carregarAtribuicao } from "./attribution-runtime.js";
import { textoAjudaComandos } from "./commands.js";
import { sanitizarTextoTerminal } from "./headless.js";
import { criarAprovadorInterativo } from "./interactive.js";
import { criarMemoriaSessao, type MemoriaSessao } from "./memory-runtime.js";
import {
  blocoPlanoAtivo,
  executarComandoPlan,
  mensagemHistoricoPlano,
  type PlanoAtivo,
} from "./plan-runtime.js";
import {
  corrigirQualidade,
  lerOpcoesQualidadeEnv,
  promptReparoQualidade,
  type RunnerBiome,
} from "./quality-runtime.js";
import { obterDiff, promptRevisao } from "./review-runtime.js";
import {
  atualizarEstimativaContexto,
  atualizarStatsAposTurno,
  COMPACT_TARGET_RATIO,
  criarSessionStats,
  formatarStatusLinha,
  resolverOrcamentoContexto,
} from "./status.js";
import { carregarTiposCustom, criarSpawnerSubagentes } from "./subagent-runtime.js";
import { criarTema, type Tema } from "./tema.js";

export interface ChatIo {
  /** Faz uma pergunta (aprovações) e resolve com a resposta digitada. */
  readonly pergunta: (texto: string) => Promise<string>;
  readonly progresso: (texto: string) => void;
  /** Lê a próxima mensagem do usuário; `undefined` encerra (EOF / Ctrl-D). */
  readonly proximaMensagem: () => Promise<string | undefined>;
  readonly saida: (texto: string) => void;
  /**
   * Spinner animado (TTY). Se ausente, o chat só imprime linhas estáticas.
   * start no início do turno do agente; stop ao terminar.
   */
  readonly spinner?: SpinnerHandle;
  /**
   * Abertura rica (banner animado). Se presente, o chat chama isto no lugar do
   * `tema.banner()` estático.
   */
  readonly abrir?: () => Promise<void>;
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
  /**
   * Se true, não imprime o banner (já foi mostrado em `program.ts` antes do init).
   */
  readonly pularBanner?: boolean;
  readonly provider: Provider;
  readonly sessaoDir?: string;
  /** Skills disponíveis (`.md`), já carregadas dos diretórios de skills. */
  readonly skills?: readonly Skill[];
  readonly signal?: AbortSignal;
  /** Tema visual; ausente = sem cor (usado nos testes). */
  readonly tema?: Tema;
  /** Runner do biome (testes); default = pnpm exec biome. */
  readonly qualityRunner?: RunnerBiome;
  /** Sobrescreve auto-fix (default: env / true). */
  readonly qualityAutoFix?: boolean;
  /** Sobrescreve teto de re-turnos de reparo (default: env / 1). */
  readonly qualityMaxRepairTurns?: number;
}

const AJUDA = textoAjudaComandos();

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
  const tema = options.tema ?? criarTema("nenhuma");

  // Banner ANTES de qualquer I/O pesado — se o init travar, o usuário já vê a UI.
  if (options.pularBanner !== true) {
    if (io.abrir !== undefined) {
      await io.abrir();
    } else {
      io.progresso(tema.banner());
    }
  }

  io.progresso("· preparando workspace…\n");
  const workspace = await Workspace.create(options.cwd);
  const registry = new ToolRegistry();
  for (const tool of [...ALL_TOOLS, ...(options.mcpTools ?? [])]) {
    registry.register(tool);
  }
  const aprovador = criarAprovadorInterativo({ pergunta: io.pergunta }, io.progresso, tema);
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
  // Orçamento de contexto (default 800k dentro da janela DeepSeek 1M) — auto-compact no runAgent.
  const orcamentoContexto = resolverOrcamentoContexto(options.maxContexto);
  let stats = criarSessionStats(orcamentoContexto);
  // Plano da sessão: injetado no system prompt até /plan clear ou novo /plan.
  let planoAtivo: PlanoAtivo | undefined;
  // Estado do auto-effort: decide automaticamente Flash/Pro a cada turno.
  const autoEffort: AutoEffortState = criarAutoEffortState();

  // Cabeçalho do projeto + prompt. Sem dump de todos os comandos (use /ajuda).
  io.progresso(`${tema.cabecalhoProjeto(resumoProjeto(await detectarProjeto(workspace)))}\n`);
  io.progresso("\n");

  for (;;) {
    options.signal?.throwIfAborted();
    // Status compacto numa linha, depois o prompt (barra digitável).
    stats = atualizarEstimativaContexto(stats, transcrito);
    io.progresso(`${tema.statusLinha(formatarStatusLinha(stats, tema.ascii))}\n`);

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
      stats = atualizarEstimativaContexto(stats, transcrito);
      // Mantém o plano ativo (está em disco + estado); só o chat some.
      io.progresso(
        planoAtivo === undefined
          ? "· histórico esquecido\n"
          : "· histórico esquecido (plano ativo mantido — /plan clear para limpar)\n",
      );
      continue;
    }
    if (mensagem === "/custo" || mensagem === "/cost") {
      if (stats.turns === 0) {
        io.progresso("· sem custo ainda nesta sessão\n");
      } else {
        io.progresso(
          `${tema.progresso(
            `sessão: US$ ${stats.totalCostUsd.toFixed(6)} · in ${stats.inputTokens} · out ${stats.outputTokens} · turnos ${stats.turns}`,
          )}\n`,
        );
        io.progresso(
          `${tema.progresso(
            `contexto: ${stats.contextTokens.toLocaleString("pt-BR")} / ${stats.contextBudget.toLocaleString("pt-BR")} tok · restam ${(stats.contextBudget - stats.contextTokens).toLocaleString("pt-BR")} · janela ${stats.contextWindow.toLocaleString("pt-BR")}`,
          )}\n`,
        );
      }
      continue;
    }
    if (mensagem === "/compact" || mensagem === "/compactar") {
      const antes = stats.contextTokens;
      const alvo = Math.max(2_000, Math.floor(orcamentoContexto * COMPACT_TARGET_RATIO));
      const base: ChatMessage[] =
        transcrito[0]?.role === "system"
          ? transcrito
          : [{ content: promptBase, role: "system" }, ...transcrito];
      const r = compactMessages(base, { maxTokens: alvo });
      transcrito = r.messages[0]?.role === "system" ? r.messages.slice(1) : r.messages;
      stats = atualizarEstimativaContexto(stats, [
        { content: promptBase, role: "system" },
        ...transcrito,
      ]);
      io.progresso(
        `${tema.sucesso(
          `compactado: ${antes.toLocaleString("pt-BR")} → ${stats.contextTokens.toLocaleString("pt-BR")} tok (−${r.dropped} msgs)`,
        )}\n`,
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
      if (objetivo.trim() === "clear" || objetivo.trim() === "limpar") {
        planoAtivo = undefined;
        io.progresso("· plano ativo limpo\n");
        continue;
      }
      const resultado = await executarComandoPlan(
        spawner,
        workspace.root,
        objetivo,
        io,
        options.signal,
      );
      if (resultado.plano !== undefined) {
        planoAtivo = resultado.plano;
        // Injeta no histórico para o modelo "ver" o plano nos turnos seguintes.
        transcrito = [
          ...transcrito.filter((m) => m.role !== "system"),
          { content: `Comando /plan: ${resultado.plano.objetivo}`, role: "user" },
          { content: mensagemHistoricoPlano(resultado.plano), role: "assistant" },
        ];
      } else if (resultado.cancelado === true && objetivo.trim().length > 0) {
        planoAtivo = undefined;
      }
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
    if (mensagem === "/index" || mensagem === "/indexar") {
      io.spinner?.start("indexando repositório…");
      try {
        let ultimo = "";
        const result = await indexarRepositorio(workspace, {
          onProgress: (p) => {
            if (p.phase === "index" && p.path !== undefined && p.path !== ultimo) {
              ultimo = p.path;
              io.spinner?.update(`indexando ${p.current}/${p.total}…`);
            }
          },
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        io.spinner?.stop();
        io.progresso(
          `${tema.sucesso(
            `índice: +${result.updated} · iguais ${result.unchanged} · removidos ${result.removed} · ${result.chunks} chunks · ${result.dbPath}`,
          )}\n`,
        );
      } catch (e) {
        io.spinner?.stop();
        io.progresso(`${tema.erro(e instanceof Error ? e.message : "falha ao indexar")}\n`);
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
    const baseSkills = blocosSkill.length > 0 ? `${promptBase}\n\n${blocosSkill}` : promptBase;
    const base =
      planoAtivo === undefined ? baseSkills : `${baseSkills}\n\n${blocoPlanoAtivo(planoAtivo)}`;
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
    io.spinner?.start(`pensando (${modeloNome})`);

    let respondeu = false;
    const arquivosEfeito: string[] = [];
    let result: Awaited<ReturnType<typeof runAgent>>;
    try {
      result = await runAgent({
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
            // Texto da IA: limpa spinner e escreve sem reabrir (mantém o fluxo legível).
            if (io.spinner?.ativo() === true) {
              io.spinner.stop();
            }
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
            const texto = sanitizarTextoTerminal(progresso);
            const linha =
              event.type === "tool-call" ? tema.ferramenta(texto) : tema.progresso(texto);
            // Linha permanente: apaga spinner, imprime, e só volta a animar após tool-result.
            io.spinner?.stop();
            io.progresso(`${linha}\n`);
            if (event.type === "tool-result") {
              io.spinner?.start(`pensando (${modeloNome})`);
            }
          }
        },
        provider: providerTurno,
        tools: registry.definitions(),
        contextBudget: orcamentoContexto,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } finally {
      io.spinner?.stop();
    }

    if (respondeu) {
      io.saida("\n");
    } else {
      // Garante linha limpa antes do próximo status/prompt
      io.progresso("\n");
    }

    // Atualiza auto-effort: um erro de ferramenta neste turno escala o próximo para Pro.
    const houveErroDeTool = result.messages.some(
      (m) => m.role === "tool" && m.result.type === "error-text",
    );
    atualizarAutoEffort(autoEffort, houveErroDeTool);

    // Qualidade: biome --write (auto-fix) + check; residual pode gerar re-turno da IA.
    const qaEnv = lerOpcoesQualidadeEnv();
    const qaAutoFix = options.qualityAutoFix ?? qaEnv.autoFix;
    const qaMaxRepair = options.qualityMaxRepairTurns ?? qaEnv.maxRepairTurns;
    let arquivosQa = [...arquivosEfeito];
    let resultadoQa = await corrigirQualidade(workspace.root, arquivosQa, io, {
      autoFix: qaAutoFix,
      ...(options.qualityRunner === undefined ? {} : { runner: options.qualityRunner }),
    });

    let reparos = 0;
    while (
      !resultadoQa.limpo &&
      !resultadoQa.ignorado &&
      resultadoQa.diagnostico.length > 0 &&
      reparos < qaMaxRepair
    ) {
      reparos += 1;
      io.progresso(
        `${tema.progresso(`reenviando diagnóstico ao modelo (${reparos}/${qaMaxRepair})`)}\n`,
      );
      const promptReparo = promptReparoQualidade(resultadoQa.diagnostico, resultadoQa.arquivos);
      const systemReparo = await memoria.promptDoTurno(promptBase, promptReparo);
      const entradaReparo: ChatMessage[] = [
        { content: systemReparo, role: "system" },
        ...(result.messages[0]?.role === "system" ? result.messages.slice(1) : result.messages),
        { content: promptReparo, role: "user" },
      ];
      const arquivosReparo: string[] = [];
      let respondeuReparo = false;
      io.spinner?.start("corrigindo lint…");
      try {
        const repairResult = await runAgent({
          context: {
            checkpoints,
            memory: memoria.scope,
            readTracker,
            subagentes: spawner,
            workspace,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          },
          gate,
          messages: entradaReparo,
          onEvent: (event) => {
            if (event.type === "text-delta") {
              io.spinner?.stop();
              respondeuReparo = true;
              io.saida(sanitizarTextoTerminal(event.text));
              return;
            }
            if (event.type === "tool-call") {
              const path = (event.call.input as { path?: string }).path;
              if (
                path !== undefined &&
                (event.call.name === "write_file" || event.call.name === "edit_file")
              ) {
                arquivosReparo.push(path);
              }
            }
            const progresso = describeAgentEvent(event);
            if (progresso !== undefined) {
              const texto = sanitizarTextoTerminal(progresso);
              const linha =
                event.type === "tool-call" ? tema.ferramenta(texto) : tema.progresso(texto);
              io.spinner?.stop();
              io.progresso(`${linha}\n`);
            }
          },
          provider: providerTurno,
          tools: registry.definitions(),
          contextBudget: orcamentoContexto,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        result = repairResult;
        if (respondeuReparo) {
          io.saida("\n");
        }
        arquivosQa = [...arquivosQa, ...arquivosReparo];
        resultadoQa = await corrigirQualidade(workspace.root, arquivosQa, io, {
          autoFix: qaAutoFix,
          ...(options.qualityRunner === undefined ? {} : { runner: options.qualityRunner }),
        });
      } finally {
        io.spinner?.stop();
      }
    }

    // Fecha o passo: se o turno escreveu algo, vira um checkpoint desfazível.
    const checkpoint = await checkpoints.commit();
    if (checkpoint !== undefined) {
      io.progresso(
        `${tema.progresso(`checkpoint ${descreverCheckpoint(checkpoint)} (/undo desfaz)`)}\n`,
      );
    }
    // Persistimos o histórico sem o system (ele é refeito a cada turno).
    const msgs = result.messages;
    transcrito = msgs[0]?.role === "system" ? msgs.slice(1) : [...msgs];
    stats = atualizarStatsAposTurno(stats, result.cost, msgs, modeloNome);
    if (result.cost !== undefined) {
      io.progresso(`${tema.nota(formatarStatusLinha(stats, tema.ascii))}\n`);
    }
    if (store !== undefined) {
      await store.save(sessaoId, msgs);
    }
  }
  if (hooks.length > 0) {
    await rodarHooksStop(hooks);
  }
}
