import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendDesktopDiagnostic, DESKTOP_DIAGNOSTICS_FILE } from "../src/main/diagnostics.js";

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { force: true, recursive: true });
  root = undefined;
});

describe("diagnóstico local do desktop", () => {
  it("grava JSONL seguro sem prompt nem quebra de linha na mensagem", async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-diagnostics-"));
    appendDesktopDiagnostic(
      root,
      {
        code: "AGENT_ERROR",
        event: "run-failed",
        message: "tempo\nlimite",
        runId: "run-1",
        sessionId: "sessao-1",
        workspace: "C:\\projeto",
      },
      new Date("2026-08-04T13:00:00.000Z"),
    );

    const raw = await readFile(join(root, DESKTOP_DIAGNOSTICS_FILE), "utf8");
    const parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      code: "AGENT_ERROR",
      event: "run-failed",
      message: "tempo limite",
      runId: "run-1",
      timestamp: "2026-08-04T13:00:00.000Z",
    });
    expect(raw).not.toContain("prompt");
  });
});
