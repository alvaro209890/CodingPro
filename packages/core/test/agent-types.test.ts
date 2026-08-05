import { describe, expect, it } from "vitest";
import { parseTipoAgente, resolverTipoAgente, TIPOS_AGENTE_PADRAO } from "../src/agent-types.js";

describe("tipos de agente", () => {
  it("tem os dez tipos de fábrica com perfis coerentes", () => {
    expect(Object.keys(TIPOS_AGENTE_PADRAO).sort()).toEqual([
      "architect",
      "debugger",
      "docs",
      "explorer",
      "refactor",
      "reviewer",
      "security",
      "tester",
      "verifier",
      "worker",
    ]);
    expect(TIPOS_AGENTE_PADRAO.explorer?.role).toBe("fast");
    expect(TIPOS_AGENTE_PADRAO.explorer?.tools).not.toContain("write_file");
    expect(TIPOS_AGENTE_PADRAO.worker?.tools).toContain("edit_file");
    // Novos tipos (doc 03): verifier é barato por definição (fast) e não edita.
    expect(TIPOS_AGENTE_PADRAO.verifier?.role).toBe("fast");
    expect(TIPOS_AGENTE_PADRAO.verifier?.tools).not.toContain("write_file");
    expect(TIPOS_AGENTE_PADRAO.tester?.tools).toContain("run_tests");
    expect(TIPOS_AGENTE_PADRAO.security?.tools).toContain("grep");
    expect(TIPOS_AGENTE_PADRAO.debugger?.tools).toContain("run_command");
  });

  it("resolve nome contra custom + padrão (custom vence)", () => {
    const custom = { explorer: { ...TIPOS_AGENTE_PADRAO.explorer, descricao: "meu" } } as never;
    expect(resolverTipoAgente("architect")?.nome).toBe("architect");
    expect(resolverTipoAgente("explorer", custom)?.descricao).toBe("meu");
    expect(resolverTipoAgente("inexistente")).toBeUndefined();
  });

  it("parseTipoAgente lê frontmatter role/tools e corpo como prompt", () => {
    const t = parseTipoAgente(
      "meu-agente",
      "---\nrole: fast\ntools: read_file, grep\ndescription: busca coisas\n---\nVocê busca coisas.",
    );
    expect(t?.role).toBe("fast");
    expect(t?.tools).toEqual(["read_file", "grep"]);
    expect(t?.systemPrompt).toContain("busca coisas");
  });

  it("parseTipoAgente aplica defaults e rejeita sem frontmatter", () => {
    const t = parseTipoAgente("x", "---\ndescription: só descrição\n---\nCorpo do prompt.");
    expect(t?.role).toBe("auto");
    expect(t?.tools.length).toBeGreaterThan(0);
    expect(t?.systemPrompt).toContain("Corpo do prompt");
    expect(parseTipoAgente("x", "sem frontmatter")).toBeUndefined();
  });
});
