import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { iniciarServidoresMcp } from "../src/mcp-runtime.js";

const SERVER = fileURLToPath(
  new URL("../../core/test/fixtures/fake-mcp-server.mjs", import.meta.url),
);

describe("mcp-runtime", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-mcprt-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("conecta servidores do settings do projeto e expõe as tools", async () => {
    const proj = join(root, "proj");
    await mkdir(join(proj, ".codingpro"), { recursive: true });
    await writeFile(
      join(proj, ".codingpro", "settings.json"),
      JSON.stringify({ mcpServers: { fake: { args: [SERVER], command: process.execPath } } }),
      "utf8",
    );
    const mcp = await iniciarServidoresMcp(proj, join(root, "home"));
    expect(mcp.avisos).toEqual([]);
    expect(mcp.tools.map((t) => t.definition.name)).toEqual([
      "mcp__fake__echo",
      "mcp__fake__noschema",
      "mcp__fake__notext",
    ]);
    mcp.fechar();
  });

  it("registra aviso quando um servidor não sobe, sem derrubar", async () => {
    const proj = join(root, "proj");
    await mkdir(join(proj, ".codingpro"), { recursive: true });
    await writeFile(
      join(proj, ".codingpro", "settings.json"),
      JSON.stringify({ mcpServers: { ruim: { command: "/caminho/inexistente/xyz" } } }),
      "utf8",
    );
    const mcp = await iniciarServidoresMcp(proj, join(root, "home"));
    expect(mcp.tools).toEqual([]);
    expect(mcp.avisos.length).toBeGreaterThan(0);
    mcp.fechar();
  });

  it("settings ausente → nenhuma tool nem aviso", async () => {
    const mcp = await iniciarServidoresMcp(join(root, "vazio"), join(root, "home"));
    expect(mcp.tools).toEqual([]);
    expect(mcp.avisos).toEqual([]);
    mcp.fechar();
  });

  it("mescla servidores do global e do projeto, com args/env e entradas inválidas ignoradas", async () => {
    const home = join(root, "home");
    const proj = join(root, "proj");
    await mkdir(join(home, ".codingpro"), { recursive: true });
    await mkdir(join(proj, ".codingpro"), { recursive: true });
    await writeFile(
      join(home, ".codingpro", "settings.json"),
      JSON.stringify({
        mcpServers: {
          g: { args: [SERVER, 123], command: process.execPath, env: { X: "1" } },
          semCommand: { args: [] },
        },
      }),
      "utf8",
    );
    await writeFile(
      join(proj, ".codingpro", "settings.json"),
      JSON.stringify({ mcpServers: { p: { args: [SERVER], command: process.execPath } } }),
      "utf8",
    );
    const mcp = await iniciarServidoresMcp(proj, home);
    const nomes = mcp.tools.map((t) => t.definition.name).sort();
    expect(nomes).toEqual([
      "mcp__g__echo",
      "mcp__g__noschema",
      "mcp__g__notext",
      "mcp__p__echo",
      "mcp__p__noschema",
      "mcp__p__notext",
    ]);
    mcp.fechar();
  });
});
