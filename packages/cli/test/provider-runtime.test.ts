import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { criarProviderRuntime } from "../src/provider-runtime.js";

describe("criarProviderRuntime", () => {
  it("carrega replay explicitamente sem usar chaves presentes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-runtime-"));
    const path = join(directory, "replay.jsonl");
    try {
      await writeFile(
        path,
        `${JSON.stringify({
          events: [
            { text: "ok", type: "text-delta" },
            { message: { content: "ok", role: "assistant" }, reason: "stop", type: "finish" },
          ],
          request: { messages: [{ content: "teste", role: "user" }] },
        })}\n`,
        "utf8",
      );

      const provider = await criarProviderRuntime({
        CODINGPRO_PROVIDER: "replay",
        CODINGPRO_REPLAY_FILE: path,
        DEEPSEEK_API_KEY: "canario-que-nao-pode-ser-usado",
      });

      expect(provider.id).toBe("replay");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it.each([
    { environment: {}, message: "Nenhum provider real" },
    { environment: { CODINGPRO_PROVIDER: "replay" }, message: "CODINGPRO_REPLAY_FILE" },
    {
      environment: { CODINGPRO_PROVIDER: "replay", CODINGPRO_REPLAY_FILE: "   " },
      message: "CODINGPRO_REPLAY_FILE",
    },
  ])("rejeita configuração incompleta", async ({ environment, message }) => {
    await expect(criarProviderRuntime(environment)).rejects.toMatchObject({
      code: "not-configured",
      safeMessage: expect.stringContaining(message),
    });
  });

  it("respeita cancelamento antes de carregar o replay", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      criarProviderRuntime(
        { CODINGPRO_PROVIDER: "replay", CODINGPRO_REPLAY_FILE: "/fixture/que/não-será-lida" },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
