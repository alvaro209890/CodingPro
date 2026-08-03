/**
 * CLI streaming — spawn codingpro -p no workspace do usuario
 * e transmite stdout via SSE. Um processo por mensagem (mais confiavel que --chat).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { type Contexto, erro, exigirUsuario, texto } from "../contexto.js";
import { dirUsuario } from "../workspace.js";

const CLI =
  process.env.CODINGPRO_CLI_PATH?.trim() ||
  join(homedir(), "Documentos", "CodingPro", "packages", "cli", "dist", "index.mjs");
const NODE = process.env.CODINGPRO_NODE_BIN?.trim() || process.execPath;

export function registrarRotaCli(app: FastifyInstance, ctx: Contexto): void {
  // Executar CLI com prompt (-p mode) e streaming
  app.post("/api/vps/cli/exec", async (req, resposta) => {
    const u = await exigirUsuario(ctx, req, resposta);
    if (!u) return;
    if (u.status !== "ativo") return erro(resposta, 403, "nao_aprovado", "Conta não aprovada.");

    const prompt = texto((req.body as Record<string, unknown>)?.prompt, 10000);
    if (!prompt) return erro(resposta, 400, "prompt_vazio", "Prompt vazio.");

    const ws = dirUsuario(u.id);
    // Symlink CLI se nao existe
    const alvoCli = join(ws, "codingpro.mjs");
    if (!existsSync(alvoCli)) {
      try {
        symlinkSync(CLI, alvoCli);
      } catch {
        /* ja existe */
      }
    }
    // Credenciais
    const credDir = join(ws, ".codingpro");
    const credFile = join(credDir, "credenciais.json");
    mkdirSync(credDir, { recursive: true });
    const homeCred = join(homedir(), ".codingpro", "credenciais.json");
    if (existsSync(homeCred) && !existsSync(credFile)) {
      try {
        const { copyFileSync } = await import("node:fs");
        copyFileSync(homeCred, credFile);
      } catch {
        /* ok */
      }
    }

    resposta.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (event: string, data: string) => {
      resposta.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send("status", "Executando CodingPro...");

    const proc = spawn(NODE, [alvoCli, "-p", prompt], {
      cwd: ws,
      env: { ...process.env, HOME: ws, CODINGPRO_PROVIDER: "deepseek" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      send("stdout", chunk.toString("utf8"));
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      send("stderr", chunk.toString("utf8"));
    });

    proc.on("close", (code) => {
      send("done", `[exit ${code}]`);
      resposta.raw.end();
    });

    proc.on("error", (err) => {
      send("error", err.message);
      resposta.raw.end();
    });

    req.raw.on("close", () => proc.kill());
  });
}
