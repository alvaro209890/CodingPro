import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { GREP_MAX_FILE_BYTES, GREP_MAX_PATTERN, grepTool } from "../src/tools/grep.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

interface GrepValue {
  readonly matches: readonly {
    readonly file: string;
    readonly line: number;
    readonly text: string;
  }[];
  readonly truncated: boolean;
}

function value(result: { type: string; value?: unknown }): GrepValue {
  expect(result.type).toBe("json");
  return result.value as GrepValue;
}

describe("grep", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("acha ocorrências literais com arquivo e número de linha", async () => {
    await writeFile(join(root, "a.txt"), "alfa\nbeta TARGET\ngama");
    await mkdir(join(root, "sub"));
    await writeFile(join(root, "sub", "b.txt"), "TARGET no topo\noutra");
    const found = value(await grepTool.execute({ pattern: "TARGET" }, context));
    expect(found.truncated).toBe(false);
    expect(found.matches).toEqual([
      { file: "a.txt", line: 2, text: "beta TARGET" },
      { file: join("sub", "b.txt"), line: 1, text: "TARGET no topo" },
    ]);
  });

  it("respeita ignoreCase", async () => {
    await writeFile(join(root, "a.txt"), "Erro Fatal");
    expect(value(await grepTool.execute({ pattern: "erro" }, context)).matches).toHaveLength(0);
    expect(
      value(await grepTool.execute({ ignoreCase: true, pattern: "erro" }, context)).matches,
    ).toHaveLength(1);
  });

  it("trunca ao atingir maxResults", async () => {
    await writeFile(join(root, "a.txt"), "x\nx\nx\nx");
    const found = value(await grepTool.execute({ maxResults: 2, pattern: "x" }, context));
    expect(found.matches).toHaveLength(2);
    expect(found.truncated).toBe(true);
  });

  it("limita maxResults absurdo ao teto e busca só no path informado", async () => {
    await writeFile(join(root, "fora.txt"), "achado");
    await mkdir(join(root, "sub"));
    await writeFile(join(root, "sub", "dentro.txt"), "achado");
    const found = value(
      await grepTool.execute({ maxResults: 10_000_000, path: "sub", pattern: "achado" }, context),
    );
    expect(found.matches).toEqual([{ file: join("sub", "dentro.txt"), line: 1, text: "achado" }]);
  });

  it("busca em um único arquivo quando path aponta para arquivo", async () => {
    await writeFile(join(root, "a.txt"), "só aqui\nachado");
    const found = value(await grepTool.execute({ path: "a.txt", pattern: "achado" }, context));
    expect(found.matches).toEqual([{ file: "a.txt", line: 2, text: "achado" }]);
  });

  it("ignora binários, node_modules e .git", async () => {
    await writeFile(join(root, "bin.dat"), Buffer.from([65, 0, 66, 10, 84, 65, 82]));
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "node_modules", "dep.txt"), "TAR");
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git", "config"), "TAR");
    await writeFile(join(root, "ok.txt"), "TAR");
    const found = value(await grepTool.execute({ pattern: "TAR" }, context));
    expect(found.matches).toEqual([{ file: "ok.txt", line: 1, text: "TAR" }]);
  });

  it("não segue symlink na busca", async () => {
    const outside = await makeTmpRoot();
    try {
      await writeFile(join(outside, "segredo.txt"), "SENHA");
      await symlink(join(outside, "segredo.txt"), join(root, "link.txt"));
      const found = value(await grepTool.execute({ pattern: "SENHA" }, context));
      expect(found.matches).toHaveLength(0);
    } finally {
      await cleanup(outside);
    }
  });

  it("pula arquivo maior que o teto por arquivo", async () => {
    const big = `${"a".repeat(GREP_MAX_FILE_BYTES + 10)}\nSENHA`;
    await writeFile(join(root, "grande.txt"), big);
    await writeFile(join(root, "pequeno.txt"), "SENHA");
    const found = value(await grepTool.execute({ pattern: "SENHA" }, context));
    expect(found.matches).toEqual([{ file: "pequeno.txt", line: 1, text: "SENHA" }]);
  });

  it("trunca linhas muito longas com reticências", async () => {
    await writeFile(join(root, "a.txt"), `NEEDLE${"z".repeat(2_000)}`);
    const found = value(await grepTool.execute({ pattern: "NEEDLE" }, context));
    expect(found.matches[0]?.text.endsWith("…")).toBe(true);
    expect(found.matches[0]?.text.length).toBeLessThan(2_000);
  });

  it("recusa padrão vazio ou longo demais", async () => {
    await expect(grepTool.execute({ pattern: "" }, context)).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(
      grepTool.execute({ pattern: "a".repeat(GREP_MAX_PATTERN + 1) }, context),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("para imediatamente quando o sinal está abortado", async () => {
    await writeFile(join(root, "a.txt"), "achado");
    const controller = new AbortController();
    controller.abort();
    const found = value(
      await grepTool.execute({ pattern: "achado" }, { ...context, signal: controller.signal }),
    );
    expect(found.matches).toHaveLength(0);
    expect(found.truncated).toBe(true);
  });
});
