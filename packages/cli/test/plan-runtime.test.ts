import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SubagenteSpawner } from "@codingpro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  blocoPlanoAtivo,
  classificarRespostaArquiteto,
  executarComandoPlan,
  formatarPerguntaUi,
  interpretarResposta,
  mensagemHistoricoPlano,
  type PlanoAtivo,
  parsePerguntas,
  promptFasePerguntas,
  promptFasePlano,
} from "../src/plan-runtime.js";

const PERGUNTAS_MD = `# PERGUNTAS
## 1. Qual banco de dados?
- A) SQLite embutido
- B) PostgreSQL
- C) MySQL

## 2. Migração online?
- A) Sim, com downtime zero
- B) Não, janela de manutenção ok
`;

describe("plan-runtime — parsing e UI", () => {
  it("classifica SEM_PERGUNTAS, PERGUNTAS e plano", () => {
    expect(classificarRespostaArquiteto("# SEM_PERGUNTAS\n")).toBe("sem_perguntas");
    expect(classificarRespostaArquiteto(PERGUNTAS_MD)).toBe("perguntas");
    expect(classificarRespostaArquiteto("# Plano\n## Passos\n1. foo")).toBe("plano");
    // sem header # PERGUNTAS, mas com ## 1. + opções
    expect(classificarRespostaArquiteto("## 1. Preferência?\n- A) um\n- B) dois")).toBe(
      "perguntas",
    );
  });

  it("parsePerguntas extrai enunciado e opções", () => {
    const ps = parsePerguntas(PERGUNTAS_MD);
    expect(ps).toHaveLength(2);
    expect(ps[0]?.enunciado).toContain("banco");
    expect(ps[0]?.opcoes.map((o) => o.letra)).toEqual(["A", "B", "C"]);
    expect(ps[1]?.opcoes).toHaveLength(2);
  });

  it("interpretarResposta aceita número, letra e texto livre", () => {
    const p = parsePerguntas(PERGUNTAS_MD)[0];
    expect(p).toBeDefined();
    if (p === undefined) {
      return;
    }
    expect(interpretarResposta("2", p).escolha).toContain("PostgreSQL");
    expect(interpretarResposta("b", p).escolha).toContain("PostgreSQL");
    expect(interpretarResposta("B) postgres custom", p).livre).toBe(false);
    expect(interpretarResposta("quero cockroach", p).livre).toBe(true);
    expect(interpretarResposta("0", p).livre).toBe(true);
    expect(interpretarResposta("", p).escolha).toContain("SQLite");
    expect(interpretarResposta("", { enunciado: "x", numero: 1, opcoes: [] }).escolha).toContain(
      "sem resposta",
    );
  });

  it("formatarPerguntaUi lista [1] [2] e bloco de plano ativo", () => {
    const p = parsePerguntas(PERGUNTAS_MD)[0];
    expect(p).toBeDefined();
    if (p === undefined) {
      return;
    }
    const ui = formatarPerguntaUi(p, 2);
    expect(ui).toContain("[1]");
    expect(ui).toContain("[0] outro");

    const plano: PlanoAtivo = {
      caminho: ".codingpro/plans/x.md",
      objetivo: "migrar DB",
      respostas: [{ escolha: "B) PostgreSQL", enunciado: "Qual banco?", numero: 1 }],
      texto: "# Plano\n1. passo",
    };
    const bloco = blocoPlanoAtivo(plano);
    expect(bloco).toContain("Plano ativo");
    expect(bloco).toContain("PostgreSQL");
    expect(bloco).toContain("passo");
    expect(mensagemHistoricoPlano(plano)).toContain("migrar DB");
  });

  it("prompts de fase contêm objetivo e respostas", () => {
    expect(promptFasePerguntas("xyz")).toContain("xyz");
    expect(promptFasePerguntas("xyz")).toContain("SEM_PERGUNTAS");
    const p2 = promptFasePlano("abc", [{ escolha: "A) sim", enunciado: "ok?", numero: 1 }]);
    expect(p2).toContain("abc");
    expect(p2).toContain("A) sim");
  });

  it("blocoPlanoAtivo trunca texto longo", () => {
    const plano: PlanoAtivo = {
      caminho: "p.md",
      objetivo: "o",
      respostas: [],
      texto: "x".repeat(100),
    };
    expect(blocoPlanoAtivo(plano, 20)).toContain("truncado");
  });
});

describe("executarComandoPlan", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codingpro-plan-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  function spawner(roteiro: string[]): SubagenteSpawner {
    let i = 0;
    return {
      maxParalelo: 1,
      tiposDisponiveis: ["architect"],
      async executar(_tipo, _prompt) {
        const texto = roteiro[i] ?? "plano vazio";
        i += 1;
        return {
          finishReason: "stop",
          interrompido: false,
          passos: 1,
          texto,
          tipo: "architect",
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
          },
        };
      },
    };
  }

  function io(respostas: string[] = []) {
    let ri = 0;
    let progresso = "";
    let saida = "";
    return {
      captura: () => ({ progresso, saida }),
      io: {
        pergunta: async () => respostas[ri++] ?? "1",
        progresso: (t: string) => {
          progresso += t;
        },
        saida: (t: string) => {
          saida += t;
        },
      },
    };
  }

  it("objetivo vazio mostra uso", async () => {
    const { io: planIo, captura } = io();
    await executarComandoPlan(spawner([]), root, "  ", planIo);
    expect(captura().progresso).toContain("uso: /plan");
  });

  it("clear cancela sem plano", async () => {
    const { io: planIo, captura } = io();
    const r = await executarComandoPlan(spawner([]), root, "clear", planIo);
    expect(r.cancelado).toBe(true);
    expect(captura().progresso).toContain("limpo");
  });

  it("SEM_PERGUNTAS → plano salvo em disco", async () => {
    const { io: planIo, captura } = io();
    const r = await executarComandoPlan(
      spawner(["# SEM_PERGUNTAS", "# Plano\n1. passo"]),
      root,
      "fazer X",
      planIo,
    );
    expect(r.plano?.texto).toContain("passo");
    expect(captura().progresso).toContain("plano salvo");
    const arq = r.plano?.caminho;
    expect(arq).toBeDefined();
    if (arq !== undefined && arq !== "(não salvo)") {
      const body = await readFile(arq, "utf8");
      expect(body).toContain("fazer X");
    }
  });

  it("perguntas → coleta resposta → plano com decisões", async () => {
    const { io: planIo, captura } = io(["2"]);
    const r = await executarComandoPlan(
      spawner([
        ["# PERGUNTAS", "## 1. Qual DB?", "- A) SQLite", "- B) Postgres"].join("\n"),
        "# Plano\nUsar Postgres",
      ]),
      root,
      "migrar",
      planIo,
    );
    expect(r.plano?.respostas[0]?.escolha).toContain("Postgres");
    expect(captura().saida).toContain("Postgres");
    expect(captura().progresso).toMatch(/✓ 1/u);
  });

  it("plano direto na 1ª resposta (sem fase 2)", async () => {
    const { io: planIo } = io();
    const r = await executarComandoPlan(
      spawner(["# Plano direto\n1. a\n2. b"]),
      root,
      "tarefa",
      planIo,
    );
    expect(r.plano?.texto).toContain("Plano direto");
  });

  it("perguntas com formato inválido planeja direto", async () => {
    const { io: planIo, captura } = io();
    const r = await executarComandoPlan(
      spawner(["# PERGUNTAS\n## 1. algo sem opcoes", "# Plano\nok"]),
      root,
      "x",
      planIo,
    );
    expect(captura().progresso).toMatch(/inválido|planejando/u);
    expect(r.plano?.texto).toContain("ok");
  });
});
