import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser/lib/esm/main.js";
import { type EstadoPet, estadoInicialPet, sanitizarPet } from "./pet.js";

/** Caminho padrão do estado do pet (`~/.codingpro/pet.json`). */
export function arquivoPetPadrao(homeDir: string = homedir()): string {
  return join(homeDir, ".codingpro", "pet.json");
}

/** Lê o estado do pet; ausente/corrompido → estado inicial (best-effort). */
export async function carregarEstadoPet(arquivo: string): Promise<EstadoPet> {
  try {
    return sanitizarPet(JSON.parse(await readFile(arquivo, "utf8")));
  } catch {
    return estadoInicialPet();
  }
}

/** Persiste o estado do pet (cria o diretório se preciso). Falhas são silenciosas. */
export async function salvarEstadoPet(arquivo: string, estado: EstadoPet): Promise<void> {
  try {
    await mkdir(dirname(arquivo), { recursive: true });
    await writeFile(arquivo, `${JSON.stringify(estado, null, 2)}\n`, "utf8");
  } catch {
    // cosmético: nunca deve quebrar o chat
  }
}

/** Interpreta uma flag textual de ambiente (`1/true/on` → true, `0/false/off` → false). */
function flagBooleana(valor: string | undefined): boolean | undefined {
  const v = (valor ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") {
    return true;
  }
  if (v === "0" || v === "false" || v === "no" || v === "off") {
    return false;
  }
  return undefined;
}

/**
 * Resolve se o pet está habilitado. Precedência: `CODINGPRO_PET` (env) →
 * `pet` no settings.json (projeto vence global) → padrão `true` (decisão de produto: pet on).
 */
export async function petHabilitado(
  cwd: string,
  homeDir: string = homedir(),
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const doEnv = flagBooleana(env.CODINGPRO_PET);
  if (doEnv !== undefined) {
    return doEnv;
  }
  for (const arquivo of [
    join(cwd, ".codingpro", "settings.json"),
    join(homeDir, ".codingpro", "settings.json"),
  ]) {
    try {
      const dados = parseJsonc(await readFile(arquivo, "utf8")) as { pet?: unknown } | undefined;
      if (typeof dados?.pet === "boolean") {
        return dados.pet;
      }
    } catch {
      // ausente/ilegível → tenta o próximo
    }
  }
  return true;
}
