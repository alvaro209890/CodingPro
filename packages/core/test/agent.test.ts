import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatRequest, Provider, ProviderEvent, ToolCall, TokenUsage } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AgentEvent, runAgent } from "../src/agent.js";
import { ToolGate } from "../src/gate.js";
import { PermissionController } from "../src/permissions.js";
import { ToolRegistry } from "../src/registry.js";
import { SYSTEM_PROMPT_V1 } from "../src/system-prompt.js";
import type { ToolContext } from "../src/tool.js";
import { readFileTool } from "../src/tools/read-file.js";
import { writeFileTool } from "../src/tools/write-file.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

type Assistant = Extract<ProviderEvent, { type: "finish" }>["message"];

function assistant(content: string, toolCalls?: readonly ToolCall[]): Assistant {
  return { content, role: "assistant", ...(toolCalls === undefined ? {} : { toolCalls }) };
}

function finish(message: Assistant, usage?: TokenUsage): ProviderEvent {
  const reason = message.toolCalls === undefined ? "stop" : "tool-calls";
  return { message, reason, type: "finish", ...(usage === undefined ? {} : { usage }) };
}

function scripted(turns: readonly (readonly ProviderEvent[])[]): {
  provider: Provider;
  requests: ChatRequest[];
} {
  const requests: ChatRequest[] = [];
  let index = 0;
  const provider: Provider = {
    capabilities: { cacheUsage: true, reasoning: "effort", streaming: true, tools: true },
    id: "fake",
    model: "fake",
    async *stream(request, options) {
      options?.signal?.throwIfAborted();
      requests.push(structuredClone(request) as ChatRequest);
      const turn = turns[index];
      index += 1;
      if (turn === undefined) {
        throw new Error("roteiro sem turno");
      }
      for (const event of turn) {
        options?.signal?.throwIfAborted();
        yield event;
      }
    },
  };
  return { provider, requests };
}

describe("runAgent", () => {
  let root: string;
  let context: ToolContext;
  let gate: ToolGate;
  let registry: ToolRegistry;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
    registry = new ToolRegistry();
    registry.register(readFileTool).register(writeFileTool);
    gate = new ToolGate(registry, new PermissionController({ mode: "ask" }));
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("resolve um turno único sem ferramentas e prefixa o system prompt", async () => {
    const { provider, requests } = scripted([
      [{ text: "olá", type: "text-delta" }, finish(assistant("olá"))],
    ]);
    const events: AgentEvent[] = [];
    const result = await runAgent({
      context,
      gate,
      messages: [{ content: "oi", role: "user" }],
      onEvent: (event) => events.push(event),
      provider,
    });

    expect(result.finishReason).toBe("stop");
    expect(result.steps).toBe(1);
    expect(result.messages[0]).toEqual({ content: SYSTEM_PROMPT_V1, role: "system" });
    expect(result.messages.at(-1)).toEqual(assistant("olá"));
    expect(requests[0]?.tools).toBeUndefined();
    expect(events.map((event) => event.type)).toEqual(["text-delta", "step"]);
  });

  it("executa a ferramenta pedida e realimenta o resultado até a resposta final", async () => {
    await writeFile(join(root, "a.txt"), "conteúdo do arquivo");
    const call: ToolCall = { id: "call-1", input: { path: "a.txt" }, name: "read_file" };
    const { provider, requests } = scripted([
      [{ call, type: "tool-call" }, finish(assistant("", [call]))],
      [finish(assistant("o arquivo diz: conteúdo do arquivo"))],
    ]);
    const events: AgentEvent[] = [];
    const result = await runAgent({
      context,
      gate,
      messages: [{ content: "o que tem em a.txt?", role: "user" }],
      onEvent: (event) => events.push(event),
      provider,
      tools: registry.definitions(),
    });

    expect(result.finishReason).toBe("stop");
    expect(result.steps).toBe(2);
    const toolMessage = result.messages.find((message) => message.role === "tool");
    expect(toolMessage).toEqual({
      result: { type: "text", value: "conteúdo do arquivo" },
      role: "tool",
      toolCallId: "call-1",
      toolName: "read_file",
    });
    // O segundo pedido carrega a mensagem do assistant + o resultado da ferramenta.
    expect(requests[1]?.messages.some((message) => message.role === "tool")).toBe(true);
    expect(requests[1]?.tools).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual(["tool-call", "step", "tool-result", "step"]);
  });

  it("nega efeito sem aprovação e devolve execution-denied como resultado", async () => {
    const call: ToolCall = {
      id: "w1",
      input: { content: "x", path: "novo.txt" },
      name: "write_file",
    };
    const { provider } = scripted([
      [finish(assistant("", [call]))],
      [finish(assistant("não pude escrever"))],
    ]);
    const results: AgentEvent[] = [];
    const result = await runAgent({
      context,
      gate,
      messages: [{ content: "crie novo.txt", role: "user" }],
      onEvent: (event) => results.push(event),
      provider,
      tools: registry.definitions(),
    });

    const toolMessage = result.messages.find((message) => message.role === "tool");
    expect(toolMessage?.result).toMatchObject({ type: "execution-denied" });
  });

  it("para no teto de passos quando o modelo insiste em ferramentas", async () => {
    await writeFile(join(root, "a.txt"), "x");
    const call: ToolCall = { id: "c", input: { path: "a.txt" }, name: "read_file" };
    const { provider } = scripted([
      [finish(assistant("", [call]))],
      [finish(assistant("", [call]))],
      [finish(assistant("nunca chega aqui"))],
    ]);
    const result = await runAgent({
      context,
      gate,
      maxSteps: 2,
      messages: [{ content: "leia sem parar", role: "user" }],
      provider,
      tools: registry.definitions(),
    });

    expect(result.finishReason).toBe("max-steps");
    expect(result.steps).toBe(2);
  });

  it("agrega o uso de tokens entre os turnos", async () => {
    await writeFile(join(root, "a.txt"), "x");
    const call: ToolCall = { id: "c", input: { path: "a.txt" }, name: "read_file" };
    const { provider } = scripted([
      [
        finish(assistant("", [call]), {
          cacheReadInputTokens: 3,
          inputTokens: 10,
          outputTokens: 5,
          reasoningTokens: 2,
        }),
      ],
      [finish(assistant("pronto"), { inputTokens: 20, outputTokens: 8 })],
    ]);
    const result = await runAgent({
      context,
      gate,
      messages: [{ content: "leia", role: "user" }],
      provider,
      tools: registry.definitions(),
    });

    expect(result.usage).toEqual({
      cacheReadInputTokens: 3,
      inputTokens: 30,
      outputTokens: 13,
      reasoningTokens: 2,
    });
  });

  it("aceita system prompt customizado e maxSteps inválido cai no padrão", async () => {
    const { provider } = scripted([[finish(assistant("ok"))]]);
    const result = await runAgent({
      context,
      gate,
      maxSteps: 0,
      messages: [{ content: "oi", role: "user" }],
      provider,
      systemPrompt: "PROMPT CUSTOMIZADO",
    });
    expect(result.messages[0]).toEqual({ content: "PROMPT CUSTOMIZADO", role: "system" });
    expect(result.steps).toBe(1);
  });

  it("emite reasoning-delta e rejeita dados após o finish", async () => {
    const withReasoning = scripted([
      [{ text: "pensando", type: "reasoning-delta" }, finish(assistant("ok"))],
    ]);
    const events: AgentEvent[] = [];
    await runAgent({
      context,
      gate,
      messages: [{ content: "oi", role: "user" }],
      onEvent: (event) => events.push(event),
      provider: withReasoning.provider,
    });
    expect(events.some((event) => event.type === "reasoning-delta")).toBe(true);

    const afterFinish = scripted([
      [finish(assistant("ok")), { text: "extra", type: "text-delta" }],
    ]);
    await expect(
      runAgent({
        context,
        gate,
        messages: [{ content: "oi", role: "user" }],
        provider: afterFinish.provider,
      }),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("falha quando o provider termina sem finalizar", async () => {
    const { provider } = scripted([[{ text: "sem fim", type: "text-delta" }]]);
    await expect(
      runAgent({ context, gate, messages: [{ content: "oi", role: "user" }], provider }),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("não duplica o system prompt ao retomar um transcrito", async () => {
    const { provider, requests } = scripted([[finish(assistant("continuando"))]]);
    const result = await runAgent({
      context,
      gate,
      messages: [
        { content: "SISTEMA RETOMADO", role: "system" },
        { content: "pergunta antiga", role: "user" },
        { content: "resposta antiga", role: "assistant" },
        { content: "e agora?", role: "user" },
      ],
      provider,
    });
    const systemCount = result.messages.filter((message) => message.role === "system").length;
    expect(systemCount).toBe(1);
    expect(result.messages[0]).toEqual({ content: "SISTEMA RETOMADO", role: "system" });
    expect(requests[0]?.messages[0]).toEqual({ content: "SISTEMA RETOMADO", role: "system" });
  });

  it("aborta antes de chamar o provider quando o sinal já está abortado", async () => {
    const provider = scripted([[finish(assistant("ok"))]]);
    const spy = vi.spyOn(provider.provider, "stream");
    const controller = new AbortController();
    controller.abort();
    await expect(
      runAgent({
        context,
        gate,
        messages: [{ content: "oi", role: "user" }],
        provider: provider.provider,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
