export interface Mensagem {
  role: string;
  content: string;
  tools?: { nome: string; result: string }[];
  timestamp?: number;
}

export interface Session {
  id: string;
  nome: string;
  mensagens: Mensagem[];
  criadaEm: number;
  /** Quando true, o usuário renomeou manualmente — não sobrescrever com auto-título. */
  nomeManual?: boolean;
}
