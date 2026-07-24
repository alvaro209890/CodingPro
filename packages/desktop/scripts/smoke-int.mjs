/**
 * Smoke de integração do desktop (sem GUI): sessão + comando local + 1 turno DeepSeek read-only.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALL_TOOLS,
  CheckpointStore,
  createReadTracker,
  isNodeSqliteDisponivel,
  MEMORY_TOOL_NAMES,
  MemoryStore,
  newSessionId,
  PermissionController,
  runAgent,
  SessionStore,
  SYSTEM_PROMPT_V1,
  ToolGate,
  ToolRegistry,
  Workspace,
} from "@codingpro/core";
import { DeepSeekProvider } from "@codingpro/llm";

function loadKey() {
  if (process.env.DEEPSEEK_API_KEY?.trim()) return process.env.DEEPSEEK_API_KEY.trim();
  const paths = [
    join(process.cwd(), ".codingpro", ".env"),
    join(homedir(), ".config", "codingpro", "deepseek.env"),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/^DEEPSEEK_API_KEY=(.+)$/m);
    if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const tmp = mkdtempSync(join(tmpdir(), "cpro-desktop-int-"));
writeFileSync(join(tmp, "ola.txt"), "hello codingpro\n", "utf8");

try {
  console.log("sqlite_disponivel=", isNodeSqliteDisponivel());
  const workspace = await Workspace.create(tmp);
  const registry = new ToolRegistry();
  const sqliteOk = isNodeSqliteDisponivel();
  for (const tool of ALL_TOOLS) {
    if (!sqliteOk && tool.definition.name === "code_search") continue;
    registry.register(tool);
  }

  const gate = new ToolGate(
    registry,
    new PermissionController(
      { alwaysAllow: MEMORY_TOOL_NAMES, mode: "ask" },
      {
        async request(req) {
          console.log("permission_asked", req.toolName);
          return "deny"; // efeitos negados — só leitura neste smoke
        },
      },
    ),
  );

  const store = await SessionStore.create(join(tmp, ".codingpro", "sessions"));
  const checkpoints = await CheckpointStore.create(
    join(tmp, ".codingpro", "checkpoints"),
    workspace,
  );
  const readTracker = createReadTracker();
  const sessionId = newSessionId();
  let transcript = [];

  // comando local simulado
  transcript.push({ role: "user", content: "/ajuda" }, { role: "assistant", content: "ajuda ok" });
  await store.save(sessionId, transcript);
  console.log("session_saved", sessionId);

  const key = loadKey();
  if (!key) {
    console.log("SKIP_LLM no key");
    console.log("SMOKE_INT_OK_PARTIAL");
    process.exit(0);
  }

  const provider = new DeepSeekProvider({ apiKey: key });
  const prompt =
    "Liste os arquivos do diretório atual com a tool list_dir. Responda só com os nomes, em pt-BR, sem editar nada.";
  transcript = [{ role: "user", content: prompt }];
  checkpoints.begin(prompt.slice(0, 40));

  let text = "";
  let tools = 0;
  const result = await runAgent({
    context: {
      workspace,
      readTracker,
      checkpoints,
      memory: {
        global: MemoryStore.create(join(tmp, "mem-g")),
        projeto: MemoryStore.create(join(tmp, "mem-p")),
      },
    },
    gate,
    messages: transcript,
    provider,
    tools: registry.definitions(),
    systemPrompt: SYSTEM_PROMPT_V1,
    maxSteps: 6,
    onEvent: (ev) => {
      if (ev.type === "text-delta") text += ev.text;
      if (ev.type === "tool-call") {
        tools += 1;
        console.log("tool_call", ev.call.name);
      }
    },
  });

  await checkpoints.commit();
  const msgs = result.messages;
  transcript = msgs[0]?.role === "system" ? msgs.slice(1) : [...msgs];
  await store.save(sessionId, transcript);

  console.log("steps", result.steps, "tools", tools, "finish", result.finishReason);
  console.log("text_sample", text.slice(0, 200).replaceAll("\n", " "));
  if (tools < 1) {
    throw new Error("esperava ao menos 1 tool call");
  }
  console.log("SMOKE_INT_OK");
} catch (e) {
  console.error("SMOKE_INT_FAIL", e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
