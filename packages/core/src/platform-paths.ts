import { homedir } from "node:os";
import { join, normalize, resolve } from "node:path";

/**
 * Retorna o diretório de configuração global do CodingPro por plataforma.
 * No Windows: `%APPDATA%\CodingPro`
 * No Linux/macOS: `~/.codingpro`
 */
export function getGlobalConfigDir(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (typeof appData === "string" && appData.trim() !== "") {
      return join(appData, "CodingPro");
    }
    return join(homedir(), "AppData", "Roaming", "CodingPro");
  }
  return join(homedir(), ".codingpro");
}

/**
 * Retorna o diretório de memória global por plataforma.
 */
export function getGlobalMemoryDir(): string {
  return join(getGlobalConfigDir(), "memory");
}

/**
 * Normaliza caminhos no Windows (letras de unidade maiúsculas e separadores uniformizados).
 */
export function normalizePlatformPath(pathStr: string): string {
  const norm = normalize(resolve(pathStr));
  if (process.platform === "win32") {
    // Garante que a letra do drive em "c:\..." seja "C:\..."
    if (/^[a-z]:[\\/]/i.test(norm)) {
      return norm.charAt(0).toUpperCase() + norm.slice(1);
    }
  }
  return norm;
}
