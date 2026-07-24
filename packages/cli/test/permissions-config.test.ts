import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adicionarAllowlist, lerAllowlist } from "../src/permissions-config.js";

let temporary: string;
let cwd: string;
let home: string;

beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), "codingpro-permissions-"));
  cwd = join(temporary, "project");
  home = join(temporary, "home");
  await Promise.all([mkdir(cwd), mkdir(home)]);
});

afterEach(async () => {
  await rm(temporary, { force: true, recursive: true });
});

async function writeSettings(root: string, content: string): Promise<void> {
  await mkdir(join(root, ".codingpro"), { recursive: true });
  await writeFile(join(root, ".codingpro", "settings.json"), content, "utf8");
}

describe("permissions-config", () => {
  it("lê allowlist do projeto antes da global, sem duplicar nomes", async () => {
    await writeSettings(cwd, '{ "permissions": { "allowlist": ["bash", "write_file"] } }');
    await writeSettings(home, '{ "permissions": { "allowlist": ["write_file", "edit_file"] } }');

    expect(lerAllowlist(cwd, home)).toEqual(["bash", "write_file", "edit_file"]);
  });

  it("ignora settings ausente, ilegível ou allowlist inválida", async () => {
    await writeSettings(cwd, '{ "permissions": { "allowlist": [123, "", "edit_file"] } }');
    await writeSettings(home, "{malformado");

    expect(lerAllowlist(cwd, home)).toEqual(["edit_file"]);
  });

  it("adiciona allowlist no settings do projeto preservando outras chaves JSON", async () => {
    await writeSettings(cwd, '{ "theme": "mono", "permissions": { "allowlist": ["bash"] } }');

    await adicionarAllowlist("write_file", cwd);
    await adicionarAllowlist("write_file", cwd);

    const settings = JSON.parse(
      await readFile(join(cwd, ".codingpro", "settings.json"), "utf8"),
    ) as { permissions: { allowlist: string[] }; theme: string };
    expect(settings.theme).toBe("mono");
    expect(settings.permissions.allowlist).toEqual(["bash", "write_file"]);
  });

  it("cria .codingpro/settings.json quando ainda não existe", async () => {
    await adicionarAllowlist("edit_file", cwd);

    expect(lerAllowlist(cwd, home)).toEqual(["edit_file"]);
  });
});
