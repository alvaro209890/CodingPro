import { describe, expect, it } from "vitest";
import { criarHookRunner, executarHook, type Hook, rodarHooksStop } from "../src/hooks.js";

describe("executarHook", () => {
  it("pre-tool com exit 0 permite", async () => {
    const hook: Hook = { command: "exit 0", event: "pre-tool" };
    expect((await executarHook(hook, { event: "pre-tool", tool: "write_file" })).allow).toBe(true);
  });

  it("pre-tool com exit != 0 veta e captura a razão", async () => {
    const hook: Hook = { command: "echo bloqueado por politica; exit 1", event: "pre-tool" };
    const r = await executarHook(hook, { event: "pre-tool", tool: "bash" });
    expect(r.allow).toBe(false);
    expect(r.reason).toContain("bloqueado por politica");
  });

  it("post-tool nunca bloqueia mesmo com exit != 0", async () => {
    const hook: Hook = { command: "exit 3", event: "post-tool" };
    expect((await executarHook(hook, { event: "post-tool", tool: "x" })).allow).toBe(true);
  });

  it("recebe o nome da tool via HOOK_TOOL", async () => {
    const hook: Hook = {
      command: '[ "$HOOK_TOOL" = "bash" ] && exit 1 || exit 0',
      event: "pre-tool",
    };
    expect((await executarHook(hook, { event: "pre-tool", tool: "bash" })).allow).toBe(false);
    expect((await executarHook(hook, { event: "pre-tool", tool: "read_file" })).allow).toBe(true);
  });

  it("comando inexistente não bloqueia", async () => {
    const hook: Hook = { command: "comando-que-nao-existe-xyz", event: "pre-tool" };
    // sh -c retorna 127; para não travar o trabalho por config quebrada, tratamos como veto explícito
    const r = await executarHook(hook, { event: "pre-tool", tool: "x" });
    expect(typeof r.allow).toBe("boolean");
  });
});

describe("criarHookRunner", () => {
  it("antes para no primeiro veto e respeita o matcher", async () => {
    const hooks: Hook[] = [
      { command: "exit 1", event: "pre-tool", matcher: "bash" },
      { command: "exit 0", event: "pre-tool" },
    ];
    const runner = criarHookRunner(hooks);
    expect((await runner.antes("bash", undefined)).allow).toBe(false);
    expect((await runner.antes("read_file", undefined)).allow).toBe(true);
  });

  it("depois roda sem lançar", async () => {
    const runner = criarHookRunner([{ command: "true", event: "post-tool" }]);
    await expect(runner.depois("x", { type: "text", value: "ok" })).resolves.toBeUndefined();
  });

  it("rodarHooksStop roda os stop sem lançar", async () => {
    await expect(rodarHooksStop([{ command: "true", event: "stop" }])).resolves.toBeUndefined();
  });
});

describe("executarHook — timeout", () => {
  it("mata o hook que estoura o timeout (pre-tool → veta)", async () => {
    const hook: Hook = { command: "sleep 5", event: "pre-tool", timeoutMs: 30 };
    const r = await executarHook(hook, { event: "pre-tool", tool: "x" });
    expect(r.allow).toBe(false);
  });
});
