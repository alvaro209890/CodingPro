import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderEvent } from "@codingpro/llm";
import { describe, expect, it, vi } from "vitest";
import { criarProviderRuntime, type ProviderRuntimeContext } from "../src/provider-runtime.js";

async function runtimeContext(
  directory: string,
  environment: ProviderRuntimeContext["environment"],
): Promise<ProviderRuntimeContext> {
  const homeDirectory = join(directory, "home");
  const cwd = join(directory, "projeto");
  await Promise.all([mkdir(homeDirectory, { recursive: true }), mkdir(cwd, { recursive: true })]);
  return { cwd, environment, flags: {}, homeDirectory };
}

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

      const context = await runtimeContext(directory, {
        CODINGPRO_PROVIDER: "replay",
        CODINGPRO_REPLAY_FILE: path,
        DEEPSEEK_API_KEY: "canario-que-nao-pode-ser-usado",
      });
      const provider = await criarProviderRuntime(context);

      expect(provider.id).toBe("replay");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("projeto replay vence DeepSeek global e usa snapshot sem reabrir a fixture", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-runtime-"));
    try {
      const context = await runtimeContext(directory, {});
      const globalConfig = join(context.homeDirectory, ".codingpro");
      const projectConfig = join(context.cwd, ".codingpro");
      await Promise.all([
        mkdir(globalConfig, { mode: 0o700 }),
        mkdir(projectConfig, { mode: 0o700 }),
      ]);
      await writeFile(join(globalConfig, "settings.json"), '{ "provider": "deepseek" }', {
        mode: 0o600,
      });
      const fixture = join(context.cwd, "project.jsonl");
      await writeFile(
        fixture,
        `${JSON.stringify({
          events: [
            { text: "ok", type: "text-delta" },
            { message: { content: "ok", role: "assistant" }, reason: "stop", type: "finish" },
          ],
          request: { messages: [{ content: "teste", role: "user" }] },
        })}\n`,
      );
      await writeFile(
        join(projectConfig, "settings.json"),
        '{ "provider": "replay", "replay": { "file": "project.jsonl" } }',
        { mode: 0o644 },
      );

      const provider = await criarProviderRuntime(context);
      await rm(fixture);
      const events: ProviderEvent[] = [];
      for await (const event of provider.stream({
        messages: [{ content: "teste", role: "user" }],
      })) {
        events.push(event);
      }

      expect(provider.id).toBe("replay");
      expect(events).toContainEqual({ text: "ok", type: "text-delta" });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it.each([
    { environment: {}, message: "Selecione" },
    { environment: { CODINGPRO_PROVIDER: "replay" }, message: "replay.file" },
    {
      environment: { CODINGPRO_PROVIDER: "replay", CODINGPRO_REPLAY_FILE: "   " },
      message: "CODINGPRO_REPLAY_FILE",
    },
  ])("rejeita configuração incompleta", async ({ environment, message }) => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-runtime-"));
    try {
      await expect(
        criarProviderRuntime(await runtimeContext(directory, environment)),
      ).rejects.toMatchObject({
        safeMessage: expect.stringContaining(message),
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("respeita cancelamento antes de carregar o replay", async () => {
    const controller = new AbortController();
    controller.abort();

    const directory = await mkdtemp(join(tmpdir(), "codingpro-runtime-"));
    try {
      const context = await runtimeContext(directory, {
        CODINGPRO_PROVIDER: "replay",
        CODINGPRO_REPLAY_FILE: "/fixture/que/não-será-lida",
      });
      await expect(criarProviderRuntime(context, controller.signal)).rejects.toMatchObject({
        name: "AbortError",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("respeita cancelamento depois da configuração e antes de criar o provider", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-runtime-"));
    const controller = new AbortController();
    const throwIfAborted = controller.signal.throwIfAborted.bind(controller.signal);
    let checks = 0;
    vi.spyOn(controller.signal, "throwIfAborted").mockImplementation(() => {
      checks += 1;
      if (checks === 12) {
        controller.abort();
      }
      throwIfAborted();
    });

    try {
      const context = await runtimeContext(directory, { CODINGPRO_PROVIDER: "deepseek" });
      await expect(criarProviderRuntime(context, controller.signal)).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(checks).toBe(12);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("cria DeepSeek somente quando selecionado explicitamente (auto→Flash)", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-runtime-"));
    const provider = await criarProviderRuntime(
      await runtimeContext(directory, {
        CODINGPRO_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: "chave-sintetica",
      }),
    );

    expect(provider).toMatchObject({ id: "deepseek", model: "deepseek-v4-flash" });
    await rm(directory, { force: true, recursive: true });
  });

  it.each([
    { role: "auto" as const, model: "deepseek-v4-flash" },
    { role: "main" as const, model: "deepseek-v4-flash" },
    { role: "fast" as const, model: "deepseek-v4-flash" },
  ])("runtime DeepSeek com role $role → $model", async ({ role, model }) => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-runtime-"));
    try {
      const context = await runtimeContext(directory, {
        CODINGPRO_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: "chave-sintetica",
      });
      const provider = await criarProviderRuntime({ ...context, role });
      expect(provider).toMatchObject({ id: "deepseek", model });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejeita papel inválido no runtime sem vazar a chave", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codingpro-runtime-"));
    const chave = "chave-que-nao-pode-vazar";
    try {
      const context = await runtimeContext(directory, {
        CODINGPRO_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: chave,
      });
      await expect(
        criarProviderRuntime({ ...context, role: "turbo" as never }),
      ).rejects.toMatchObject({
        code: "not-configured",
        safeMessage: expect.stringContaining("papel"),
      });
      try {
        await criarProviderRuntime({ ...context, role: "turbo" as never });
      } catch (error) {
        expect(String(error)).not.toContain(chave);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it.each([undefined, "", "   ", "chave\nmaliciosa"])(
    "rejeita chave DeepSeek ausente ou inválida",
    async (apiKey) => {
      const directory = await mkdtemp(join(tmpdir(), "codingpro-runtime-"));
      try {
        await expect(
          criarProviderRuntime(
            await runtimeContext(directory, {
              CODINGPRO_PROVIDER: "deepseek",
              DEEPSEEK_API_KEY: apiKey,
            }),
          ),
        ).rejects.toMatchObject({
          code: "not-configured",
          safeMessage: expect.stringContaining("DeepSeek"),
        });
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    },
  );
});
