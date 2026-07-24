import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser/lib/esm/main.js";

interface Settings {
  readonly permissions?: {
    readonly allowlist?: unknown;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function settingsPath(root: string): string {
  return join(root, ".codingpro", "settings.json");
}

function toPlainObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => !DANGEROUS_KEYS.has(key)),
  );
}

function parseSettings(content: string): Settings | undefined {
  try {
    return parseJsonc(content) as Settings | undefined;
  } catch {
    return undefined;
  }
}

function normalizarAllowlist(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const nomes: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const nome = item.trim();
    if (nome.length > 0 && !seen.has(nome)) {
      seen.add(nome);
      nomes.push(nome);
    }
  }
  return nomes;
}

function lerAllowlistArquivo(path: string): string[] {
  try {
    const settings = parseSettings(readFileSync(path, "utf8"));
    return normalizarAllowlist(settings?.permissions?.allowlist);
  } catch {
    return [];
  }
}

/** Lê allowlist persistida: projeto primeiro, depois global, removendo duplicatas. */
export function lerAllowlist(cwd: string, home: string = homedir()): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [
    ...lerAllowlistArquivo(settingsPath(cwd)),
    ...lerAllowlistArquivo(settingsPath(home)),
  ]) {
    if (!seen.has(item)) {
      seen.add(item);
      merged.push(item);
    }
  }
  return merged;
}

/** Adiciona uma tool à allowlist do projeto, criando `.codingpro/settings.json` se necessário. */
export async function adicionarAllowlist(toolName: string, cwd: string): Promise<void> {
  const nome = toolName.trim();
  if (nome.length === 0) {
    return;
  }

  const path = settingsPath(cwd);
  let content = "{}";
  try {
    content = await readFile(path, "utf8");
  } catch {
    // arquivo ausente/ilegível: recriaremos uma configuração mínima e segura
  }

  const root = toPlainObject(parseSettings(content));
  const permissions = toPlainObject(root.permissions);
  const allowlist = normalizarAllowlist(permissions.allowlist);
  if (allowlist.includes(nome)) {
    return;
  }

  permissions.allowlist = [...allowlist, nome];
  root.permissions = permissions;

  await mkdir(join(cwd, ".codingpro"), { recursive: true });
  await writeFile(path, `${JSON.stringify(root, null, 2)}\n`, "utf8");
}
