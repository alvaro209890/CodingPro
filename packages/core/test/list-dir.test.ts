import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../src/tool.js";
import { LIST_DIR_MAX_ENTRIES, listDirTool } from "../src/tools/list-dir.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

interface ListValue {
  readonly entries: readonly { readonly kind: string; readonly name: string }[];
  readonly truncated: boolean;
}

function value(result: { type: string; value?: unknown }): ListValue {
  expect(result.type).toBe("json");
  return result.value as ListValue;
}

describe("list_dir", () => {
  let root: string;
  let context: ToolContext;

  beforeEach(async () => {
    root = await makeTmpRoot();
    context = { workspace: await Workspace.create(root) };
  });

  afterEach(async () => {
    await cleanup(root);
  });

  it("lista a raiz por padrão, ordenada e com tipos", async () => {
    await writeFile(join(root, "b.txt"), "x");
    await mkdir(join(root, "a-dir"));
    await symlink(join(root, "b.txt"), join(root, "c-link"));
    const listing = value(await listDirTool.execute({}, context));
    expect(listing.entries).toEqual([
      { kind: "dir", name: "a-dir" },
      { kind: "file", name: "b.txt" },
      { kind: "link", name: "c-link" },
    ]);
    expect(listing.truncated).toBe(false);
  });

  it("lista um subdiretório informado", async () => {
    await mkdir(join(root, "sub"));
    await writeFile(join(root, "sub", "dentro.txt"), "x");
    const listing = value(await listDirTool.execute({ path: "sub" }, context));
    expect(listing.entries).toEqual([{ kind: "file", name: "dentro.txt" }]);
  });

  it("recusa quando o caminho é um arquivo", async () => {
    await writeFile(join(root, "arquivo.txt"), "x");
    await expect(listDirTool.execute({ path: "arquivo.txt" }, context)).rejects.toMatchObject({
      code: "not-a-directory",
    });
  });

  it("trunca listagens acima do teto", async () => {
    const total = LIST_DIR_MAX_ENTRIES + 5;
    await Promise.all(
      Array.from({ length: total }, (_unused, index) =>
        writeFile(join(root, `f${String(index).padStart(5, "0")}.txt`), "x"),
      ),
    );
    const listing = value(await listDirTool.execute({}, context));
    expect(listing.entries).toHaveLength(LIST_DIR_MAX_ENTRIES);
    expect(listing.truncated).toBe(true);
  });
});
