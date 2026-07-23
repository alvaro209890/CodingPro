import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carregarHooks } from "../src/hooks-loader.js";
import { iniciarServidoresMcp } from "../src/mcp-loader.js";
import { obterDiff, promptRevisao } from "../src/review.js";
import { carregarSkills, dirsSkills } from "../src/skills-loader.js";
import {
  ALL_TOOLS,
  EFFECT_TOOLS,
  MEMORY_TOOL_NAMES,
  ORCHESTRATION_TOOLS,
  READ_ONLY_TOOLS,
  SUBAGENT_TOOL_POOL,
} from "../src/tool-groups.js";

let dir = "";
let home = "";
let cwd = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "codingpro-loaders-"));
  home = join(dir, "home");
  cwd = join(dir, "projeto");
  await Promise.all([mkdir(home, { recursive: true }), mkdir(cwd, { recursive: true })]);
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

async function escreverSettings(raiz: string, conteudo: unknown): Promise<void> {
  await mkdir(join(raiz, ".codingpro"), { recursive: true });
  await writeFile(join(raiz, ".codingpro", "settings.json"), JSON.stringify(conteudo));
}

describe("grupos de tools", () => {
  it("nenhuma tool de efeito aparece entre as de leitura", () => {
    const leitura = new Set(READ_ONLY_TOOLS.map((t) => t.definition.name));
    for (const tool of EFFECT_TOOLS) {
      expect(leitura.has(tool.definition.name)).toBe(false);
    }
  });

  it("subagente nunca recebe `task` — senão daria para aninhar sem fim", () => {
    const pool = SUBAGENT_TOOL_POOL.map((t) => t.definition.name);
    for (const tool of ORCHESTRATION_TOOLS) {
      expect(pool).not.toContain(tool.definition.name);
    }
  });

  it("subagente recebe leitura, memória e efeito — o worker precisa poder editar", () => {
    const pool = new Set(SUBAGENT_TOOL_POOL.map((t) => t.definition.name));
    for (const tool of [...READ_ONLY_TOOLS, ...EFFECT_TOOLS]) {
      expect(pool.has(tool.definition.name)).toBe(true);
    }
  });

  it("ALL_TOOLS reúne todos os grupos sem nome repetido", () => {
    const nomes = ALL_TOOLS.map((t) => t.definition.name);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(nomes.length).toBeGreaterThanOrEqual(
      READ_ONLY_TOOLS.length + EFFECT_TOOLS.length + ORCHESTRATION_TOOLS.length,
    );
  });

  it("os nomes das tools de memória existem em ALL_TOOLS", () => {
    const nomes = new Set(ALL_TOOLS.map((t) => t.definition.name));
    expect(MEMORY_TOOL_NAMES.length).toBeGreaterThan(0);
    for (const nome of MEMORY_TOOL_NAMES) {
      expect(nomes.has(nome)).toBe(true);
    }
  });
});

describe("carregarHooks", () => {
  it("sem settings, devolve lista vazia em vez de estourar", async () => {
    expect(await carregarHooks(cwd, home)).toEqual([]);
  });

  it("junta hooks do global e do projeto, nessa ordem", async () => {
    await escreverSettings(home, { hooks: [{ command: "echo global", event: "stop" }] });
    await escreverSettings(cwd, { hooks: [{ command: "echo projeto", event: "pre-tool" }] });

    const hooks = await carregarHooks(cwd, home);
    expect(hooks.map((h) => h.command)).toEqual(["echo global", "echo projeto"]);
  });

  it("descarta entradas inválidas sem perder as boas", async () => {
    await escreverSettings(cwd, {
      hooks: [
        { command: "ok", event: "post-tool" },
        { command: "sem evento válido", event: "inventado" },
        { event: "stop" },
        { command: "   ", event: "stop" },
        "nem é objeto",
        null,
      ],
    });
    const hooks = await carregarHooks(cwd, home);
    expect(hooks).toHaveLength(1);
    expect(hooks[0]?.command).toBe("ok");
  });

  it("preserva matcher e timeoutMs quando presentes", async () => {
    await escreverSettings(cwd, {
      hooks: [{ command: "x", event: "pre-tool", matcher: "write_file", timeoutMs: 500 }],
    });
    expect((await carregarHooks(cwd, home))[0]).toMatchObject({
      matcher: "write_file",
      timeoutMs: 500,
    });
  });

  it("settings com JSON quebrado é ignorado, não derruba a sessão", async () => {
    await mkdir(join(cwd, ".codingpro"), { recursive: true });
    await writeFile(join(cwd, ".codingpro", "settings.json"), "{ isso não é json");
    expect(await carregarHooks(cwd, home)).toEqual([]);
  });

  it("aceita JSONC com comentários", async () => {
    await mkdir(join(cwd, ".codingpro"), { recursive: true });
    await writeFile(
      join(cwd, ".codingpro", "settings.json"),
      '{ // comentário\n "hooks": [{ "event": "stop", "command": "ok" }] }',
    );
    expect(await carregarHooks(cwd, home)).toHaveLength(1);
  });
});

describe("skills", () => {
  it("dirsSkills devolve o global antes do projeto", () => {
    const dirs = dirsSkills(cwd, home);
    expect(dirs[0]).toBe(join(home, ".codingpro", "skills"));
    expect(dirs[1]).toBe(join(cwd, ".codingpro", "skills"));
  });

  it("diretório inexistente é ignorado", async () => {
    expect(await carregarSkills(dirsSkills(cwd, home))).toEqual([]);
  });

  it("carrega .md e ignora outras extensões", async () => {
    const skills = join(cwd, ".codingpro", "skills");
    await mkdir(skills, { recursive: true });
    await writeFile(
      join(skills, "deploy.md"),
      "---\nnome: deploy\ndescricao: sobe o sistema\n---\n\nPassos do deploy.",
    );
    await writeFile(join(skills, "leiame.txt"), "não é skill");

    const carregadas = await carregarSkills(dirsSkills(cwd, home));
    expect(carregadas.map((s) => s.nome)).toEqual(["deploy"]);
  });

  it("a skill do projeto vence a global de mesmo nome", async () => {
    for (const [raiz, corpo] of [
      [home, "versão global"],
      [cwd, "versão do projeto"],
    ] as const) {
      const skills = join(raiz, ".codingpro", "skills");
      await mkdir(skills, { recursive: true });
      await writeFile(
        join(skills, "deploy.md"),
        `---\nnome: deploy\ndescricao: sobe o sistema\n---\n\n${corpo}`,
      );
    }
    const carregadas = await carregarSkills(dirsSkills(cwd, home));
    expect(carregadas).toHaveLength(1);
    expect(carregadas[0]?.body).toContain("versão do projeto");
  });

  it("arquivo grande demais é descartado", async () => {
    const skills = join(cwd, ".codingpro", "skills");
    await mkdir(skills, { recursive: true });
    await writeFile(
      join(skills, "gigante.md"),
      `---\nnome: gigante\ndescricao: enorme\n---\n\n${"x".repeat(200_000)}`,
    );
    expect(await carregarSkills(dirsSkills(cwd, home))).toEqual([]);
  });

  it("devolve em ordem alfabética", async () => {
    const skills = join(cwd, ".codingpro", "skills");
    await mkdir(skills, { recursive: true });
    for (const nome of ["zebra", "alfa", "meio"]) {
      await writeFile(
        join(skills, `${nome}.md`),
        `---\nnome: ${nome}\ndescricao: skill ${nome}\n---\n\ncorpo`,
      );
    }
    const carregadas = await carregarSkills(dirsSkills(cwd, home));
    expect(carregadas.map((s) => s.nome)).toEqual(["alfa", "meio", "zebra"]);
  });
});

describe("iniciarServidoresMcp", () => {
  it("sem settings, não há tools nem avisos", async () => {
    const mcp = await iniciarServidoresMcp(cwd, home);
    expect(mcp.tools).toEqual([]);
    expect(mcp.avisos).toEqual([]);
    mcp.fechar();
  });

  it("servidor que não sobe vira aviso, não exceção", async () => {
    await escreverSettings(cwd, {
      mcpServers: { quebrado: { command: "comando-que-nao-existe-mesmo" } },
    });
    const mcp = await iniciarServidoresMcp(cwd, home);
    expect(mcp.tools).toEqual([]);
    expect(mcp.avisos.length).toBeGreaterThan(0);
    expect(mcp.avisos.join(" ")).toContain("quebrado");
    mcp.fechar();
  });

  it("entradas sem `command` são ignoradas", async () => {
    await escreverSettings(cwd, { mcpServers: { ruim: { args: ["x"] }, outro: null } });
    const mcp = await iniciarServidoresMcp(cwd, home);
    expect(mcp.avisos).toEqual([]);
    mcp.fechar();
  });
});

describe("review", () => {
  it("fora de um repositório git, avisa em vez de estourar", async () => {
    const { diff, erro } = await obterDiff(cwd);
    expect(diff).toBe("");
    expect(erro).toBe("não é um repositório git");
  });

  it("o prompt de revisão embrulha o diff em bloco de código", () => {
    const prompt = promptRevisao("--- a/x\n+++ b/x");
    expect(prompt).toContain("```diff");
    expect(prompt).toContain("--- a/x");
    expect(prompt).toContain("severidade");
  });
});
