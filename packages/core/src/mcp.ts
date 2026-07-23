import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import type { ExecutableTool, ToolContext } from "./tool.js";
import { errorResult, textResult } from "./tool.js";

/**
 * Cliente MCP (Model Context Protocol) mínimo sobre stdio: relança um servidor externo como
 * subprocesso e conversa por JSON-RPC 2.0 delimitado por linha (o transporte stdio do MCP). Descobre
 * as tools do servidor e as expõe como `ExecutableTool` (efeito `exec`, sempre pelo gate). Conteúdo
 * vindo do servidor é dado externo não-confiável — nunca instrução. SSE fica para uma fase futura.
 */

export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const MCP_DEFAULT_TIMEOUT_MS = 30_000;

export interface McpServerConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

interface JsonRpcResponse {
  readonly id?: number;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

interface McpToolDef {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
}

/** Prefixo estável do nome exposto ao modelo, evitando colisão com tools nativas. */
export function nomeMcpTool(servidor: string, tool: string): string {
  return `mcp__${servidor}__${tool}`;
}

/**
 * Conexão viva a um servidor MCP. `conectar` faz o handshake `initialize` e devolve o cliente já
 * pronto; `listarTools` descobre as tools; `chamar` invoca uma; `fechar` encerra o subprocesso.
 */
export class McpClient {
  private proximoId = 1;
  private buffer = "";
  private readonly pendentes = new Map<
    number,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();

  private constructor(
    readonly servidor: string,
    private readonly filho: ChildProcessWithoutNullStreams,
    private readonly timeoutMs: number,
  ) {
    this.filho.stdout.setEncoding("utf8");
    this.filho.stdout.on("data", (chunk: string) => this.consumir(chunk));
    this.filho.on("close", () => this.falharPendentes(new Error("servidor MCP encerrou")));
    this.filho.on("error", (erro) =>
      this.falharPendentes(erro instanceof Error ? erro : new Error("falha no servidor MCP")),
    );
    // Erro assíncrono no stdin: rejeita as pendências em vez de suprimir silenciosamente.
    this.filho.stdin.on("error", () =>
      this.falharPendentes(new Error("erro no stdin do servidor MCP")),
    );
  }

  /** Sobe o servidor e faz o handshake `initialize` + notificação `initialized`. */
  static async conectar(nome: string, config: McpServerConfig): Promise<McpClient> {
    const filho = spawn(config.command, [...(config.args ?? [])], {
      env: {
        HOME: process.env.HOME ?? "",
        PATH: process.env.PATH ?? "",
        ...(config.env ?? {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
    const client = new McpClient(nome, filho, config.timeoutMs ?? MCP_DEFAULT_TIMEOUT_MS);
    const init = await client.requisitar("initialize", {
      capabilities: {},
      clientInfo: { name: "codingpro", version: "0.1.0" },
      protocolVersion: MCP_PROTOCOL_VERSION,
    });
    if (init.error !== undefined) {
      client.fechar();
      throw new Error(`initialize falhou: ${init.error.message}`);
    }
    client.notificar("notifications/initialized", {});
    return client;
  }

  private consumir(chunk: string): void {
    this.buffer += chunk;
    let quebra = this.buffer.indexOf("\n");
    while (quebra >= 0) {
      const linha = this.buffer.slice(0, quebra).trim();
      this.buffer = this.buffer.slice(quebra + 1);
      if (linha.length > 0) {
        this.receber(linha);
      }
      quebra = this.buffer.indexOf("\n");
    }
  }

  private receber(linha: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(linha) as JsonRpcResponse;
    } catch {
      return; // linha não-JSON (ex.: log do servidor no stdout) → ignora
    }
    if (typeof msg.id !== "number") {
      return; // notificação do servidor: sem tratamento na v1
    }
    const pendente = this.pendentes.get(msg.id);
    if (pendente === undefined) {
      return;
    }
    clearTimeout(pendente.timer);
    this.pendentes.delete(msg.id);
    pendente.resolve(msg);
  }

  private falharPendentes(erro: Error): void {
    for (const [, p] of this.pendentes) {
      clearTimeout(p.timer);
      p.reject(erro);
    }
    this.pendentes.clear();
  }

  private notificar(method: string, params: unknown): void {
    try {
      this.filho.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    } catch {
      // pipe fechado: nada a fazer numa notificação
    }
  }

  private requisitar(method: string, params: unknown): Promise<JsonRpcResponse> {
    const id = this.proximoId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendentes.delete(id);
        reject(new Error(`tempo esgotado em ${method}`));
      }, this.timeoutMs);
      this.pendentes.set(id, { reject, resolve, timer });
      try {
        this.filho.stdin.write(`${JSON.stringify({ id, jsonrpc: "2.0", method, params })}\n`);
      } catch (erro) {
        // write síncrono pode lançar (pipe fechado): rejeita já, sem deixar a promessa pendente
        clearTimeout(timer);
        this.pendentes.delete(id);
        reject(erro instanceof Error ? erro : new Error("falha ao escrever no servidor MCP"));
      }
    });
  }

  /** Lista as tools anunciadas pelo servidor. */
  async listarTools(): Promise<McpToolDef[]> {
    const resp = await this.requisitar("tools/list", {});
    if (resp.error !== undefined) {
      throw new Error(resp.error.message);
    }
    const tools = (resp.result as { tools?: unknown } | undefined)?.tools;
    return Array.isArray(tools) ? (tools as McpToolDef[]) : [];
  }

  /** Invoca uma tool do servidor e devolve o texto consolidado do resultado. */
  async chamar(nome: string, args: JsonObject): Promise<string> {
    const resp = await this.requisitar("tools/call", { arguments: args, name: nome });
    if (resp.error !== undefined) {
      throw new Error(resp.error.message);
    }
    const content = (resp.result as { content?: unknown } | undefined)?.content;
    if (!Array.isArray(content)) {
      return "";
    }
    return content
      .map((parte) => {
        const p = parte as { type?: string; text?: string };
        return p.type === "text" && typeof p.text === "string" ? p.text : "";
      })
      .filter((t) => t.length > 0)
      .join("\n");
  }

  /** Encerra o subprocesso do servidor. */
  fechar(): void {
    this.falharPendentes(new Error("cliente MCP fechado"));
    try {
      this.filho.kill("SIGTERM");
    } catch {
      // já morto
    }
  }
}

function schemaSeguro(schema: unknown): Tool["inputSchema"] {
  if (
    typeof schema === "object" &&
    schema !== null &&
    (schema as { type?: unknown }).type === "object"
  ) {
    return schema as Tool["inputSchema"];
  }
  return { additionalProperties: false, properties: {}, type: "object" };
}

/**
 * Converte as tools de um cliente MCP conectado em `ExecutableTool`s. Nome prefixado
 * (`mcp__<servidor>__<tool>`), efeito `exec` (passa pelo gate), execução delega ao servidor.
 */
export async function toolsDoServidorMcp(client: McpClient): Promise<ExecutableTool[]> {
  const defs = await client.listarTools();
  return defs.map((def): ExecutableTool => {
    const definition: Tool = {
      description: `[MCP:${client.servidor}] ${def.description ?? def.name}`,
      inputSchema: schemaSeguro(def.inputSchema),
      name: nomeMcpTool(client.servidor, def.name),
    };
    return {
      definition,
      sideEffect: "exec",
      async execute(input: JsonObject, _context: ToolContext): Promise<ToolResult> {
        try {
          const texto = await client.chamar(def.name, input);
          return textResult(texto.length > 0 ? texto : "(sem conteúdo)");
        } catch (error) {
          return errorResult(
            `Falha ao chamar a tool MCP: ${error instanceof Error ? error.message : "erro"}`,
          );
        }
      },
    };
  });
}
