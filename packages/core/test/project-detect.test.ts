import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  alvosMakefile,
  detectarProjeto,
  gerarCodingproMd,
  resumoProjeto,
} from "../src/project-detect.js";
import { Workspace } from "../src/workspace.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

describe("detectarProjeto", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTmpRoot();
  });

  afterEach(async () => {
    await cleanup(root);
  });

  async function detectar() {
    return detectarProjeto(await Workspace.create(root));
  }

  it("detecta um projeto Node TS com Next, pnpm e Vitest", async () => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: { next: "14", react: "18" },
        devDependencies: { vitest: "2" },
        name: "meu-app",
        packageManager: "pnpm@10.0.0",
        scripts: { build: "next build", test: "vitest run" },
      }),
    );
    await writeFile(join(root, "index.ts"), "export const x = 1;\n");
    await writeFile(join(root, "app.tsx"), "export default () => null;\n");
    const info = await detectar();
    expect(info.nome).toBe("meu-app");
    expect(info.linguagens).toContain("TypeScript");
    expect(info.framework).toBe("Next.js");
    expect(info.gerenciador).toBe("pnpm");
    expect(info.ferramentaTestes).toBe("Vitest");
    expect(info.scripts.build).toBe("next build");
  });

  it("marca monorepo por pnpm-workspace.yaml", async () => {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "raiz" }));
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    const info = await detectar();
    expect(info.monorepo).toBe(true);
  });

  it("marca monorepo pelo campo workspaces do package.json", async () => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "raiz", workspaces: ["packages/*"] }),
    );
    const info = await detectar();
    expect(info.monorepo).toBe(true);
  });

  it("infere gerenciador por lockfile quando não há packageManager", async () => {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "x" }));
    await writeFile(join(root, "yarn.lock"), "");
    const info = await detectar();
    expect(info.gerenciador).toBe("Yarn");
  });

  it("detecta Python com FastAPI, Poetry e pytest", async () => {
    await writeFile(
      join(root, "pyproject.toml"),
      "[tool.poetry]\nname='api'\n[deps]\nfastapi='*'\npytest='*'\n",
    );
    await writeFile(join(root, "main.py"), "print('oi')\n");
    const info = await detectar();
    expect(info.linguagens).toContain("Python");
    expect(info.framework).toBe("FastAPI");
    expect(info.gerenciador).toBe("Poetry");
    expect(info.ferramentaTestes).toBe("pytest");
  });

  it("detecta Rust por Cargo.toml e extrai o nome", async () => {
    await writeFile(join(root, "Cargo.toml"), '[package]\nname = "ferrugem"\n');
    await writeFile(join(root, "main.rs"), "fn main() {}\n");
    const info = await detectar();
    expect(info.linguagens).toContain("Rust");
    expect(info.gerenciador).toBe("Cargo");
    expect(info.nome).toBe("ferrugem");
  });

  it("ignora node_modules e diretórios de build na varredura", async () => {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "x" }));
    await mkdir(join(root, "node_modules", "dep"), { recursive: true });
    await writeFile(join(root, "node_modules", "dep", "index.js"), "module.exports = {}");
    await writeFile(join(root, "a.ts"), "export const a = 1;\n");
    const info = await detectar();
    // Só o a.ts conta → TypeScript presente, JavaScript (do node_modules) ausente.
    expect(info.linguagens).toEqual(["TypeScript"]);
  });

  it("lida com package.json inválido sem quebrar", async () => {
    await writeFile(join(root, "package.json"), "{ inválido");
    await writeFile(join(root, "a.go"), "package main\n");
    const info = await detectar();
    expect(info.nome).toBeUndefined();
    expect(info.linguagens).toContain("Go");
  });

  it("projeto vazio devolve estrutura mínima", async () => {
    const info = await detectar();
    expect(info.linguagens).toEqual([]);
    expect(info.monorepo).toBe(false);
    expect(info.scripts).toEqual({});
  });

  it("captura alvos de Makefile como scripts", async () => {
    await writeFile(join(root, "Makefile"), "build:\n\tgo build\ntest:\n\tgo test\n");
    const info = await detectar();
    expect(info.scripts.build).toBe("make");
    expect(info.scripts.test).toBe("make");
  });
});

describe("alvosMakefile", () => {
  it("extrai alvos e ignora variáveis e .PHONY", () => {
    const alvos = alvosMakefile("VAR := 1\n.PHONY: build\nbuild:\n\tcc\ninstall: build\n\tcp\n");
    expect(Object.keys(alvos).sort()).toEqual(["build", "install"]);
  });
});

describe("resumoProjeto", () => {
  it("resume em uma linha com separador", () => {
    expect(
      resumoProjeto({
        framework: "Next.js",
        gerenciador: "pnpm",
        linguagens: ["TypeScript"],
        monorepo: true,
        scripts: {},
      }),
    ).toBe("TypeScript · Next.js · pnpm · monorepo");
  });

  it("fallback quando nada é detectado", () => {
    expect(resumoProjeto({ linguagens: [], monorepo: false, scripts: {} })).toContain(
      "sem marcadores",
    );
  });
});

describe("gerarCodingproMd", () => {
  it("inclui os campos detectados e os scripts", () => {
    const md = gerarCodingproMd(
      {
        ferramentaTestes: "Vitest",
        framework: "Next.js",
        gerenciador: "pnpm",
        linguagens: ["TypeScript", "JavaScript"],
        monorepo: false,
        nome: "app",
        scripts: { build: "next build" },
      },
      new Date("2026-07-22T12:00:00Z"),
    );
    expect(md).toContain("# CODINGPRO.md");
    expect(md).toContain("2026-07-22");
    expect(md).toContain("**Nome:** app");
    expect(md).toContain("TypeScript, JavaScript");
    expect(md).toContain("**Monorepo:** não");
    expect(md).toContain("`build`: `next build`");
    expect(md).toContain("## Convenções");
  });

  it("indica quando não há scripts", () => {
    const md = gerarCodingproMd({ linguagens: [], monorepo: false, scripts: {} });
    expect(md).toContain("Nenhum script detectado");
  });
});
