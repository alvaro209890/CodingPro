/**
 * Agente VPS — streaming SSE com loop real de tools no workspace do usuário.
 * A IA pode listar diretórios, ler/escrever arquivos, executar comandos.
 */
import { exec as execCb } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { type Contexto, erro, exigirUsuario, texto } from "../contexto.js";

const exec = promisify(execCb);
const RAIZ =
  process.env.CODINGPRO_WORKSPACE_ROOT || join(homedir(), "Documentos", "vps-workspaces");

function dirUsuario(id: number): string {
  const dir = join(RAIZ, String(id));
  mkdirSync(dir, { recursive: true });
  for (const pasta of ["Documents", "Downloads", "Projects", ".memory"]) {
    mkdirSync(join(dir, pasta), { recursive: true });
  }
  return dir;
}

function caminhoDoWorkspace(workspace: string, relativo: string): string | null {
  if (!relativo || relativo.includes("\0")) return null;
  const alvo = resolve(workspace, relativo);
  return alvo === workspace || alvo.startsWith(`${workspace}${sep}`) ? alvo : null;
}

function arquivoExistenteSeguro(workspace: string, relativo: string): string | null {
  const alvo = caminhoDoWorkspace(workspace, relativo);
  if (!alvo || !existsSync(alvo)) return null;
  try {
    const raizReal = realpathSync(workspace);
    const alvoReal = realpathSync(alvo);
    return alvoReal === raizReal || alvoReal.startsWith(`${raizReal}${sep}`) ? alvoReal : null;
  } catch {
    return null;
  }
}

function listarArquivos(dir: string, base: string = dir, prof = 0): string {
  if (!existsSync(dir) || prof > 3) return "";
  let out = "";
  for (const nome of readdirSync(dir).slice(0, 100)) {
    if (nome.startsWith(".")) continue;
    const p = join(dir, nome);
    try {
      const st = statSync(p);
      out += `${st.isDirectory() ? "d" : "-"} ${nome}${st.isDirectory() ? "/" : ""} (${st.size} bytes)\n`;
      if (st.isDirectory() && prof < 2) out += listarArquivos(p, base, prof + 1);
    } catch {
      /* skip */
    }
  }
  return out;
}

async function executarTool(
  nome: string,
  args: Record<string, unknown>,
  workspace: string,
): Promise<string> {
  try {
    switch (nome) {
      case "read_file": {
        const path = String(args.path ?? "");
        const alvo = arquivoExistenteSeguro(workspace, path);
        if (!alvo) return `Erro: arquivo '${path}' não encontrado ou acesso negado.`;
        const content = readFileSync(alvo, "utf8");
        return content.slice(0, 10000);
      }
      case "write_file": {
        const path = String(args.path ?? "");
        const content = String(args.content ?? "");
        const alvo = caminhoDoWorkspace(workspace, path);
        if (!alvo) return "Erro: acesso negado.";
        mkdirSync(dirname(alvo), { recursive: true });
        writeFileSync(alvo, content, "utf8");
        return `✓ Arquivo '${path}' salvo (${content.length} bytes).`;
      }
      case "list_dir": {
        const path = String(args.path ?? ".");
        const alvo = arquivoExistenteSeguro(workspace, path);
        if (!alvo) return "Erro: acesso negado.";
        const lista = listarArquivos(alvo);
        return lista || "(diretório vazio)";
      }
      case "bash": {
        const command = String(args.command ?? "");
        if (command.length > 2000) return "Erro: comando muito longo.";
        const { stdout, stderr } = await exec(command, {
          cwd: workspace,
          timeout: 30_000,
          maxBuffer: 50_000,
          env: { ...process.env, HOME: workspace },
        });
        return (stdout + (stderr ? "\n" + stderr : "")).slice(0, 10000) || "(sem saída)";
      }
      case "grep": {
        // Simples: busca nos arquivos do workspace
        const pattern = String(args.pattern ?? "");
        if (!pattern) return "Erro: padrão vazio.";
        const files = readdirSync(workspace).filter(
          (f) =>
            f.endsWith(".js") ||
            f.endsWith(".ts") ||
            f.endsWith(".json") ||
            f.endsWith(".md") ||
            f.endsWith(".txt"),
        );
        let result = "";
        for (const f of files.slice(0, 10)) {
          try {
            const content = readFileSync(join(workspace, f), "utf8");
            for (const [i, line] of content.split("\n").entries()) {
              if (line.includes(pattern)) result += `${f}:${i + 1}: ${line.trim().slice(0, 200)}\n`;
            }
          } catch {
            /* skip */
          }
        }
        return result || `Nenhuma ocorrência de '${pattern}' encontrada.`;
      }
      case "web_search": {
        return `[Web search desabilitada no VPS. Use a aba Git para clonar repositórios ou o terminal para comandos.]`;
      }
      case "task": {
        return `[Subagentes não disponíveis no VPS. Use as tools diretamente: leia, escreva e execute comandos você mesmo.]`;
      }
      default:
        return `Tool '${nome}' não implementada.`;
    }
  } catch (e: any) {
    return `Erro: ${e.message}`;
  }
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Lê um arquivo do workspace. Use para analisar código.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Caminho relativo do arquivo" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Cria ou edita um arquivo no workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_dir",
      description: "Lista arquivos e pastas. Use para explorar o workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Caminho (ex: '.' ou 'Documents')" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "bash",
      description: "Executa comando no terminal Linux do VPS.",
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
      description: "Busca texto nos arquivos do workspace.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Pesquisa na web (desabilitado).",
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
      description: "Subagente (desabilitado no VPS).",
      parameters: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] },
    },
  },
];

export function registrarRotaAgente(app: FastifyInstance, ctx: Contexto): void {
  app.post("/api/vps/agent", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    if (u.status !== "ativo") return erro(resposta, 403, "nao_aprovado", "Conta não aprovada.");

    const prompt = texto((req.body as any)?.prompt, 10000);
    if (!prompt) return erro(resposta, 400, "prompt_vazio", "Prompt vazio.");

    const workspace = dirUsuario(u.id);

    resposta.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      resposta.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let concluiu = false;
    try {
      const messages: any[] = [
        {
          role: "system",
          content: `Você é o CodingPro, um assistente de IA rodando num VPS Linux. Você tem acesso REAL ao sistema de arquivos do workspace do usuário.

Workspace: ${workspace}

Use as tools disponíveis para:
- list_dir: explorar pastas (sempre comece por aqui para entender o que existe)
- read_file: ler arquivos (passe o caminho relativo)
- write_file: criar/editar arquivos
- bash: executar comandos no terminal
- grep: buscar texto nos arquivos

Sempre responda em português. Seja direto e útil. Quando o usuário pedir para analisar algo, USE AS TOOLS para explorar os arquivos reais antes de responder.`,
        },
        { role: "user", content: prompt },
      ];

      send("status", { type: "thinking", message: "Analisando..." });

      // Agent loop — até 5 iterações
      for (let iter = 0; iter < 5; iter++) {
        const upstream = await ctx.fetch(`${ctx.config.deepseekBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${ctx.config.deepseekApiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-v4-pro",
            messages,
            tools: TOOLS,
            max_tokens: 4096,
            stream: false,
          }),
        });

        if (!upstream.ok) {
          send("error", { type: "error", message: "Provedor indisponível" });
          break;
        }

        const corpo = (await upstream.json()) as any;
        const msg = corpo.choices?.[0]?.message;
        if (!msg) {
          send("error", { type: "error", message: "Resposta vazia" });
          break;
        }

        // Tool calls?
        if (msg.tool_calls?.length > 0) {
          messages.push(msg);
          for (const tc of msg.tool_calls) {
            const nome = tc.function?.name ?? "?";
            const args = JSON.parse(tc.function?.arguments ?? "{}");
            send("tool-start", {
              type: "tool-start",
              id: tc.id,
              name: nome,
              args: JSON.stringify(args).slice(0, 200),
              timestamp: Date.now(),
            });

            const resultado = await executarTool(nome, args, workspace);
            send("tool-end", {
              type: "tool-end",
              id: tc.id,
              name: nome,
              result: resultado.slice(0, 500),
              timestamp: Date.now(),
            });

            messages.push({ role: "tool", tool_call_id: tc.id, content: resultado });
          }
        } else {
          // Resposta final
          const content = msg.content || "(sem resposta)";
          send("text", { type: "text", content });
          send("done", { type: "done", content });
          concluiu = true;
          break;
        }
      }

      if (!concluiu) {
        send("done", {
          type: "done",
          content: "A tarefa excedeu o limite de etapas. Tente dividir o pedido em partes menores.",
        });
      }
    } catch (e: any) {
      send("error", { type: "error", message: e.message || "Erro no agente" });
    } finally {
      resposta.raw.end();
    }
  });
}
