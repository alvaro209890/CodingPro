import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carregarHooks } from "../src/hooks-runtime.js";
import { carregarSkills, dirsSkills } from "../src/skills-runtime.js";

describe("skills-runtime", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-ext-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("carrega skills .md e ignora inválidas; projeto vence global por nome", async () => {
    const global = join(root, "home", ".codingpro", "skills");
    const projeto = join(root, "proj", ".codingpro", "skills");
    await mkdir(global, { recursive: true });
    await mkdir(projeto, { recursive: true });
    await writeFile(
      join(global, "deploy.md"),
      "---\nname: deploy\ndescription: global\n---\ncorpo g",
      "utf8",
    );
    await writeFile(
      join(projeto, "deploy.md"),
      "---\nname: deploy\ndescription: projeto\n---\ncorpo p",
      "utf8",
    );
    await writeFile(join(projeto, "quebrada.md"), "sem frontmatter", "utf8");
    const skills = await carregarSkills([global, projeto]);
    expect(skills.map((s) => s.nome)).toEqual(["deploy"]);
    expect(skills[0]?.descricao).toBe("projeto");
  });

  it("dirsSkills aponta para home e projeto", () => {
    expect(dirsSkills("/proj", "/lar")).toEqual([
      join("/lar", ".codingpro", "skills"),
      join("/proj", ".codingpro", "skills"),
    ]);
  });

  it("diretórios ausentes → nenhuma skill", async () => {
    expect(await carregarSkills([join(root, "nada")])).toEqual([]);
  });
});

describe("hooks-runtime", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-hooks-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("mescla hooks do settings global e do projeto; ignora entradas inválidas", async () => {
    const proj = join(root, "proj");
    const home = join(root, "home");
    await mkdir(join(home, ".codingpro"), { recursive: true });
    await mkdir(join(proj, ".codingpro"), { recursive: true });
    // Global: um hook mínimo válido (sem matcher/timeout).
    await writeFile(
      join(home, ".codingpro", "settings.json"),
      JSON.stringify({ hooks: [{ command: "true", event: "stop" }] }),
      "utf8",
    );
    await writeFile(
      join(proj, ".codingpro", "settings.json"),
      JSON.stringify({
        hooks: [
          { command: "echo oi", event: "pre-tool", matcher: "bash", timeoutMs: 500 },
          { command: "", event: "stop" },
          { event: "invalido" },
          "nao-objeto",
          { command: 123, event: "pre-tool" },
        ],
      }),
      "utf8",
    );
    const hooks = await carregarHooks(proj, home);
    expect(hooks).toHaveLength(2);
    expect(hooks[0]).toMatchObject({ command: "true", event: "stop" });
    expect(hooks[1]).toMatchObject({
      command: "echo oi",
      event: "pre-tool",
      matcher: "bash",
      timeoutMs: 500,
    });
  });

  it("settings ausente → nenhum hook", async () => {
    expect(await carregarHooks(join(root, "vazio"), join(root, "home"))).toEqual([]);
  });
});

describe("skills-runtime — limites", () => {
  it("ignora skill grande demais", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codingpro-bigskill-"));
    const grande = `---\nname: big\ndescription: x\n---\n${"a".repeat(70_000)}`;
    await writeFile(join(dir, "big.md"), grande, "utf8");
    expect(await carregarSkills([dir])).toEqual([]);
    await rm(dir, { force: true, recursive: true });
  });
});

describe("skills-runtime — ordenação", () => {
  it("ordena skills distintas por nome", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codingpro-skillsort-"));
    await writeFile(join(dir, "z.md"), "---\nname: zeta\ndescription: z\n---\ncorpo", "utf8");
    await writeFile(join(dir, "a.md"), "---\nname: alfa\ndescription: a\n---\ncorpo", "utf8");
    const skills = await carregarSkills([dir]);
    expect(skills.map((s) => s.nome)).toEqual(["alfa", "zeta"]);
    await rm(dir, { force: true, recursive: true });
  });
});
