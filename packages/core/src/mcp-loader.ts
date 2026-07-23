import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser/lib/esm/main.js";
import { McpClient, type McpServerConfig, toolsDoServidorMcp } from "./mcp.js";
import type { ExecutableTool } from "./tool.js";

/**
 * Carrega servidores MCP do `settings.json` (campo `mcpServers`), conecta cada um e reúne suas
 * tools. Best-effort: settings ausente ou servidor que não sobe é ignorado com aviso, sem derrubar
 * a sessão. Formato: `"mcpServers": { "<nome>": { "command": "...", "args": [...], "env": {...} } }`.
 */
export interface ServidoresMcp {
  readonly tools: readonly ExecutableTool[];
  readonly avisos: readonly string[];
  fechar(): void;
}

function configsDe(valor: unknown): Record<string, McpServerConfig> {
  if (typeof valor !== "object" || valor === null) {
    return {};
  }
  const saida: Record<string, McpServerConfig> = {};
  for (const [nome, cfg] of Object.entries(valor as Record<string, unknown>)) {
    const c = cfg as Record<string, unknown>;
    if (typeof c?.command === "string" && c.command.length > 0) {
      saida[nome] = {
        command: c.command,
        ...(Array.isArray(c.args)
          ? { args: c.args.filter((a): a is string => typeof a === "string") }
          : {}),
        ...(typeof c.env === "object" && c.env !== null
          ? { env: c.env as Record<string, string> }
          : {}),
      };
    }
  }
  return saida;
}

async function lerConfigsMcp(arquivo: string): Promise<Record<string, McpServerConfig>> {
  try {
    const texto = await readFile(arquivo, "utf8");
    const dados = parseJsonc(texto) as { mcpServers?: unknown } | undefined;
    return configsDe(dados?.mcpServers);
  } catch {
    return {};
  }
}

/** Conecta todos os servidores MCP configurados (global + projeto) e reúne as tools. */
export async function iniciarServidoresMcp(
  cwd: string,
  homeDir: string = homedir(),
): Promise<ServidoresMcp> {
  const [globais, projeto] = await Promise.all([
    lerConfigsMcp(join(homeDir, ".codingpro", "settings.json")),
    lerConfigsMcp(join(cwd, ".codingpro", "settings.json")),
  ]);
  const configs = { ...globais, ...projeto };

  const clients: McpClient[] = [];
  const tools: ExecutableTool[] = [];
  const avisos: string[] = [];
  for (const [nome, config] of Object.entries(configs)) {
    try {
      const client = await McpClient.conectar(nome, config);
      clients.push(client);
      tools.push(...(await toolsDoServidorMcp(client)));
    } catch (error) {
      avisos.push(`MCP '${nome}' não conectou: ${error instanceof Error ? error.message : "erro"}`);
    }
  }
  return {
    avisos,
    fechar: () => {
      for (const c of clients) {
        c.fechar();
      }
    },
    tools,
  };
}
