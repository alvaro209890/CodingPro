import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Approval,
  type Approver,
  decidePermission,
  deniedResult,
  PermissionController,
  type PermissionPolicy,
  type PermissionRequest,
} from "../src/permissions.js";
import type { ToolContext } from "../src/tool.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

const write: PermissionRequest = { sideEffect: "write", toolName: "write_file" };
const read: PermissionRequest = { sideEffect: "read", toolName: "read_file" };

function approver(result: Approval): Approver {
  return { request: vi.fn(async () => result) };
}

describe("decidePermission", () => {
  it("nega o que está na denylist, mesmo leitura", () => {
    const policy: PermissionPolicy = { denylist: ["read_file"], mode: "auto" };
    expect(decidePermission(policy, read)).toBe("deny");
  });

  it("sempre libera leitura fora da denylist", () => {
    expect(decidePermission({ mode: "ask" }, read)).toBe("allow");
  });

  it("exige aprovação para efeito enquanto não há checkpoint", () => {
    expect(decidePermission({ mode: "auto" }, write)).toBe("ask");
  });

  it("com checkpoint, respeita o modo", () => {
    const base = { checkpointAvailable: true } as const;
    expect(decidePermission({ ...base, mode: "auto" }, write)).toBe("allow");
    expect(decidePermission({ ...base, mode: "ask" }, write)).toBe("ask");
    expect(decidePermission({ ...base, allowlist: ["write_file"], mode: "allowlist" }, write)).toBe(
      "allow",
    );
    expect(decidePermission({ ...base, allowlist: [], mode: "allowlist" }, write)).toBe("ask");
  });
});

describe("PermissionController", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("libera leitura sem consultar o aprovador", async () => {
    const spy = approver("deny");
    const controller = new PermissionController({ mode: "ask" }, spy);
    expect(await controller.authorize(read, context)).toBe(true);
    expect(spy.request).not.toHaveBeenCalled();
  });

  it("nega decisão deny sem consultar o aprovador", async () => {
    const spy = approver("approve-always");
    const controller = new PermissionController({ denylist: ["write_file"], mode: "auto" }, spy);
    expect(await controller.authorize(write, context)).toBe(false);
    expect(spy.request).not.toHaveBeenCalled();
  });

  it("nega quando é ask e não há aprovador", async () => {
    const controller = new PermissionController({ mode: "ask" });
    expect(await controller.authorize(write, context)).toBe(false);
  });

  it("approve-once autoriza mas não memoriza", async () => {
    const spy = approver("approve-once");
    const controller = new PermissionController({ mode: "ask" }, spy);
    expect(await controller.authorize(write, context)).toBe(true);
    expect(await controller.authorize(write, context)).toBe(true);
    expect(spy.request).toHaveBeenCalledTimes(2);
  });

  it("approve-always memoriza para o resto da sessão", async () => {
    const spy = approver("approve-always");
    const controller = new PermissionController({ mode: "ask" }, spy);
    expect(await controller.authorize(write, context)).toBe(true);
    expect(await controller.authorize(write, context)).toBe(true);
    expect(spy.request).toHaveBeenCalledTimes(1);
  });

  it("deny do aprovador nega", async () => {
    const spy = approver("deny");
    const controller = new PermissionController({ mode: "ask" }, spy);
    expect(await controller.authorize(write, context)).toBe(false);
  });
});

describe("deniedResult", () => {
  it("produz um execution-denied com motivo", () => {
    expect(deniedResult("bash")).toMatchObject({ type: "execution-denied" });
  });
});
