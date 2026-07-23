import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NomeTema } from "./tema.js";

const SETTINGS_DIR = join(homedir(), ".codingpro");
const SETTINGS_FILE = join(SETTINGS_DIR, "settings.json");

interface Settings {
  tui?: {
    tema?: NomeTema;
  };
}

/** Carrega as settings do usuário. */
export async function carregarSettings(): Promise<Settings> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf8");
    return JSON.parse(raw) as Settings;
  } catch {
    return {};
  }
}

/** Salva as settings do usuário (mescla com as existentes). */
export async function salvarSettings(patches: Partial<Settings>): Promise<void> {
  const atual = await carregarSettings();
  const novo = { ...atual, ...patches };
  try {
    await mkdir(SETTINGS_DIR, { recursive: true });
  } catch {
    // diretório já existe
  }
  await writeFile(SETTINGS_FILE, `${JSON.stringify(novo, null, 2)}\n`, "utf8");
}

/** Lê o tema salvo, ou retorna o default. */
export async function temaSalvo(): Promise<NomeTema> {
  const s = await carregarSettings();
  return s.tui?.tema ?? "aurora-escuro";
}

/** Persiste a escolha de tema. */
export async function salvarTema(tema: NomeTema): Promise<void> {
  const atual = await carregarSettings();
  await salvarSettings({ ...atual, tui: { ...(atual.tui ?? {}), tema } });
}
