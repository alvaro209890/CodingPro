/**
 * Saldo de créditos da conta CodingPro Cloud.
 *
 * O proxy devolve o saldo em micro-dólares (US$ × 1e6, valor inteiro) no header
 * `x-codingpro-creditos-micro` de toda resposta. Este módulo é puro (sem Electron)
 * para ser testado offline e compartilhado entre main (captura) e renderer (exibição).
 */

/** Estado do saldo enviado ao renderer (main → preload → UI). */
export interface SaldoContaUI {
  /**
   * Micro-dólares (US$ × 1e6) observados no header do proxy; `undefined` até a 1ª
   * resposta. `number | undefined` explícito: o projeto usa `exactOptionalPropertyTypes`
   * e o main envia a chave sempre presente.
   */
  readonly saldoMicro?: number | undefined;
}

const formatterUsd = new Intl.NumberFormat("pt-BR", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

/** Interpreta o header como micro-dólares inteiros não-negativos; senão `undefined`. */
export function parseSaldoMicro(valor: string | null | undefined): number | undefined {
  if (valor === null || valor === undefined) return undefined;
  if (!/^\d+$/u.test(valor.trim())) return undefined;
  const micro = Number(valor);
  if (!Number.isSafeInteger(micro) || micro < 0) return undefined;
  return micro;
}

/** Formata micro-dólares como "US$ 1,23". */
export function formatarSaldoUsd(micro: number): string {
  return formatterUsd.format(micro / 1e6);
}
