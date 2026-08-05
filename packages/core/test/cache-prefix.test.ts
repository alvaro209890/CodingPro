import { describe, expect, it } from "vitest";
import { type ChatRequest, type Provider, type ProviderEvent } from "@codingpro/llm";
import { runAgent } from "../src/agent.js";
import { ToolGate } from "../src/gate.js";
import { PermissionController } from "../src/permissions.js";
import { ToolRegistry } from "../src/registry.js";
import { SYSTEM_PROMPT_V1 } from "../src/system-prompt.js";
import type { ToolContext } from "../src/tool.js";
import { readFileTool } from "../src/tools/read-file.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

type Assistant = Extract<ProviderEvent, { type: "finish" }>["message"];

function assistant(content: string): Assistant {
  return { content, role: "assistant" };
}

function finish(message: Assistant): ProviderEvent {
  return { message, reason: "stop", type: "finish" };
}

/**
 * C7 — higiene do prefixo de cache (doc 06).
 * O cache-hit da DeepSeek (~120× mais barato) depende do prefixo da requisição ser ESTÁVEL.
 * O system prompt é o maior componente do prefixo; nada volátil (data/hora, cwd, contadores)
 * pode entrar nele. Este teste trava regressões que invalidariam o cache a cada turno/sessão.
 */
describe("C7 — prefixo de cache estável", () => {
  it("SYSTEM_PROMPT_V1 não contém nada volátil (data de hoje, cwd real do usuário)", () => {
    const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const agora = new Date().toTimeString().slice(0, 8); // HH:MM:SS
    const cwdReal = process.cwd().replace(/\\/gu, "/");
    const usuarioReal = process.env.USERNAME ?? process.env.USER;
    const volateis = [
      hoje,
      agora,
      hoje.replace(/-/gu, "/"), // DD/MM/YYYY ou YYYY/MM/DD
      cwdReal,
      ...(usuarioReal === undefined ? [] : [usuarioReal]),
    ];
    for (const v of volateis) {
      if (v.length === 0) continue;
      expect(SYSTEM_PROMPT_V1).not.toContain(v);
    }
  });

  it("duas sessões consecutivas produzem o MESMO system prompt byte a byte", async () => {
    const root = await makeTmpRoot();
    try {
      const context: ToolContext = { workspace: await Workspace.create(root) };
      const registry = new ToolRegistry().register(readFileTool);
      const gate = new ToolGate(registry, new PermissionController({ mode: "ask" }));

      const primeirosRequests: string[] = [];
      const fabricarProvider = (): Provider => {
        let chamadas = 0;
        return {
          capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
          id: "c7",
          model: "fake",
          async *stream(request: ChatRequest) {
            chamadas += 1;
            if (chamadas === 1) {
              // primeira chamada de cada sessão: guarda o prefixo completo (system + user)
              primeirosRequests.push(JSON.stringify(request.messages));
            }
            yield finish(assistant("ok"));
          },
        };
      };

      // sessão 1
      await runAgent({
        context,
        gate,
        messages: [{ content: "oi", role: "user" }],
        provider: fabricarProvider(),
      });
      // sessão 2 (mesma workspace, mensagem idêntica)
      await runAgent({
        context,
        gate,
        messages: [{ content: "oi", role: "user" }],
        provider: fabricarProvider(),
      });

      expect(primeirosRequests).toHaveLength(2);
      expect(primeirosRequests[0]).toBe(primeirosRequests[1]);
    } finally {
      await cleanup(root);
    }
  });

  it("o system prompt é SEMPRE a 1ª mensagem (posição estável no prefixo)", async () => {
    const root = await makeTmpRoot();
    try {
      const context: ToolContext = { workspace: await Workspace.create(root) };
      const registry = new ToolRegistry().register(readFileTool);
      const gate = new ToolGate(registry, new PermissionController({ mode: "ask" }));
      let primeiro: ChatRequest | undefined;
      const provider: Provider = {
        capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
        id: "c7b",
        model: "fake",
        async *stream(request: ChatRequest) {
          if (primeiro === undefined) primeiro = structuredClone(request) as ChatRequest;
          yield finish(assistant("ok"));
        },
      };
      await runAgent({
        context,
        gate,
        messages: [{ content: "oi", role: "user" }],
        provider,
      });
      expect(primeiro?.messages[0]).toEqual({ content: SYSTEM_PROMPT_V1, role: "system" });
    } finally {
      await cleanup(root);
    }
  });
});
