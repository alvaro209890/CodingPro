/** Temas visuais da TUI Aurora. Só cores de terminal (ANSI), sem CSS. */

export type Tema = {
  readonly nome: string;
  readonly primaria: string;
  readonly secundaria: string;
  readonly fundo: string;
  readonly texto: string;
  readonly suave: string;
  readonly borda: string;
  readonly sucesso: string;
  readonly erro: string;
  readonly aviso: string;
};

export const TEMAS: Record<string, Tema> = {
  aurora: {
    nome: "aurora",
    primaria: "#10b981",
    secundaria: "#06b6d4",
    fundo: "#0a0a0f",
    texto: "#e6e6ec",
    suave: "#a1a1b0",
    borda: "#24242f",
    sucesso: "#10b981",
    erro: "#f2555a",
    aviso: "#f5bf47",
  },
  solar: {
    nome: "solar",
    primaria: "#f59e0b",
    secundaria: "#ef4444",
    fundo: "#1c1917",
    texto: "#fef3c7",
    suave: "#a8a29e",
    borda: "#292524",
    sucesso: "#84cc16",
    erro: "#f87171",
    aviso: "#fbbf24",
  },
  ocean: {
    nome: "ocean",
    primaria: "#38bdf8",
    secundaria: "#818cf8",
    fundo: "#0c1929",
    texto: "#e0f2fe",
    suave: "#7eaac6",
    borda: "#1e3a5f",
    sucesso: "#22d3ee",
    erro: "#fb7185",
    aviso: "#fde047",
  },
  midnight: {
    nome: "midnight",
    primaria: "#a78bfa",
    secundaria: "#c084fc",
    fundo: "#0f0f1a",
    texto: "#e9d5ff",
    suave: "#8b8ba6",
    borda: "#1e1e30",
    sucesso: "#a3e635",
    erro: "#fca5a5",
    aviso: "#fde047",
  },
};

export function cor(tema: Tema, nome: keyof Tema): string {
  return tema[nome] as string;
}
