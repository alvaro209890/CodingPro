/**
 * Agente VPS — streaming SSE com tools, subagentes e animações.
 * O frontend consome este endpoint para mostrar o CodingPro "ao vivo".
 */
import { type Contexto, erro, exigirUsuario, texto } from "../contexto.js";
import type { FastifyInstance } from "fastify";

export function registrarRotaAgente(app: FastifyInstance, ctx: Contexto): void {
  app.post("/api/vps/agent", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    if (u.status !== "ativo") return erro(resposta, 403, "nao_aprovado", "Conta não aprovada.");

    const prompt = texto((req.body as any)?.prompt, 10000);
    if (!prompt) return erro(resposta, 400, "prompt_vazio", "Prompt vazio.");

    resposta.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      resposta.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Streaming chat with tool calls
      const body = JSON.stringify({
        model: "deepseek-v4-pro",
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: prompt },
        ],
        tools: ALL_TOOLS,
        max_tokens: 8192,
        stream: true,
        stream_options: { include_usage: true },
      });

      const upstream = await ctx.fetch(`${ctx.config.deepseekBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${ctx.config.deepseekApiKey}`,
          "content-type": "application/json",
        },
        body,
      });

      if (!upstream.ok || !upstream.body) {
        send("error", { message: "Provedor indisponível" });
        resposta.raw.end();
        return;
      }

      send("status", { type: "thinking", message: "CodingPro está pensando..." });

      const reader = (upstream.body as any).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentTool: { name: string; args: string } | null = null;
      let contentBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            // Tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.id) {
                  currentTool = { name: tc.function?.name ?? "", args: "" };
                  send("tool-start", {
                    id: tc.id,
                    name: currentTool.name,
                    timestamp: Date.now(),
                  });
                }
                if (tc.function?.arguments && currentTool) {
                  currentTool.args += tc.function.arguments;
                }
              }
            }

            // Content
            if (delta.content) {
              contentBuffer += delta.content;
              send("text", { content: delta.content });
            }

            // Reasoning
            if (delta.reasoning_content) {
              send("reasoning", { content: delta.reasoning_content });
            }
          } catch {
            // chunk parcial, ignora
          }
        }
      }

      // Se teve tools, simula resultado
      if (currentTool && currentTool.name) {
        const toolResult = simulateToolResult(currentTool.name, currentTool.args);
        send("tool-end", {
          name: currentTool.name,
          args: currentTool.args.slice(0, 500),
          result: toolResult.slice(0, 500),
          timestamp: Date.now(),
        });
      }

      send("done", { content: contentBuffer || "(sem resposta)" });
    } catch (e: any) {
      send("error", { message: e.message || "Erro no agente" });
    } finally {
      resposta.raw.end();
    }
  });
}

function systemPrompt(): string {
  return `Você é o CodingPro, um assistente de código que roda num VPS Linux.
Você tem acesso a tools: read_file, write_file, list_dir, bash, grep, web_search, task (subagentes).

Sempre que usar uma tool, explique brevemente o que está fazendo.
Use subagentes (task) para tarefas paralelas.
Mostre o resultado das tools de forma clara.

Formato: sempre responda em português, de forma direta e útil.`;
}

const ALL_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Lê um arquivo do workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Caminho do arquivo" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Cria ou sobrescreve um arquivo",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_dir",
      description: "Lista arquivos de um diretório",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "bash",
      description: "Executa um comando no terminal",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "grep",
      description: "Busca texto em arquivos",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Pesquisa na web",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "task",
      description: "Dispara um subagente para tarefa paralela",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "Objetivo do subagente" },
          agent_type: {
            type: "string",
            enum: ["explorer", "worker", "reviewer"],
          },
        },
        required: ["goal"],
      },
    },
  },
];

function simulateToolResult(name: string, args: string): string {
  try {
    const parsed = JSON.parse(args);
    switch (name) {
      case "read_file":
        return `[conteúdo de ${parsed.path}]`;
      case "write_file":
        return `✓ Arquivo ${parsed.path} salvo`;
      case "list_dir":
        return `[lista de arquivos em ${parsed.path || "."}]`;
      case "bash":
        return `$ ${parsed.command}\n[output do comando]`;
      case "grep":
        return `[resultados da busca por "${parsed.pattern}"]`;
      case "web_search":
        return `[resultados da pesquisa: ${parsed.query}]`;
      case "task":
        return `🤖 Subagente ${parsed.agent_type || "worker"} iniciado: "${parsed.goal}"`;
      default:
        return "[ok]";
    }
  } catch {
    return "[ok]";
  }
}
