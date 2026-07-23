/** Uma linha de diff: contexto inalterado, adição ou remoção. */
export type TipoLinha = "add" | "ctx" | "del";

export interface LinhaDiff {
  readonly tipo: TipoLinha;
  readonly texto: string;
}

function emLinhas(texto: string): string[] {
  return texto.length === 0 ? [] : texto.split("\n");
}

/**
 * Diff linha a linha por LCS (subsequência comum mais longa). Determinístico e sem dependências.
 * Produz a sequência de linhas de contexto, removidas e adicionadas na ordem original.
 */
export function diffLinhas(antes: string, depois: string): LinhaDiff[] {
  const a = emLinhas(antes);
  const b = emLinhas(depois);
  const n = a.length;
  const m = b.length;
  // dp[i][j] = tamanho da LCS de a[i:] e b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const linha = dp[i] as number[];
      const proxima = dp[i + 1] as number[];
      linha[j] =
        a[i] === b[j]
          ? (proxima[j + 1] as number) + 1
          : Math.max(proxima[j] as number, linha[j + 1] as number);
    }
  }
  const saida: LinhaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      saida.push({ texto: a[i] as string, tipo: "ctx" });
      i += 1;
      j += 1;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      saida.push({ texto: a[i] as string, tipo: "del" });
      i += 1;
    } else {
      saida.push({ texto: b[j] as string, tipo: "add" });
      j += 1;
    }
  }
  while (i < n) {
    saida.push({ texto: a[i] as string, tipo: "del" });
    i += 1;
  }
  while (j < m) {
    saida.push({ texto: b[j] as string, tipo: "add" });
    j += 1;
  }
  return saida;
}

export interface FormatarDiffOptions {
  /** Linhas de contexto ao redor de cada mudança (default 2). */
  readonly contexto?: number;
  /** Máximo de linhas exibidas; o excedente vira um rodapé resumido (default 40). */
  readonly maxLinhas?: number;
}

/**
 * Formata um diff no estilo unificado enxuto: `+`/`-`/` ` por linha, colapsando trechos longos
 * de contexto inalterado em `⋯` e truncando o total em `maxLinhas`. Sem cor (a camada visual é F8).
 */
export function formatarDiff(linhas: readonly LinhaDiff[], options?: FormatarDiffOptions): string {
  const contexto = options?.contexto ?? 2;
  const maxLinhas = options?.maxLinhas ?? 40;
  const ehMudanca = linhas.map((l) => l.tipo !== "ctx");
  const manter = linhas.map((linha, idx) => {
    if (linha.tipo !== "ctx") {
      return true;
    }
    for (let d = 1; d <= contexto; d += 1) {
      if (ehMudanca[idx - d] === true || ehMudanca[idx + d] === true) {
        return true;
      }
    }
    return false;
  });

  const saida: string[] = [];
  let pulando = false;
  for (let idx = 0; idx < linhas.length; idx += 1) {
    const linha = linhas[idx] as LinhaDiff;
    if (manter[idx] === true) {
      const prefixo = linha.tipo === "add" ? "+" : linha.tipo === "del" ? "-" : " ";
      saida.push(`${prefixo} ${linha.texto}`);
      pulando = false;
    } else if (!pulando) {
      saida.push("  ⋯");
      pulando = true;
    }
  }

  if (saida.length > maxLinhas) {
    const extra = saida.length - maxLinhas;
    return `${saida.slice(0, maxLinhas).join("\n")}\n  … (+${extra} linhas)`;
  }
  return saida.join("\n");
}
