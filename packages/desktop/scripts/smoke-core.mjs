/**
 * Smoke headless do main process (sem UI): valida sessão, comandos locais e terminal.
 * Roda sob ELECTRON_RUN_AS_NODE=1? Não — usa APIs do core diretamente espelhando o main.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALL_TOOLS,
  CheckpointStore,
  createReadTracker,
  MEMORY_TOOL_NAMES,
  MemoryStore,
  newSessionId,
  PermissionController,
  SessionStore,
  ToolGate,
  ToolRegistry,
  Workspace,
} from "@codingpro/core";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const tmp = mkdtempSync(join(tmpdir(), "cpro-desktop-smoke-"));
console.log("tmp", tmp);

try {
  const workspace = await Workspace.create(tmp);
  const registry = new ToolRegistry();
  for (const t of ALL_TOOLS) registry.register(t);

  const approver = {
    async request() {
      return "deny";
    },
  };
  const gate = new ToolGate(
    registry,
    new PermissionController({ alwaysAllow: MEMORY_TOOL_NAMES, mode: "ask" }, approver),
  );
  assert(gate !== undefined, "gate");

  const store = await SessionStore.create(join(tmp, ".codingpro", "sessions"));
  const id = newSessionId();
  await store.save(id, [
    { role: "user", content: "/ajuda" },
    { role: "assistant", content: "ok" },
  ]);
  const loaded = await store.load(id);
  assert(loaded.length === 2, "session load");

  const cps = await CheckpointStore.create(join(tmp, ".codingpro", "checkpoints"), workspace);
  cps.begin("teste");
  const committed = await cps.commit();
  assert(committed === undefined, "commit vazio sem writes");

  const tracker = createReadTracker();
  tracker.markRead("a.ts");
  assert(tracker.wasRead("a.ts"), "read tracker");

  MemoryStore.create(join(tmp, "mem"));

  // API key presente no monorepo
  const envPath = join(process.cwd(), ".codingpro", ".env");
  assert(existsSync(envPath), ".codingpro/.env existe");
  const hasKey = /^DEEPSEEK_API_KEY=.+/m.test(readFileSync(envPath, "utf8"));
  assert(hasKey, "DEEPSEEK_API_KEY no .env");

  console.log("SMOKE_OK");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
