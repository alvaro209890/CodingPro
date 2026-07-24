import { exec } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { FastifyInstance } from "fastify";
import { type Contexto, erro, exigirUsuario, texto } from "../contexto.js";

const RAIZ = join(homedir(), "Documentos", "playground-workspaces");
const TIMEOUT_MS = 30_000;

function dirUsuario(id: number): string {
  const dir = join(RAIZ, String(id));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Lista arquivos do workspace (em árvore plana com paths relativos). */
function listarArquivos(dir: string, base: string = dir): string[] {
  const resultado: string[] = [];
  if (!existsSync(dir)) return resultado;
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const rel = caminho.slice(base.length + 1);
    try {
      if (statSync(caminho).isDirectory()) {
        resultado.push(rel + "/");
        resultado.push(...listarArquivos(caminho, base));
      } else {
        resultado.push(rel);
      }
    } catch { /* permissão ou arquivo movido */ }
  }
  return resultado.sort();
}

export function registrarRotasPlayground(app: FastifyInstance, ctx: Contexto): void {
  // Listar arquivos
  app.post("/api/playground/files", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    const dir = dirUsuario(usuario.id);
    // Cria um arquivo inicial se estiver vazio
    if (listarArquivos(dir).length === 0) {
      writeFileSync(join(dir, "index.js"), "// Bem-vindo ao CodingPro Playground!\nconsole.log('Olá, mundo!');\n");
    }
    return resposta.send({ files: listarArquivos(dir), raiz: dir });
  });

  // Ler arquivo
  app.post("/api/playground/read", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    const dir = dirUsuario(usuario.id);
    const caminho = texto((req.body as Record<string, unknown> | undefined)?.path, 500);
    if (!caminho || caminho.includes("..")) return erro(resposta, 400, "path_invalido", "Caminho inválido.");
    const alvo = resolve(join(dir, caminho));
    if (!alvo.startsWith(dir)) return erro(resposta, 403, "fora_do_workspace", "Acesso negado.");
    try {
      const conteudo = readFileSync(alvo, "utf8");
      return resposta.send({ content: conteudo, path: caminho });
    } catch {
      return erro(resposta, 404, "arquivo_nao_encontrado", "Arquivo não encontrado.");
    }
  });

  // Escrever arquivo
  app.post("/api/playground/write", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    const dir = dirUsuario(usuario.id);
    const caminho = texto((req.body as Record<string, unknown> | undefined)?.path, 500);
    const conteudo = typeof (req.body as Record<string, unknown> | undefined)?.content === "string"
      ? (req.body as Record<string, unknown>).content as string
      : "";
    if (!caminho || caminho.includes("..")) return erro(resposta, 400, "path_invalido", "Caminho inválido.");
    const alvo = resolve(join(dir, caminho));
    if (!alvo.startsWith(dir)) return erro(resposta, 403, "fora_do_workspace", "Acesso negado.");
    try {
      writeFileSync(alvo, conteudo, "utf8");
      return resposta.send({ ok: true });
    } catch {
      return erro(resposta, 500, "erro_escrita", "Não consegui salvar o arquivo.");
    }
  });

  // Executar código (Node.js)
  app.post("/api/playground/run", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    const dir = dirUsuario(usuario.id);
    const caminho = texto((req.body as Record<string, unknown> | undefined)?.path, 500) || "index.js";
    const alvo = resolve(join(dir, caminho));
    if (!alvo.startsWith(dir)) return erro(resposta, 403, "fora_do_workspace", "Acesso negado.");
    if (!existsSync(alvo)) return erro(resposta, 404, "arquivo_nao_encontrado", "Arquivo não encontrado para executar.");

    try {
      const resultado = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
        exec(`node "${alvo}"`, { cwd: dir, timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
          resolve({ stdout: stdout.slice(0, 50000), stderr: stderr.slice(0, 50000), code: err?.code ?? 0 });
        });
      });
      return resposta.send(resultado);
    } catch (causa) {
      return erro(resposta, 500, "erro_execucao", "Erro ao executar o código.");
    }
  });

  // Chat via proxy (usa o token cp_ do usuário)
  app.post("/api/playground/chat", async (req, resposta) => {
    const usuario = await exigirUsuario(ctx, req, resposta);
    if (!usuario) return resposta;
    if (usuario.status !== "ativo") {
      return erro(resposta, 403, "conta_nao_aprovada", "Conta não aprovada.");
    }

    const prompt = texto((req.body as Record<string, unknown> | undefined)?.prompt, 10000);
    if (!prompt) return erro(resposta, 400, "prompt_vazio", "Prompt vazio.");

    try {
      const upstream = await ctx.fetch(`${ctx.config.deepseekBaseUrl}/chat/completions`, {
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4096,
        }),
        headers: {
          authorization: `Bearer ${ctx.config.deepseekApiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (!upstream.ok) {
        return erro(resposta, 502, "provedor_erro", "Erro no provedor de IA.");
      }

      const corpo = await upstream.json() as Record<string, unknown>;
      return resposta.send({ reply: extrairConteudo(corpo) });
    } catch (causa) {
      return erro(resposta, 502, "provedor_indisponivel", "Provedor indisponível.");
    }
  });
}

function extrairConteudo(corpo: Record<string, unknown>): string {
  try {
    const choices = corpo.choices as Array<{ message?: { content?: string } }> | undefined;
    return choices?.[0]?.message?.content ?? "(sem resposta)";
  } catch {
    return "(sem resposta)";
  }
}
