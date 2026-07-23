/**
 * Modo undercover: controla como o agente assina commits que ele mesmo cria. Padrão do produto é
 * assinar (`full`); `trailer` deixa só uma linha curta; `none` omite qualquer menção de IA. Vira uma
 * diretriz no system prompt (o agente escreve os commits via `bash`).
 */
export type ModoAtribuicao = "full" | "none" | "trailer";

export const MODO_ATRIBUICAO_PADRAO: ModoAtribuicao = "full";

export function modoAtribuicaoValido(valor: unknown): ModoAtribuicao {
  return valor === "full" || valor === "none" || valor === "trailer"
    ? valor
    : MODO_ATRIBUICAO_PADRAO;
}

/** Diretriz pt-BR a anexar ao system prompt conforme o modo de atribuição. */
export function diretrizAtribuicao(modo: ModoAtribuicao): string {
  switch (modo) {
    case "none":
      return "Ao criar commits, NÃO inclua trailer, coautoria nem qualquer menção de que foram feitos com IA (modo undercover).";
    case "trailer":
      return "Ao criar commits, inclua apenas uma linha curta indicando assistência de IA, sem coautoria formal.";
    default:
      return "Ao criar commits, inclua o trailer de coautoria da IA (Co-Authored-By) ao final da mensagem.";
  }
}
