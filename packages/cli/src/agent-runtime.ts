import {
  type AgentResult,
  describeAgentEvent,
  PermissionController,
  READ_ONLY_TOOLS,
  runAgent,
  ToolGate,
  ToolRegistry,
  Workspace,
} from "@codingpro/core";
import { formatCost, type Provider } from "@codingpro/llm";
import { sanitizarTextoTerminal } from "./headless.js";

export interface AgenteHeadlessOptions {
  readonly cwd: string;
  /** Mensagens iniciais para retomar uma sessão; se ausente, usa só o prompt. */
  readonly mensagensIniciais?: Parameters<typeof runAgent>[0]["messages"];
  readonly maxContexto?: number;
  readonly prompt: string;
  readonly provider: Provider;
  readonly signal?: AbortSignal;
}

export interface AgenteHeadlessIo {
  /** Progresso e custo (stderr): não polui a resposta em stdout. */
  readonly progresso: (texto: string) => void;
  readonly saida: (texto: string) => void;
}

/**
 * Executa o loop agêntico em modo headless: registra apenas ferramentas de leitura (efeitos
 * exigem aprovação interativa, ausente aqui, então são negados fail-closed), transmite o texto
 * para stdout e o progresso/custo para stderr. Devolve o transcrito para persistência.
 */
export async function executarAgenteHeadless(
  options: AgenteHeadlessOptions,
  io: AgenteHeadlessIo,
): Promise<AgentResult> {
  options.signal?.throwIfAborted();
  const workspace = await Workspace.create(options.cwd);
  const registry = new ToolRegistry();
  for (const tool of READ_ONLY_TOOLS) {
    registry.register(tool);
  }
  const gate = new ToolGate(registry, new PermissionController({ mode: "ask" }));

  const mensagens = options.mensagensIniciais ?? [
    { content: options.prompt, role: "user" as const },
  ];

  let respostaCrua = "";
  const result = await runAgent({
    context: { workspace, ...(options.signal === undefined ? {} : { signal: options.signal }) },
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
  return result;
}
