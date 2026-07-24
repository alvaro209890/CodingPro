export interface Mensagem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tools?: { nome: string; result: string }[];
  /** Raciocínio do modelo (reasoning_content), exibido recolhido. */
  thinking?: string;
  timestamp: number;
}

export interface Session {
  id: string;
  nome: string;
  mensagens: Mensagem[];
  criadaEm: number;
}

export function novaMensagem(
  role: Mensagem["role"],
  content: string,
  extras?: { tools?: { nome: string; result: string }[]; thinking?: string },
): Mensagem {
  const msg: Mensagem = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
  };
  if (extras?.tools && extras.tools.length > 0) msg.tools = extras.tools;
  if (extras?.thinking?.trim()) msg.thinking = extras.thinking.trim();
  return msg;
}
