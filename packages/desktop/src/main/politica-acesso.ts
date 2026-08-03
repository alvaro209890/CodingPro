export type ModoAcessoDesktop = "conta" | "chave-propria" | "sem-acesso";

/**
 * A versão distribuída do CodingPro sempre passa pela conta Cloud, onde aprovação e
 * créditos são aplicados. Chaves locais continuam disponíveis apenas no runtime de
 * desenvolvimento para não atrapalhar o trabalho no monorepo.
 */
export function permiteChavePropria(empacotado: boolean): boolean {
  return !empacotado;
}

export function decidirModoAcesso(params: {
  readonly empacotado: boolean;
  readonly temChavePropria: boolean;
  readonly temConta: boolean;
}): ModoAcessoDesktop {
  if (params.temConta) return "conta";
  if (permiteChavePropria(params.empacotado) && params.temChavePropria) {
    return "chave-propria";
  }
  return "sem-acesso";
}
