import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Hook, HookEvent } from "@codingpro/core";
import { parse as parseJsonc } from "jsonc-parser/lib/esm/main.js";

/**
 * Carrega hooks do `settings.json` global e do projeto (campo `hooks: []`). Best-effort: settings
 * ausente/ilegível ou entradas inválidas são ignorados. Formato de cada hook:
 * `{ "event": "pre-tool"|"post-tool"|"stop", "command": "...", "matcher"?: "...", "timeoutMs"?: n }`.
 */
const EVENTOS: readonly HookEvent[] = ["pre-tool", "post-tool", "stop"];

function hooksDe(valor: unknown): Hook[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  const hooks: Hook[] = [];
  for (const item of valor) {
    const obj = item as Record<string, unknown>;
    const event = obj?.event;
    const command = obj?.command;
    if (
      typeof event === "string" &&
      EVENTOS.includes(event as HookEvent) &&
      typeof command === "string" &&
      command.trim().length > 0
    ) {
      hooks.push({
        command,
        event: event as HookEvent,
        ...(typeof obj.matcher === "string" ? { matcher: obj.matcher } : {}),
        ...(typeof obj.timeoutMs === "number" ? { timeoutMs: obj.timeoutMs } : {}),
      });
    }
  }
  return hooks;
}

async function lerHooks(arquivo: string): Promise<Hook[]> {
  try {
    const texto = await readFile(arquivo, "utf8");
    const dados = parseJsonc(texto) as { hooks?: unknown } | undefined;
    return hooksDe(dados?.hooks);
  } catch {
    return [];
  }
}

/** Hooks combinados: global (`~/.codingpro`) + projeto (`.codingpro`). */
export async function carregarHooks(cwd: string, homeDir: string = homedir()): Promise<Hook[]> {
  const [globais, projeto] = await Promise.all([
    lerHooks(join(homeDir, ".codingpro", "settings.json")),
    lerHooks(join(cwd, ".codingpro", "settings.json")),
  ]);
  return [...globais, ...projeto];
}
