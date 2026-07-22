import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BASH_MAX_COMMAND_LENGTH, bashTool } from "../src/tools/bash.js";
import type { ToolContext } from "../src/tool.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

function text(result: { type: string; value?: unknown }): string {
  expect(result.type).toBe("text");
  return result.value as string;
}

describe("bash", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("executa um comando e captura stdout com código 0", async () => {
    const out = text(await bashTool.execute({ command: "echo alo" }, context));
    expect(out).toContain("[código 0]");
    expect(out).toContain("alo");
  });

  it("reporta código de saída diferente de zero e stderr", async () => {
    const out = text(await bashTool.execute({ command: "echo falha >&2; exit 3" }, context));
    expect(out).toContain("[código 3]");
    expect(out).toContain("[stderr]");
    expect(out).toContain("falha");
  });

  it("roda na raiz do projeto", async () => {
    const out = text(await bashTool.execute({ command: "pwd" }, context));
    expect(out).toContain(context.workspace.root);
  });

  it("expõe só um ambiente mínimo, sem segredos", async () => {
    process.env.CODINGPRO_TEST_SECRET = "nao-vaze";
    try {
      const out = text(
        await bashTool.execute(
          { command: 'printf "PATH=%s SECRET=[%s]" "${PATH:+set}" "${CODINGPRO_TEST_SECRET-}"' },
          context,
        ),
      );
      expect(out).toContain("PATH=set");
      expect(out).toContain("SECRET=[]");
    } finally {
      delete process.env.CODINGPRO_TEST_SECRET;
    }
  });

  it("mata o comando ao estourar o tempo", async () => {
    const started = Date.now();
    const out = text(await bashTool.execute({ command: "sleep 5", timeoutMs: 300 }, context));
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(out).toContain("[tempo esgotado]");
  });

  it("cancela quando o sinal é abortado durante a execução", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const out = text(
      await bashTool.execute({ command: "sleep 5" }, { ...context, signal: controller.signal }),
    );
    expect(out).toContain("[cancelado]");
  });

  it("recusa antes de rodar quando o sinal já está abortado", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      bashTool.execute({ command: "echo x" }, { ...context, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("reporta término por sinal", async () => {
    const out = text(await bashTool.execute({ command: "kill -TERM $$" }, context));
    expect(out).toContain("[sinal SIGTERM]");
  });

  it("trunca saídas enormes", async () => {
    const out = text(
      await bashTool.execute({ command: "yes abcdefghij | head -c 300000" }, context),
    );
    expect(out.length).toBeLessThan(150_000);
  });

  it("normaliza CR e remove caracteres de controle", async () => {
    const out = text(await bashTool.execute({ command: "printf 'a\\rb\\tc'" }, context));
    expect(out).not.toContain("\r");
    expect(out).toContain("a\nb\tc");
  });

  it("recusa comando vazio ou longo demais", async () => {
    await expect(bashTool.execute({ command: "   " }, context)).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(
      bashTool.execute({ command: "a".repeat(BASH_MAX_COMMAND_LENGTH + 1) }, context),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("falha controlada quando o diretório de trabalho some", async () => {
    const gone = await makeTmpRoot();
    const goneContext: ToolContext = { workspace: await Workspace.create(gone) };
    await cleanup(gone);
    await expect(bashTool.execute({ command: "echo x" }, goneContext)).rejects.toMatchObject({
      code: "execution-failed",
    });
  });
});
