/** Artefatos Windows publicados em /downloads/ (servidos pelo site). */
export const DESKTOP_VERSAO = "0.1.0";

export const DOWNLOAD_WINDOWS = {
  portable: {
    arquivo: `CodingPro-portable-${DESKTOP_VERSAO}.zip`,
    rotulo: "Portable (.zip)",
    tamanho: "115 MB",
    descricao: "Extrair tudo e executar CodingPro.exe na pasta.",
  },
  setup: {
    arquivo: `CodingPro Setup ${DESKTOP_VERSAO}.exe`,
    rotulo: "Instalador (.exe)",
    tamanho: "~190 KB",
    descricao: "Instalador NSIS (em evolução — prefira o portable por enquanto).",
  },
} as const;

export function urlDownload(arquivo: string): string {
  return `/downloads/${encodeURIComponent(arquivo)}`;
}
