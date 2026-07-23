/** Tema Aurora — paleta esmeralda→ciano→violeta, escuro como base. */
export const aurora = {
  bg: "#0D1117",
  surface: "#161B22",
  border: "#30363D",
  texto: "#E6EDF3",
  textoMuted: "#8B949E",
  primario: "#34D399",    // esmeralda
  secundario: "#22D3EE",  // ciano
  destaque: "#A78BFA",    // violeta
  erro: "#F87171",
  sucesso: "#34D399",
  aviso: "#FBBF24",
  // Gradiente para spinner/banner
  gradiente: ["#34D399", "#22D3EE", "#A78BFA"],
} as const;

export type NomeTema = "aurora-escuro" | "aurora-claro" | "sobrio" | "daltonico";

export interface Tema {
  bg: string;
  surface: string;
  border: string;
  texto: string;
  textoMuted: string;
  primario: string;
  secundario: string;
  destaque: string;
  erro: string;
  sucesso: string;
  aviso: string;
  gradiente: readonly [string, string, string];
}

const temas: Record<NomeTema, Tema> = {
  "aurora-escuro": {
    bg: "#0D1117",
    surface: "#161B22",
    border: "#30363D",
    texto: "#E6EDF3",
    textoMuted: "#8B949E",
    primario: "#34D399",
    secundario: "#22D3EE",
    destaque: "#A78BFA",
    erro: "#F87171",
    sucesso: "#34D399",
    aviso: "#FBBF24",
    gradiente: ["#34D399", "#22D3EE", "#A78BFA"],
  },
  "aurora-claro": {
    bg: "#F6F8FA",
    surface: "#FFFFFF",
    border: "#D0D7DE",
    texto: "#1F2328",
    textoMuted: "#656D76",
    primario: "#059669",
    secundario: "#0891B2",
    destaque: "#7C3AED",
    erro: "#DC2626",
    sucesso: "#059669",
    aviso: "#D97706",
    gradiente: ["#059669", "#0891B2", "#7C3AED"],
  },
  sobrio: {
    bg: "#1E1E1E",
    surface: "#252526",
    border: "#444444",
    texto: "#D4D4D4",
    textoMuted: "#808080",
    primario: "#569CD6",
    secundario: "#4EC9B0",
    destaque: "#C586C0",
    erro: "#F44747",
    sucesso: "#4EC9B0",
    aviso: "#DCDCAA",
    gradiente: ["#569CD6", "#4EC9B0", "#C586C0"],
  },
  daltonico: {
    bg: "#0D1117",
    surface: "#161B22",
    border: "#30363D",
    texto: "#E6EDF3",
    textoMuted: "#8B949E",
    primario: "#F5A623",
    secundario: "#50E3C2",
    destaque: "#4A90D9",
    erro: "#FF6B6B",
    sucesso: "#50E3C2",
    aviso: "#F5A623",
    gradiente: ["#F5A623", "#50E3C2", "#4A90D9"],
  },
};

/** Resolve um tema pelo nome, ou retorna o Aurora escuro como fallback. */
export function resolverTema(nome?: string): Tema {
  if (nome !== undefined && nome in temas) {
    return temas[nome as NomeTema];
  }
  return temas["aurora-escuro"];
}

/** Lista os nomes dos temas disponíveis. */
export function listarTemas(): NomeTema[] {
  return Object.keys(temas) as NomeTema[];
}

/** Detecta quantas cores o terminal suporta. */
export function detectarCores(): 16 | 256 | 16777216 {
  const term = process.env.TERM ?? "";
  const colorterm = process.env.COLORTERM ?? "";
  if (colorterm === "truecolor" || colorterm === "24bit") return 16777216;
  if (term.includes("256color")) return 256;
  return 16;
}
