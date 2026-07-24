import { describe, expect, it } from "vitest";
import {
  buscarMemorias,
  descricaoDe,
  gerarIndice,
  type Memoria,
  montarBlocoMemoria,
  pareceSegredo,
  parseMemoria,
  pontuarMemoria,
  serializarMemoria,
  slugify,
  termosDe,
} from "../src/memory.js";

function mem(over: Partial<Memoria>): Memoria {
  return {
    body: "corpo",
    created: "2026-07-22",
    description: "desc",
    name: "slug",
    strength: 1,
    type: "project",
    updated: "2026-07-22",
    ...over,
  };
}

describe("slugify", () => {
  it("normaliza acentos, espaços e símbolos", () => {
    expect(slugify("Preferência do Usuário!")).toBe("preferencia-do-usuario");
    expect(slugify("  ---  ")).toBe("memoria");
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});

describe("serializar/parse", () => {
  it("faz round-trip preservando os campos", () => {
    const m = mem({
      body: "Fato com [[link]].",
      description: "resumo",
      name: "meu-fato",
      strength: 3,
    });
    const parsed = parseMemoria("ignorado", serializarMemoria(m));
    expect(parsed).toEqual(m);
  });

  it("rejeita frontmatter ausente ou type inválido", () => {
    expect(parseMemoria("x", "sem frontmatter")).toBeUndefined();
    expect(parseMemoria("x", "---\nname: y\ntype: xpto\n---\ncorpo")).toBeUndefined();
  });

  it("aplica defaults para campos ausentes", () => {
    const parsed = parseMemoria("do-nome", "---\ntype: user\n---\ncorpo");
    expect(parsed?.type).toBe("user");
    expect(parsed?.name).toBe("do-nome");
    expect(parsed?.strength).toBe(1);
  });
});

describe("índice e descrição", () => {
  it("gera MEMORY.md ordenado com uma linha por fato", () => {
    const idx = gerarIndice([
      mem({ name: "b", type: "user" }),
      mem({ name: "a", description: "d" }),
    ]);
    expect(idx.indexOf("**a**")).toBeLessThan(idx.indexOf("**b**"));
  });

  it("índice vazio tem placeholder", () => {
    expect(gerarIndice([])).toContain("Nenhuma memória ainda");
  });

  it("descricaoDe pega a primeira linha e trunca", () => {
    expect(descricaoDe("linha um\nlinha dois")).toBe("linha um");
    expect(descricaoDe("x".repeat(300)).endsWith("…")).toBe(true);
  });
});

describe("retrieval léxico", () => {
  const memorias = [
    mem({ name: "deploy-render", description: "deploy no Render", body: "autoDeploy off" }),
    mem({ name: "pagarme", description: "chaves de pagamento", body: "pagar.me live" }),
    mem({ name: "outro", description: "irrelevante", body: "nada a ver" }),
  ];

  it("ranqueia por casamento de termos, cabeçalho pesa mais", () => {
    const r = buscarMemorias(memorias, "como é o deploy no render?");
    expect(r[0]?.name).toBe("deploy-render");
  });

  it("descarta memórias sem casamento", () => {
    expect(buscarMemorias(memorias, "xyzabc")).toEqual([]);
  });

  it("respeita topK", () => {
    expect(buscarMemorias(memorias, "deploy render pagamento", { topK: 1 })).toHaveLength(1);
  });

  it("pontuarMemoria zero sem termos", () => {
    expect(pontuarMemoria(memorias[0] as Memoria, [])).toBe(0);
    expect(termosDe("de a")).toEqual(["de"]);
  });
});

describe("guarda de segredo", () => {
  it("detecta valores parecidos com segredo", () => {
    expect(pareceSegredo("a chave é sk_live_abcdefghij0123456789")).toBe(true);
    expect(pareceSegredo("password: superSecreta123")).toBe(true);
    expect(pareceSegredo("a chave fica no arquivo .env do projeto")).toBe(false);
  });
});

describe("bloco de memória no prompt", () => {
  it("monta índices + relevantes; vazio quando não há nada", () => {
    expect(montarBlocoMemoria({})).toBe("");
    const bloco = montarBlocoMemoria({
      indiceGlobal: "# Índice\n- **a** (user) — x",
      relevantes: [mem({ name: "a", body: "corpo relevante" })],
    });
    expect(bloco).toContain("Memória global");
    expect(bloco).toContain("corpo relevante");
  });

  it("ignora índice placeholder", () => {
    expect(
      montarBlocoMemoria({ indiceGlobal: "# Índice de memória\n\n_Nenhuma memória ainda._\n" }),
    ).toBe("");
  });
});
