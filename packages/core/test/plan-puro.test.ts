import { describe, expect, it } from "vitest";
import {
  blocoPlanoAtivo,
  classificarRespostaArquiteto,
  formatarPerguntaUi,
  interpretarResposta,
  mensagemHistoricoPlano,
  parsePerguntas,
  promptFasePerguntas,
  promptFasePlano,
} from "../src/plan.js";

const PERGUNTA = {
  enunciado: "Qual banco usar?",
  numero: 1,
  opcoes: [
    { letra: "A", texto: "Postgres" },
    { letra: "B", texto: "SQLite" },
  ],
};

describe("classificarRespostaArquiteto", () => {
  it("reconhece o marcador de perguntas", () => {
    expect(classificarRespostaArquiteto("# PERGUNTAS\n\n## 1. algo")).toBe("perguntas");
  });

  it("reconhece SEM_PERGUNTAS em suas variações", () => {
    for (const texto of ["# SEM_PERGUNTAS", "# SEM PERGUNTAS", "SEM-PERGUNTAS\nsegue o plano"]) {
      expect(classificarRespostaArquiteto(texto)).toBe("sem_perguntas");
    }
  });

  it("infere perguntas pelo formato, mesmo sem header", () => {
    expect(classificarRespostaArquiteto("## 1. Qual abordagem?\n- A) uma\n- B) outra")).toBe(
      "perguntas",
    );
  });

  it("texto comum é tratado como plano", () => {
    expect(classificarRespostaArquiteto("## Plano\n\n1. Criar o módulo\n2. Testar")).toBe("plano");
  });

  it("SEM_PERGUNTAS só vale no começo — não no fim de um plano longo", () => {
    const plano = `## Plano\n${"detalhe. ".repeat(200)}\nSEM_PERGUNTAS`;
    expect(classificarRespostaArquiteto(plano)).toBe("plano");
  });
});

describe("parsePerguntas", () => {
  it("extrai enunciado e opções", () => {
    const perguntas = parsePerguntas(
      "# PERGUNTAS\n\n## 1. Qual banco?\n- A) Postgres\n- B) SQLite\n\n## 2. Qual UI?\n- A) CLI\n- B) Web",
    );
    expect(perguntas).toHaveLength(2);
    expect(perguntas[0]?.enunciado).toBe("Qual banco?");
    expect(perguntas[0]?.opcoes.map((o) => o.letra)).toEqual(["A", "B"]);
    expect(perguntas[1]?.numero).toBe(2);
  });

  it("descarta pergunta com menos de duas opções", () => {
    expect(parsePerguntas("## 1. Só uma?\n- A) sozinha")).toEqual([]);
  });

  it("limita a 4 perguntas — o usuário não deve virar formulário", () => {
    const texto = Array.from(
      { length: 8 },
      (_, i) => `## ${i + 1}. Pergunta ${i}\n- A) sim\n- B) não`,
    ).join("\n\n");
    expect(parsePerguntas(texto)).toHaveLength(4);
  });

  it("aceita marcadores e separadores variados, e normaliza a letra", () => {
    const perguntas = parsePerguntas("## 1. Qual?\n* a. minúscula\n• B: bullet\n- C] colchete");
    expect(perguntas[0]?.opcoes.map((o) => o.letra)).toEqual(["A", "B", "C"]);
  });

  it("lida com CRLF", () => {
    expect(parsePerguntas("## 1. Qual?\r\n- A) um\r\n- B) dois")).toHaveLength(1);
  });

  it("texto sem perguntas devolve lista vazia", () => {
    expect(parsePerguntas("nenhuma pergunta aqui")).toEqual([]);
  });
});

describe("interpretarResposta", () => {
  it("índice numérico escolhe a opção correspondente", () => {
    expect(interpretarResposta("2", PERGUNTA)).toEqual({ escolha: "B) SQLite", livre: false });
  });

  it("letra escolhe a opção, com ou sem pontuação", () => {
    expect(interpretarResposta("a", PERGUNTA).escolha).toBe("A) Postgres");
    expect(interpretarResposta("B)", PERGUNTA).escolha).toBe("B) SQLite");
  });

  it("vazio aceita a primeira opção — o Enter é o caminho rápido", () => {
    expect(interpretarResposta("", PERGUNTA)).toEqual({ escolha: "A) Postgres", livre: false });
  });

  it("zero pede outra coisa", () => {
    expect(interpretarResposta("0", PERGUNTA).livre).toBe(true);
  });

  it("texto livre passa direto", () => {
    expect(interpretarResposta("prefiro MySQL", PERGUNTA)).toEqual({
      escolha: "prefiro MySQL",
      livre: true,
    });
  });

  it("índice fora da faixa vira texto livre em vez de escolher errado", () => {
    expect(interpretarResposta("9", PERGUNTA)).toEqual({ escolha: "9", livre: true });
  });

  it("pergunta sem opções e resposta vazia não estoura", () => {
    expect(interpretarResposta("", { enunciado: "x", numero: 1, opcoes: [] }).escolha).toBe(
      "(sem resposta)",
    );
  });
});

describe("formatarPerguntaUi", () => {
  it("numera as opções e oferece a saída livre", () => {
    const texto = formatarPerguntaUi(PERGUNTA, 3);
    expect(texto).toContain("Pergunta 1/3: Qual banco usar?");
    expect(texto).toContain("[1] A) Postgres");
    expect(texto).toContain("[2] B) SQLite");
    expect(texto).toContain("[0] outro");
  });
});

describe("blocoPlanoAtivo", () => {
  it("inclui o objetivo e o texto do plano", () => {
    const bloco = blocoPlanoAtivo({
      caminho: ".codingpro/planos/x.md",
      objetivo: "migrar o banco",
      respostas: [],
      texto: "1. fazer isso",
    });
    expect(bloco).toContain("migrar o banco");
    expect(bloco).toContain("1. fazer isso");
  });

  it("trunca plano gigante para não estourar o contexto", () => {
    const bloco = blocoPlanoAtivo(
      {
        caminho: ".codingpro/planos/x.md",
        objetivo: "x",
        respostas: [],
        texto: "y".repeat(50_000),
      },
      1_000,
    );
    expect(bloco.length).toBeLessThan(2_000);
    expect(bloco).toContain("plano truncado");
  });
});

describe("prompts do arquiteto", () => {
  it("a fase de perguntas pede o formato esperado e cita o objetivo", () => {
    const prompt = promptFasePerguntas("criar um proxy de LLM");
    expect(prompt).toContain("criar um proxy de LLM");
    expect(prompt.toUpperCase()).toContain("PERGUNTAS");
  });

  it("a fase de plano repassa as respostas colhidas", () => {
    const prompt = promptFasePlano("criar um proxy", [
      { escolha: "A) Postgres", enunciado: "Qual banco?", numero: 1 },
    ]);
    expect(prompt).toContain("criar um proxy");
    expect(prompt).toContain("Qual banco?");
    expect(prompt).toContain("A) Postgres");
  });

  it("a mensagem de histórico registra o plano aprovado", () => {
    const msg = mensagemHistoricoPlano({
      caminho: ".codingpro/planos/x.md",
      objetivo: "migrar",
      respostas: [],
      texto: "passos",
    });
    expect(msg).toContain("migrar");
  });
});
