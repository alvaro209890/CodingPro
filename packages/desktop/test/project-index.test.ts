import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectIndexStore, ZERO_PERSISTED_USAGE } from "../src/main/project-index.js";

const tempDirs: string[] = [];

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "codingpro-project-index-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("ProjectIndexStore", () => {
  it("migra last-workspace e não varre outras pastas", () => {
    const root = temp();
    const workspace = join(root, "projeto");
    mkdirSync(workspace);
    const legacy = join(root, "last-workspace.json");
    writeFileSync(legacy, JSON.stringify({ cwd: workspace }));
    const store = new ProjectIndexStore(join(root, "index.json"), legacy);
    expect(store.groups()).toHaveLength(1);
    expect(store.groups()[0]?.workspacePath).toBe(workspace);
  });

  it("mantém projetos de mesmo nome separados pelo caminho e ordena por uso", () => {
    const root = temp();
    const first = join(root, "a", "app");
    const second = join(root, "b", "app");
    mkdirSync(first, { recursive: true });
    mkdirSync(second, { recursive: true });
    const store = new ProjectIndexStore(join(root, "index.json"));
    store.touchProject(first, new Date("2026-01-01T00:00:00Z"));
    store.touchProject(second, new Date("2026-02-01T00:00:00Z"));
    const groups = store.groups();
    expect(groups.map((group) => group.name)).toEqual(["app", "app"]);
    expect(groups.map((group) => group.workspacePath)).toEqual([second, first]);
    expect(new Set(groups.map((group) => group.id)).size).toBe(2);
  });

  it("preserva projeto indisponível e ordena conversas por atualização", () => {
    const root = temp();
    const workspace = join(root, "sumiu");
    mkdirSync(workspace);
    const store = new ProjectIndexStore(join(root, "index.json"));
    store.upsertSession(workspace, {
      createdAt: "2026-01-01T00:00:00Z",
      id: "one",
      title: "Antiga",
      updatedAt: "2026-01-01T00:00:00Z",
      usage: { ...ZERO_PERSISTED_USAGE },
    });
    store.upsertSession(workspace, {
      createdAt: "2026-01-02T00:00:00Z",
      id: "two",
      title: "Nova",
      updatedAt: "2026-01-02T00:00:00Z",
      usage: { ...ZERO_PERSISTED_USAGE },
    });
    rmSync(workspace, { recursive: true });
    const group = store.groups()[0];
    expect(group?.available).toBe(false);
    expect(group?.sessions.map((session) => session.id)).toEqual(["two", "one"]);
  });
});
