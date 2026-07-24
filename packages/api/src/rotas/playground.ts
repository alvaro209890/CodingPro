/**
 * Workspace VPS — backend completo.
 * Cada usuário tem um workspace isolado com:
 *  - Pastas padrão: Documents, Downloads, Projects, .memory
 *  - Git: clone, pull, status, log
 *  - Terminal: comandos com timeout e limite de output
 *  - Memória persistente: notas .md no .memory/
 *  - CodingPro AI: chat integrado com contexto do workspace
 */
import { exec as execCb } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { type Contexto, erro, exigirUsuario, texto } from "../contexto.js";
import { checarAcessoLlm, registrarUsoDaResposta } from "../limites.js";
import { dirUsuario } from "../workspace.js";

const exec = promisify(execCb);
const TIMEOUT_CMD = 60_000;
const MAX_OUTPUT = 100_000;

function listarArquivos(dir: string, base: string = dir, profundidade = 0): string[] {
  const resultado: string[] = [];
  if (!existsSync(dir) || profundidade > 5) return resultado;
  for (const nome of readdirSync(dir)) {
    if (nome.startsWith(".") || nome === "node_modules") continue;
    const caminho = join(dir, nome);
    const rel = caminho.slice(base.length + 1);
    try {
      const st = statSync(caminho);
      if (st.isDirectory() || st.isSymbolicLink()) {
        resultado.push(`${rel}/`);
        if (profundidade < 5) resultado.push(...listarArquivos(caminho, base, profundidade + 1));
      } else {
        resultado.push(rel);
      }
    } catch {
      /* skip */
    }
  }
  return resultado.sort();
}

function resolverSeguro(dirBase: string, relativo: string): string | null {
  if (!relativo || relativo.includes("..") || relativo.includes("~")) return null;
  const alvo = resolve(join(dirBase, relativo));
  try {
    const real = realpathSync(alvo);
    const realBase = realpathSync(dirBase);
    return real === realBase || real.startsWith(`${realBase}${sep}`) ? real : null;
  } catch {
    return null;
  }
}

function destinoUploadSeguro(dirBase: string, relativo: string): string | null {
  const normalizado = relativo.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalizado || normalizado.includes("..") || normalizado.includes("\0")) return null;
  const destino = resolve(dirBase, normalizado);
  return destino === dirBase || destino.startsWith(`${dirBase}${sep}`) ? destino : null;
}

// ─── Rotas ────────────────────────────────────────────────────

export function registrarRotasPlayground(app: FastifyInstance, ctx: Contexto): void {
  // ── Files ──
  app.post("/api/vps/files", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    const raiz = dirUsuario(u.id);
    return resposta.send({ files: listarArquivos(raiz), raiz });
  });

  app.post("/api/vps/upload", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;

    const raiz = dirUsuario(u.id);
    const enviados: string[] = [];
    try {
      for await (const parte of req.parts()) {
        if (parte.type !== "file") continue;
        const campoPath = parte.fields.path;
        const ultimaPartePath = Array.isArray(campoPath) ? campoPath.at(-1) : campoPath;
        const caminhoSolicitado =
          ultimaPartePath && "value" in ultimaPartePath
            ? String(ultimaPartePath.value)
            : parte.filename;
        const destino = destinoUploadSeguro(raiz, caminhoSolicitado);
        if (!destino) {
          parte.file.resume();
          return erro(resposta, 400, "caminho_invalido", "O caminho do arquivo não é válido.");
        }
        mkdirSync(dirname(destino), { recursive: true });
        await pipeline(parte.file, createWriteStream(destino, { flags: "w" }));
        if (parte.file.truncated)
          return erro(resposta, 413, "arquivo_grande", "Cada arquivo pode ter até 512 MB.");
        enviados.push(destino.slice(raiz.length + 1).replaceAll("\\", "/"));
      }
      if (enviados.length === 0)
        return erro(resposta, 400, "arquivo_ausente", "Selecione ao menos um arquivo para enviar.");
      return resposta.status(201).send({ files: enviados, total: enviados.length });
    } catch (e: any) {
      return erro(resposta, 500, "erro_upload", e.message || "Falha ao receber o arquivo.");
    }
  });

  app.post("/api/vps/read", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    const caminho = resolverSeguro(dirUsuario(u.id), texto((req.body as any)?.path, 500));
    if (!caminho) return erro(resposta, 403, "acesso_negado", "Acesso negado.");
    try {
      return resposta.send({
        content: readFileSync(caminho, "utf8").slice(0, 500_000),
        path: (req.body as any)?.path,
      });
    } catch {
      return erro(resposta, 404, "nao_encontrado", "Arquivo não encontrado.");
    }
  });

  app.post("/api/vps/write", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    const relativo = texto((req.body as any)?.path, 500);
    if (relativo.includes("~")) return erro(resposta, 403, "acesso_negado", "Acesso negado.");
    const caminho = destinoUploadSeguro(dirUsuario(u.id), relativo);
    if (!caminho) return erro(resposta, 403, "acesso_negado", "Acesso negado.");
    const conteudo =
      typeof (req.body as any)?.content === "string" ? (req.body as any).content : "";
    try {
      mkdirSync(dirname(caminho), { recursive: true });
      writeFileSync(caminho, conteudo, "utf8");
      return resposta.send({ ok: true });
    } catch {
      return erro(resposta, 500, "erro_escrita", "Falha ao salvar.");
    }
  });

  app.post("/api/vps/delete", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    const caminho = resolverSeguro(dirUsuario(u.id), texto((req.body as any)?.path, 500));
    if (!caminho) return erro(resposta, 403, "acesso_negado", "Acesso negado.");
    try {
      const { rmSync } = await import("node:fs");
      rmSync(caminho, { recursive: true, force: true });
      return resposta.send({ ok: true });
    } catch {
      return erro(resposta, 500, "erro_delete", "Falha ao deletar.");
    }
  });

  // ── Terminal ──
  app.post("/api/vps/terminal", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    const comando = texto((req.body as any)?.command, 2000);
    const cwd =
      resolverSeguro(dirUsuario(u.id), texto((req.body as any)?.cwd, 500) || ".") ??
      dirUsuario(u.id);
    if (!comando) return erro(resposta, 400, "comando_vazio", "Comando vazio.");
    try {
      const { stdout, stderr } = await exec(comando, {
        cwd,
        timeout: TIMEOUT_CMD,
        maxBuffer: MAX_OUTPUT,
        env: { ...process.env, HOME: dirUsuario(u.id) },
      });
      return resposta.send({
        stdout: stdout.slice(0, MAX_OUTPUT),
        stderr: stderr.slice(0, MAX_OUTPUT),
        cwd,
      });
    } catch (e: any) {
      return resposta.send({
        stdout: e.stdout?.slice(0, MAX_OUTPUT) ?? "",
        stderr: (e.stderr ?? e.message ?? "").slice(0, MAX_OUTPUT),
        code: e.code ?? 1,
        cwd,
      });
    }
  });

  // ── Git ──
  app.post("/api/vps/git", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    const action = texto((req.body as any)?.action, 50);
    const raiz = dirUsuario(u.id);
    const cwdRel = texto((req.body as any)?.cwd, 500) || "repositorios";
    try {
      let cmd = "";
      let cwd = raiz;
      let repoPath: string | undefined;

      if (action === "clone") {
        const url = texto((req.body as any)?.url, 500);
        if (!url) return erro(resposta, 400, "url_faltando", "URL do repositório necessária.");
        const repoDir = join(raiz, "repositorios");
        mkdirSync(repoDir, { recursive: true });
        cwd = repoDir;
        cmd = `git clone "${url}"`;
        const nomeRepo =
          url
            .trim()
            .replace(/\/$/, "")
            .replace(/\.git$/i, "")
            .split("/")
            .pop() || "repo";
        repoPath = `repositorios/${nomeRepo}`;
      } else {
        cwd =
          resolverSeguro(raiz, cwdRel) ??
          resolverSeguro(raiz, ".") ??
          raiz;
        if (action === "pull") cmd = "git pull";
        else if (action === "status") cmd = "git status --short";
        else if (action === "log") cmd = "git log --oneline -10";
        else return erro(resposta, 400, "acao_invalida", "Ação git inválida.");
      }

      const { stdout, stderr } = await exec(cmd, { cwd, timeout: 120_000, maxBuffer: MAX_OUTPUT });
      return resposta.send({
        cwd: cwd.slice(raiz.length + 1).replaceAll("\\", "/") || ".",
        ok: true,
        output: stdout || stderr,
        ...(repoPath ? { repoPath } : {}),
      });
    } catch (e: any) {
      return resposta.send({
        cwd: cwdRel,
        ok: false,
        output: e.stderr || e.message || "erro",
      });
    }
  });

  // ── Memória ──
  app.post("/api/vps/memory", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    const memDir = join(dirUsuario(u.id), ".memory");
    try {
      const action = texto((req.body as any)?.action, 20);
      if (action === "list") {
        const arquivos = listarArquivos(memDir).filter((f) => f.endsWith(".md"));
        return resposta.send({ files: arquivos });
      }
      if (action === "save") {
        const nome = texto((req.body as any)?.name, 100) || "nota";
        const conteudo =
          typeof (req.body as any)?.content === "string" ? (req.body as any).content : "";
        writeFileSync(join(memDir, `${nome.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`), conteudo, "utf8");
        return resposta.send({ ok: true });
      }
      if (action === "load") {
        const nome = texto((req.body as any)?.name, 100);
        const caminho = join(memDir, `${nome.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`);
        if (!existsSync(caminho))
          return erro(resposta, 404, "nao_encontrado", "Memória não encontrada.");
        return resposta.send({ content: readFileSync(caminho, "utf8") });
      }
      return erro(resposta, 400, "acao_invalida", "Ação inválida.");
    } catch (e: any) {
      return erro(resposta, 500, "erro_memoria", e.message);
    }
  });

  // ── CodingPro AI Chat ──
  app.post("/api/vps/chat", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    if (u.status !== "ativo") return erro(resposta, 403, "nao_aprovado", "Conta não aprovada.");

    const prompt = texto((req.body as any)?.prompt, 10000);
    if (!prompt) return erro(resposta, 400, "prompt_vazio", "Prompt vazio.");

    const acesso = await checarAcessoLlm(ctx, u);
    if (!acesso.ok) return erro(resposta, acesso.status, acesso.codigo, acesso.mensagem);

    const contexto = texto((req.body as any)?.contexto, 5000) || "";
    const systemPrompt = contexto
      ? `Você é o CodingPro, um assistente de código. O usuário está trabalhando no workspace com estes arquivos:\n${contexto}\n\nResponda de forma útil e direta.`
      : "Você é o CodingPro, um assistente de código. Responda de forma útil e direta.";

    const modelo = "deepseek-v4-pro" as const;
    const inicioChamada = Date.now();

    try {
      const upstream = await ctx.fetch(`${ctx.config.deepseekBaseUrl}/chat/completions`, {
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: 16384,
          reasoning_effort: "high",
        }),
        headers: {
          authorization: `Bearer ${ctx.config.deepseekApiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
      if (!upstream.ok) {
        await registrarUsoDaResposta(ctx, {
          competencia: acesso.competencia,
          duracaoMs: Date.now() - inicioChamada,
          erro: `upstream_${upstream.status}`,
          modelo,
          tokenId: null,
          usage: null,
          usuarioId: u.id,
        }).catch(() => {});
        return erro(resposta, 502, "provedor_erro", "Erro no provedor.");
      }
      const corpo = (await upstream.json()) as any;
      await registrarUsoDaResposta(ctx, {
        competencia: acesso.competencia,
        duracaoMs: Date.now() - inicioChamada,
        erro: null,
        modelo,
        tokenId: null,
        usage: corpo.usage,
        usuarioId: u.id,
      }).catch(() => {});
      const msg = corpo?.choices?.[0]?.message;
      const reply = msg?.content ?? "(sem resposta)";
      const reasoning = msg?.reasoning_content || "";
      return resposta.send({ reply, reasoning });
    } catch {
      return erro(resposta, 502, "indisponivel", "Provedor indisponível.");
    }
  });

  // ── Info do workspace ──
  app.post("/api/vps/info", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    const raiz = dirUsuario(u.id);
    const arquivos = listarArquivos(raiz);
    return resposta.send({
      arquivos: arquivos.length,
      pastas: ["Documents", "Downloads", "Projects", "repositorios", ".memory"],
      raiz,
      git: existsSync(join(raiz, ".git")),
    });
  });
}
