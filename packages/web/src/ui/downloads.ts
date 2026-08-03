/** Artefatos Windows publicados em /downloads/ (servidos pelo site). */
export const DESKTOP_VERSAO = "1.1.1";

export const DOWNLOAD_WINDOWS = {
  portable: {
    arquivo: `CodingPro-portable-${DESKTOP_VERSAO}.exe`,
    rotulo: "Portátil (.exe)",
    tamanho: "~80 MB",
    descricao: "Executável único — não precisa instalar.",
  },
  setup: {
    arquivo: `CodingPro-Setup-${DESKTOP_VERSAO}.exe`,
    rotulo: "Instalador (.exe)",
    tamanho: "~80 MB",
    descricao: "Assistente NSIS com atalho no menu Iniciar.",
  },
} as const;

export function urlDownload(arquivo: string): string {
  return `/downloads/${encodeURIComponent(arquivo)}`;
}
