/** Artefatos Windows publicados em /downloads/ (servidos pelo site). */
export const DESKTOP_VERSAO = "1.2.0";

export const DOWNLOAD_WINDOWS = {
  portable: {
    arquivo: `CodingPro-portable-${DESKTOP_VERSAO}.exe`,
    rotulo: "Portátil (.exe)",
    tamanho: "~80 MB",
    descricao: "Executável único — sem instalação; atualizações são baixadas manualmente.",
  },
  setup: {
    arquivo: `CodingPro-Setup-${DESKTOP_VERSAO}.exe`,
    rotulo: "Instalador (.exe)",
    tamanho: "~80 MB",
    descricao: "Assistente NSIS com atualização assistida dentro do aplicativo.",
  },
} as const;

export function urlDownload(arquivo: string): string {
  return `/downloads/${encodeURIComponent(arquivo)}`;
}
