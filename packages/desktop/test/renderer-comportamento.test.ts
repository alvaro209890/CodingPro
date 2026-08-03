import { describe, expect, it } from "vitest";
import { COMANDOS_CHAT, filtrarSugestoes } from "../src/shared/slash-commands.js";
import { PALETAS, TEMAS, gradienteCSS } from "../src/shared/temas-paleta.js";
import { rotuloRelativo } from "../src/renderer/components/Sidebar.js";

/**
 * Fila de permissões — a regra que o `App.tsx` aplica ao receber `permission-request`
 * e ao responder. Extraída aqui como funções puras para poder ser testada sem DOM;
 * a lógica no componente é a mesma (enfileirar sem duplicar id, remover só o respondido).
 */
type Pedido = { id: string };

function enfileirar(fila: readonly Pedido[], novo: Pedido): Pedido[] {
  return fila.some((p) => p.id === novo.id) ? [...fila] : [...fila, novo];
}

function responder(fila: readonly Pedido[], id: string): Pedido[] {
  return fila.filter((p) => p.id !== id);
}

describe("fila de permissões", () => {
  it("guarda pedidos paralelos em vez de sobrescrever o anterior", () => {
    // Antes da correção o renderer guardava um slot só: o 2º pedido substituía o 1º,
    // que nunca era respondido e deixava o turno travado no main para sempre.
    let fila: Pedido[] = [];
    fila = enfileirar(fila, { id: "perm-1" });
    fila = enfileirar(fila, { id: "perm-2" });
    fila = enfileirar(fila, { id: "perm-3" });
    expect(fila.map((p) => p.id)).toEqual(["perm-1", "perm-2", "perm-3"]);
  });

  it("responder tira só o pedido respondido e promove o seguinte", () => {
    const fila = [{ id: "perm-1" }, { id: "perm-2" }];
    const depois = responder(fila, "perm-1");
    expect(depois.map((p) => p.id)).toEqual(["perm-2"]);
    expect(depois[0]).toBeDefined();
  });

  it("reentrega do mesmo id não duplica o card", () => {
    let fila: Pedido[] = [];
    fila = enfileirar(fila, { id: "perm-1" });
    fila = enfileirar(fila, { id: "perm-1" });
    expect(fila).toHaveLength(1);
  });
});

describe("catálogo de comandos do dock", () => {
  it("usa a fonte única compartilhada, não uma lista paralela", () => {
    // O dock tinha 15 comandos escritos à mão e a paleta outros 10; o catálogo real
    // tem 21. Comandos como /doctor e /skills simplesmente não apareciam.
    expect(COMANDOS_CHAT.length).toBeGreaterThanOrEqual(21);
    const nomes = COMANDOS_CHAT.map((c) => c.nome);
    for (const esperado of ["/doctor", "/skills", "/memory", "/index", "/nova"]) {
      expect(nomes).toContain(esperado);
    }
  });

  it("sugere por nome e por alias", () => {
    expect(filtrarSugestoes("/doc").map((s) => s.nome)).toContain("/doctor");
    expect(filtrarSugestoes("/undo").map((s) => s.nome)).toContain("/desfazer");
  });

  it("não sugere nada depois que o comando já tem argumento", () => {
    expect(filtrarSugestoes("/abrir C:\\projeto")).toEqual([]);
  });

  it("texto normal não vira sugestão", () => {
    expect(filtrarSugestoes("explique este arquivo")).toEqual([]);
  });
});

describe("amostras de tema", () => {
  it("cada tema gera um gradiente próprio", () => {
    // Os quatro chips liam as variáveis CSS do tema ativo, então ficavam idênticos.
    const gradientes = TEMAS.map((t) => gradienteCSS(PALETAS[t]));
    expect(new Set(gradientes).size).toBe(TEMAS.length);
  });

  it("o gradiente do Aurora é esmeralda → ciano → violeta", () => {
    const g = gradienteCSS(PALETAS.aurora);
    expect(g).toContain("rgb(16,185,129)");
    expect(g).toContain("rgb(6,182,212)");
    expect(g).toContain("rgb(139,92,246)");
  });
});

describe("rótulo relativo das conversas", () => {
  it("traduz a distância no tempo em texto curto", () => {
    const agora = Date.now();
    const em = (ms: number) => new Date(agora - ms).toISOString();
    expect(rotuloRelativo(em(10_000))).toBe("agora");
    expect(rotuloRelativo(em(5 * 60_000))).toBe("5 min");
    expect(rotuloRelativo(em(3 * 3_600_000))).toBe("3 h");
    expect(rotuloRelativo(em(2 * 86_400_000))).toBe("2 d");
  });

  it("data ausente ou inválida vira vazio, nunca 'Invalid Date'", () => {
    expect(rotuloRelativo(undefined)).toBe("");
    expect(rotuloRelativo("nao-e-data")).toBe("");
  });
});
