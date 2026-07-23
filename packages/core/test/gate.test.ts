import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolGate } from "../src/gate.js";
import { PermissionController } from "../src/permissions.js";
import { ToolRegistry } from "../src/registry.js";
import { type ExecutableTool, textResult, type ToolContext } from "../src/tool.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

function tool(name: string, sideEffect: ExecutableTool["sideEffect"]): ExecutableTool {
  return {
    definition: {
      description: `Tool ${name}.`,
      inputSchema: { additionalProperties: false, properties: {}, type: "object" },
      name,
    },
    execute: async () => textResult(`ok:${name}`),
    sideEffect,
  };
}

describe("ToolGate", () => {
  let root: string;
  let context: ToolContext;
  let registry: ToolRegistry;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
    registry = new ToolRegistry();
    registry.register(tool("read_thing", "read")).register(tool("write_thing", "write"));
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("devolve erro para tool desconhecida", async () => {
    const gate = new ToolGate(registry, new PermissionController({ mode: "auto" }));
    expect(await gate.run("nao_existe", {}, context)).toMatchObject({ type: "error-text" });
  });

  it("executa tool de leitura sem aprovação", async () => {
    const gate = new ToolGate(registry, new PermissionController({ mode: "ask" }));
    expect(await gate.run("read_thing", {}, context)).toEqual(textResult("ok:read_thing"));
  });

  it("nega efeito sem aprovador e devolve execution-denied", async () => {
    const gate = new ToolGate(registry, new PermissionController({ mode: "ask" }));
    expect(await gate.run("write_thing", {}, context)).toMatchObject({
      type: "execution-denied",
    });
  });

  it("executa efeito quando o aprovador autoriza", async () => {
    const controller = new PermissionController(
      { mode: "ask" },
      { request: async () => "approve-once" },
    );
    const gate = new ToolGate(registry, controller);
    expect(await gate.run("write_thing", {}, context)).toEqual(textResult("ok:write_thing"));
  });

  it("hook pre-tool que veta bloqueia a execução antes da permissão", async () => {
    let executouDepois = false;
    const hooks = {
      antes: async () => ({ allow: false, reason: "vetado pelo hook" }),
      depois: async () => {
        executouDepois = true;
      },
    };
    const gate = new ToolGate(registry, new PermissionController({ mode: "auto" }), hooks);
    const r = await gate.run("read_thing", {}, context);
    expect(r).toMatchObject({ type: "execution-denied", reason: "vetado pelo hook" });
    expect(executouDepois).toBe(false);
  });

  it("hook depois roda após execução liberada", async () => {
    const chamadas: string[] = [];
    const hooks = {
      antes: async () => ({ allow: true }),
      depois: async (nome: string) => {
        chamadas.push(nome);
      },
    };
    const gate = new ToolGate(registry, new PermissionController({ mode: "auto" }), hooks);
    expect(await gate.run("read_thing", {}, context)).toEqual(textResult("ok:read_thing"));
    expect(chamadas).toEqual(["read_thing"]);
  });
});
