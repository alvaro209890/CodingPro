import {
  type AgentResult,
  createReadTracker,
  describeAgentEvent,
  MEMORY_TOOL_NAMES,
  MEMORY_TOOLS,
  newSessionId,
  PermissionController,
  READ_ONLY_TOOLS,
  runAgent,
  SessionStore,
  SYSTEM_PROMPT_V1,
  ToolGate,
  ToolRegistry,
  Workspace,
} from "@codingpro/core";
import { type ChatMessage, formatCost, type Provider } from "@codingpro/llm";
import { sanitizarTextoTerminal } from "./headless.js";
import { criarMemoriaSessao } from "./memory-runtime.js";

export interface AgenteHeadlessOptions {
  /** Retoma a sessão mais recente do `sessaoDir` quando nenhum `resumirId` é dado. */
  readonly continuarUltima?: boolean;
  readonly cwd: string;
  readonly maxContexto?: number;
  /** Diretório da memória global; ausente usa `~/.codingpro/memory`. */
  readonly memoriaGlobalDir?: string;
  readonly prompt: string;
  readonly provider: Provider;
  /** Id de sessão a retomar; o transcrito é carregado e o prompt vira o próximo turno. */
  readonly resumirId?: string;
  /** Diretório de sessões; se definido, o transcrito é salvo ao final. */
  readonly sessaoDir?: string;
  readonly signal?: AbortSignal;
}

export interface AgenteHeadlessIo {
  /** Progresso e custo (stderr): não polui a resposta em stdout. */
  readonly progresso: (texto: string) => void;
  readonly saida: (texto: string) => void;
}

export interface AgenteHeadlessResultado {
  readonly resultado: AgentResult;
  readonly sessaoId?: string;
}

/**
 * Executa o loop agêntico em modo headless: registra apenas ferramentas de leitura (efeitos
 * exigem aprovação interativa, ausente aqui, então são negados fail-closed), transmite o texto
 * para stdout e o progresso/custo para stderr. Persiste o transcrito quando há `sessaoDir`.
 */
export async function executarAgenteHeadless(
  options: AgenteHeadlessOptions,
  io: AgenteHeadlessIo,
): Promise<AgenteHeadlessResultado> {
  options.signal?.throwIfAborted();
  const workspace = await Workspace.create(options.cwd);
  const registry = new ToolRegistry();
  for (const tool of [...READ_ONLY_TOOLS, ...MEMORY_TOOLS]) {
    registry.register(tool);
  }
  // Efeitos no projeto exigem aprovação (ausente aqui → negados); memória é pré-autorizada.
  const gate = new ToolGate(
    registry,
    new PermissionController({ alwaysAllow: MEMORY_TOOL_NAMES, mode: "ask" }),
  );
  const memoria = criarMemoriaSessao(workspace.root, options.memoriaGlobalDir);

  const promptMsg: ChatMessage = { content: options.prompt, role: "user" };
  let store: SessionStore | undefined;
  let mensagens: ChatMessage[] = [promptMsg];
  let idSessao = options.resumirId;
  if (options.sessaoDir !== undefined) {
    store = await SessionStore.create(options.sessaoDir);
    if (idSessao === undefined && options.continuarUltima === true) {
      idSessao = (await store.list()).at(-1);
    }
    if (idSessao !== undefined) {
      mensagens = [...(await store.load(idSessao)), promptMsg];
    }
  }
  // System prompt fresco com memória (índices + retrieval do prompt), substituindo o antigo ao retomar.
  const systemPrompt = await memoria.promptDoTurno(SYSTEM_PROMPT_V1, options.prompt);
  const semSystem = mensagens[0]?.role === "system" ? mensagens.slice(1) : mensagens;
  mensagens = [{ content: systemPrompt, role: "system" }, ...semSystem];

  const readTracker = createReadTracker();
  let respostaCrua = "";
  const result = await runAgent({
    context: {
      memory: memoria.scope,
      readTracker,
      workspace,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    gate,
    messages: mensagens,
    onEvent: (event) => {
      if (event.type === "text-delta") {
        const seguro = sanitizarTextoTerminal(event.text);
        respostaCrua += seguro;
        io.saida(seguro);
        return;
      }
      const linha = describeAgentEvent(event);
      if (linha !== undefined) {
        io.progresso(`· ${sanitizarTextoTerminal(linha)}\n`);
      }
    },
    provider: options.provider,
    tools: registry.definitions(),
    ...(options.maxContexto === undefined ? {} : { contextBudget: options.maxContexto }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  if (respostaCrua.length > 0 && !respostaCrua.endsWith("\n")) {
    io.saida("\n");
  }
  if (result.cost !== undefined) {
    io.progresso(`${formatCost(result.cost)}\n`);
  }

  let sessaoId: string | undefined;
  if (store !== undefined) {
    sessaoId = idSessao ?? newSessionId();
    await store.save(sessaoId, result.messages);
    io.progresso(`Sessão: ${sessaoId}\n`);
  }
  return { resultado: result, ...(sessaoId === undefined ? {} : { sessaoId }) };
}
