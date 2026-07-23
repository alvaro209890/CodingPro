import { extname } from "node:path";

/**
 * Extração de ASSINATURAS (não corpos) por linha, de efeitos puros. É o backend v1 do repo map:
 * heurística por linguagem, robusta e sem dependências. Cobre TS/JS, Python, Java/Kotlin, Go e SQL
 * (as linguagens dos projetos do Álvaro); o restante cai no fallback do repo map (só caminhos).
 * A troca por web-tree-sitter fica planejada como upgrade deste mesmo backend.
 */

/** Grupo de linguagem reconhecido pelo extrator (por extensão de arquivo). */
export type Linguagem = "go" | "java" | "python" | "sql" | "ts";

/** Categoria do símbolo, usada só para exibição no mapa. */
export type TipoSimbolo =
  | "classe"
  | "constante"
  | "função"
  | "interface"
  | "método"
  | "tabela"
  | "tipo";

/** Um símbolo de topo extraído de um arquivo. */
export interface Simbolo {
  readonly nome: string;
  readonly tipo: TipoSimbolo;
  /** Linha 1-based onde a declaração aparece. */
  readonly linha: number;
  /** Linha da declaração, aparada e truncada — a "assinatura" exibida no mapa. */
  readonly assinatura: string;
}

/** Tetos anti-patológico: nenhum arquivo consome tempo/memória sem limite. */
export const SYMBOLS_MAX_LINHAS = 20_000;
export const SYMBOLS_MAX_SIMBOLOS = 500;
const MAX_ASSINATURA = 200;

const EXT_LINGUAGEM: Readonly<Record<string, Linguagem>> = {
  ".cjs": "ts",
  ".go": "go",
  ".java": "java",
  ".js": "ts",
  ".jsx": "ts",
  ".kt": "java",
  ".kts": "java",
  ".mjs": "ts",
  ".py": "python",
  ".sql": "sql",
  ".ts": "ts",
  ".tsx": "ts",
};

/** Linguagem de um caminho pela extensão, ou `undefined` se não for indexável. */
export function linguagemDeArquivo(caminho: string): Linguagem | undefined {
  return EXT_LINGUAGEM[extname(caminho).toLowerCase()];
}

function assinaturaDe(linha: string): string {
  const limpa = linha.trim();
  return limpa.length > MAX_ASSINATURA ? `${limpa.slice(0, MAX_ASSINATURA)}…` : limpa;
}

/** Regras por linguagem: cada uma testa uma linha e devolve `{nome, tipo}` ou `undefined`. */
type Regra = (linha: string) => { readonly nome: string; readonly tipo: TipoSimbolo } | undefined;

const REGRAS_TS: readonly Regra[] = [
  (l) => {
    const m =
      /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(l);
    return m?.[1] === undefined ? undefined : { nome: m[1], tipo: "função" };
  },
  (l) => {
    const m = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(l);
    return m?.[1] === undefined ? undefined : { nome: m[1], tipo: "classe" };
  },
  (l) => {
    const m = /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/.exec(l);
    return m?.[1] === undefined ? undefined : { nome: m[1], tipo: "interface" };
  },
  (l) => {
    const m = /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/.exec(l);
    return m?.[1] === undefined ? undefined : { nome: m[1], tipo: "tipo" };
  },
  (l) => {
    // const/let de topo atribuído a arrow function, ou qualquer const exportado.
    const m = /^(export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(.*)$/.exec(l);
    if (m?.[2] === undefined) {
      return undefined;
    }
    const arrow = /^(?:async\s+)?\(|^(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(m[3] ?? "");
    if (m[1] !== undefined || arrow) {
      return { nome: m[2], tipo: arrow ? "função" : "constante" };
    }
    return undefined;
  },
];

const REGRAS_PYTHON: readonly Regra[] = [
  (l) => {
    const m = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(l);
    if (m?.[2] === undefined) {
      return undefined;
    }
    return { nome: m[2], tipo: (m[1] ?? "").length > 0 ? "método" : "função" };
  },
  (l) => {
    const m = /^\s*class\s+([A-Za-z_]\w*)/.exec(l);
    return m?.[1] === undefined ? undefined : { nome: m[1], tipo: "classe" };
  },
];

const REGRAS_JAVA: readonly Regra[] = [
  (l) => {
    const m =
      /^\s*(?:(?:public|private|protected|internal|open|final|abstract|sealed|data|static)\s+)*(class|interface|enum|object)\s+([A-Za-z_]\w*)/.exec(
        l,
      );
    if (m?.[2] === undefined) {
      return undefined;
    }
    return { nome: m[2], tipo: m[1] === "interface" ? "interface" : "classe" };
  },
  (l) => {
    const m =
      /^\s*(?:(?:public|private|protected|internal|open|override|suspend|inline)\s+)*fun\s+([A-Za-z_]\w*)/.exec(
        l,
      );
    return m?.[1] === undefined ? undefined : { nome: m[1], tipo: "função" };
  },
];

const REGRAS_GO: readonly Regra[] = [
  (l) => {
    const m = /^func\s*(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/.exec(l);
    return m?.[1] === undefined ? undefined : { nome: m[1], tipo: "função" };
  },
  (l) => {
    const m = /^type\s+([A-Za-z_]\w*)/.exec(l);
    return m?.[1] === undefined ? undefined : { nome: m[1], tipo: "tipo" };
  },
];

const REGRAS_SQL: readonly Regra[] = [
  (l) => {
    const m =
      /create\s+(?:or\s+replace\s+)?(?:global\s+|temporary\s+|temp\s+)?(table|view|function|procedure|type)\s+(?:if\s+not\s+exists\s+)?["'`]?([A-Za-z_][\w.]*)/i.exec(
        l,
      );
    if (m?.[2] === undefined) {
      return undefined;
    }
    return { nome: m[2], tipo: m[1]?.toLowerCase() === "table" ? "tabela" : "função" };
  },
];

const REGRAS: Readonly<Record<Linguagem, readonly Regra[]>> = {
  go: REGRAS_GO,
  java: REGRAS_JAVA,
  python: REGRAS_PYTHON,
  sql: REGRAS_SQL,
  ts: REGRAS_TS,
};

/**
 * Extrai as assinaturas de topo de um arquivo já lido. Sem IO. Dedup por `nome+linha`, com tetos
 * de linhas escaneadas e de símbolos retornados.
 */
export function extrairSimbolos(linguagem: Linguagem, texto: string): Simbolo[] {
  const regras = REGRAS[linguagem];
  const linhas = texto.split(/\r?\n/u);
  const total = Math.min(linhas.length, SYMBOLS_MAX_LINHAS);
  const simbolos: Simbolo[] = [];
  const vistos = new Set<string>();
  for (let i = 0; i < total; i += 1) {
    if (simbolos.length >= SYMBOLS_MAX_SIMBOLOS) {
      break;
    }
    const linha = linhas[i] ?? "";
    for (const regra of regras) {
      const achado = regra(linha);
      if (achado === undefined) {
        continue;
      }
      const chave = `${achado.nome}:${i}`;
      if (vistos.has(chave)) {
        continue;
      }
      vistos.add(chave);
      simbolos.push({
        assinatura: assinaturaDe(linha),
        linha: i + 1,
        nome: achado.nome,
        tipo: achado.tipo,
      });
      break; // uma linha vira no máximo um símbolo
    }
  }
  return simbolos;
}
