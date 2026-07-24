export interface Mensagem {
  role: string;
  content: string;
  tools?: { nome: string; result: string }[];
}

export interface Session {
  id: string;
  nome: string;
  mensagens: Mensagem[];
  criadaEm: number;
}