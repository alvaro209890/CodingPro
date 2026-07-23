/**
 * /plan melhorado: perguntas com opções selecionáveis → plano salvo em disco →
 * plano ativo injetado no contexto da sessão (para o agente "lembrar" ao executar).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify, type SubagenteSpawner } from "@codingpro/core";

export interface OpcaoPergunta {
  readonly letra: string;
  readonly texto: string;
}

export interface PerguntaPlano {
  readonly numero: number;
  readonly enunciado: string;
  readonly opcoes: readonly OpcaoPergunta[];
}

export interface RespostaPergunta {
  readonly numero: number;
  readonly enunciado: string;
  readonly escolha: string;
  readonly livre?: boolean;
}

export interface PlanoAtivo {
  readonly objetivo: string;
  readonly caminho: string;
  readonly texto: string;
  readonly respostas: readonly RespostaPergunta[];
}

export type ClassificacaoArquiteto = "perguntas" | "sem_perguntas" | "plano";

/** Classifica a saída do arquiteto (fase de perguntas vs plano pronto). */
export function classificarRespostaArquiteto(texto: string): ClassificacaoArquiteto {
  const head = texto.trim().slice(0, 400);
  if (/#\s*SEM[_\s-]?PERGUNTAS/iu.test(head) || /^SEM[_\s-]?PERGUNTAS\b/imu.test(head)) {
    return "sem_perguntas";
  }
  // Marcador # PERGUNTAS manda para a fase de Q&A (mesmo se o parse de opções falhar).
  if (/#\s*PERGUNTAS\b/iu.test(texto)) {
    return "perguntas";
  }
  // Sem header, mas com ## N. + opções A/B, também trata como perguntas.
  if (
    /^##\s*\d+[\.)]\s+/mu.test(texto) &&
    (/^[\s]*[-*]\s*[A-Da-d][\)\].:]/mu.test(texto) || /\b[A-D]\)\s+\S/u.test(texto))
  ) {
    return "perguntas";
  }
  return "plano";
}

/**
 * Extrai perguntas estruturadas do Markdown do arquiteto.
 * Formato esperado:
 * ## 1. enunciado
 * - A) opção
 * - B) opção
 */
export function parsePerguntas(texto: string): PerguntaPlano[] {
  const linhas = texto.replaceAll("\r\n", "\n").split("\n");
  const perguntas: PerguntaPlano[] = [];
  let atual: { numero: number; enunciado: string; opcoes: OpcaoPergunta[] } | undefined;

  const flush = (): void => {
    if (atual !== undefined && atual.opcoes.length >= 2) {
      perguntas.push({
        enunciado: atual.enunciado,
        numero: atual.numero,
        opcoes: atual.opcoes,
      });
    }
    atual = undefined;
  };

  for (const bruta of linhas) {
    const linha = bruta.trim();
    const mP = /^##\s*(\d+)[\.)]?\s+(.+)$/u.exec(linha);
    if (mP !== null) {
      flush();
      atual = {
        enunciado: (mP[2] ?? "").trim(),
        numero: Number.parseInt(mP[1] ?? "0", 10),
        opcoes: [],
      };
      continue;
    }
    const mO = /^[-*•]\s*([A-Da-d])[\)\].:]\s*(.+)$/u.exec(linha);
    if (mO !== null && atual !== undefined) {
      atual.opcoes.push({
        letra: (mO[1] ?? "A").toUpperCase(),
        texto: (mO[2] ?? "").trim(),
      });
    }
  }
  flush();
  return perguntas.slice(0, 4);
}

/** Formata uma pergunta para o terminal (números selecionáveis). */
export function formatarPerguntaUi(p: PerguntaPlano, total: number): string {
  const linhas = [
    `Pergunta ${p.numero}/${total}: ${p.enunciado}`,
    ...p.opcoes.map((o, i) => `  [${i + 1}] ${o.letra}) ${o.texto}`),
    `  [0] outro (digite livremente)`,
    `Resposta [1-${p.opcoes.length}] ou texto: `,
  ];
  return `${linhas.join("\n")}`;
}

/**
 * Interpreta a resposta do usuário: índice 1..N, letra A.., ou texto livre.
 */
export function interpretarResposta(
  entrada: string,
  pergunta: PerguntaPlano,
): { escolha: string; livre: boolean } {
  const t = entrada.trim();
  if (t.length === 0) {
    const primeira = pergunta.opcoes[0];
    return {
      escolha: primeira === undefined ? "(sem resposta)" : `${primeira.letra}) ${primeira.texto}`,
      livre: false,
    };
  }
  if (t === "0") {
    return { escolha: "(usuário pediu outra opção — use critério razoável)", livre: true };
  }
  const n = Number.parseInt(t, 10);
  if (Number.isInteger(n) && n >= 1 && n <= pergunta.opcoes.length) {
    const o = pergunta.opcoes[n - 1];
    if (o !== undefined) {
      return { escolha: `${o.letra}) ${o.texto}`, livre: false };
    }
  }
  const letra =
    t.length === 1 ? t.toUpperCase() : /^([A-D])[\)\].:]?\s*/iu.exec(t)?.[1]?.toUpperCase();
  if (letra !== undefined) {
    const o = pergunta.opcoes.find((x) => x.letra === letra);
    if (o !== undefined) {
      return { escolha: `${o.letra}) ${o.texto}`, livre: false };
    }
  }
  return { escolha: t, livre: true };
}

/** Bloco injetado no system prompt a cada turno enquanto houver plano ativo. */
export function blocoPlanoAtivo(plano: PlanoAtivo, maxChars = 12_000): string {
  const corpo =
    plano.texto.length > maxChars
      ? `${plano.texto.slice(0, maxChars)}\n… (plano truncado; arquivo completo em ${plano.caminho})`
      : plano.texto;
  const respostas =
    plano.respostas.length === 0
      ? ""
      : [
          "",
          "### Decisões do usuário (Q&A do /plan)",
          ...plano.respostas.map(
            (r) =>
              `${r.numero}. ${r.enunciado} → ${r.escolha}${r.livre === true ? " (livre)" : ""}`,
          ),
        ].join("\n");
  return [
    "## Plano ativo da sessão (obrigatório lembrar)",
    `Objetivo: ${plano.objetivo}`,
    `Arquivo: ${plano.caminho}`,
    "",
    "O usuário já definiu este plano via `/plan`. Se pedir para executar, implementar ou seguir o plano,",
    "use ESTES passos — não invente outro plano do zero. Só replaneje se o usuário pedir explicitamente.",
    respostas,
    "",
    "### Conteúdo do plano",
    corpo,
  ].join("\n");
}

/** Prompt da fase 1: só perguntas ou SEM_PERGUNTAS. */
export function promptFasePerguntas(objetivo: string): string {
  return [
    "Antes de planejar a tarefa abaixo, avalie se falta informação crítica do usuário.",
    "",
    `Objetivo: ${objetivo}`,
    "",
    "Se faltar informação, responda APENAS no formato:",
    "",
    "# PERGUNTAS",
    "## 1. <pergunta curta e objetiva>",
    "- A) opção concreta",
    "- B) opção concreta",
    "- C) opção concreta",
    "",
    "(no máximo 4 perguntas; cada uma com 2 a 5 opções A–E; sem rodeios)",
    "",
    "Se já houver informação suficiente para planejar bem, responda exatamente uma linha:",
    "# SEM_PERGUNTAS",
    "",
    "Não produza o plano ainda nesta resposta. Responda em português.",
  ].join("\n");
}

/** Prompt da fase 2: plano completo com respostas. */
export function promptFasePlano(objetivo: string, respostas: readonly RespostaPergunta[]): string {
  const blocoResp =
    respostas.length === 0
      ? "(nenhuma pergunta — planeje com boas práticas e defaults sensatos)"
      : respostas.map((r) => `${r.numero}. ${r.enunciado}\n   Resposta: ${r.escolha}`).join("\n");
  return [
    "Produza um PLANO completo em Markdown para a tarefa.",
    "",
    `Objetivo: ${objetivo}`,
    "",
    "Decisões do usuário (use-as no plano; não contradiga):",
    blocoResp,
    "",
    "Estrutura obrigatória:",
    "# Plano: <título>",
    "## Contexto",
    "## Passos (checklist numerado, acionável)",
    "## Riscos",
    "## Critério de pronto",
    "",
    "Use as ferramentas de leitura se precisar embasar o plano. Responda só com o plano, em português.",
  ].join("\n");
}

/** Texto de assistant para o histórico da sessão (o agente “vê” o plano depois). */
export function mensagemHistoricoPlano(plano: PlanoAtivo): string {
  return [
    `Plano ativo definido para: **${plano.objetivo}**`,
    `Salvo em: \`${plano.caminho}\``,
    "",
    "Vou seguir este plano se você pedir para executar/implementar. Resumo:",
    "",
    plano.texto.length > 4_000 ? `${plano.texto.slice(0, 4_000)}\n…` : plano.texto,
  ].join("\n");
}

export interface PlanIo {
  readonly pergunta: (texto: string) => Promise<string>;
  readonly progresso: (texto: string) => void;
  readonly saida: (texto: string) => void;
}

export interface ResultadoPlan {
  readonly plano?: PlanoAtivo;
  readonly cancelado?: boolean;
}

/**
 * Orquestra /plan: perguntas interativas (se o arquiteto pedir) → plano → disco.
 */
export async function executarComandoPlan(
  spawner: SubagenteSpawner,
  root: string,
  objetivoBruto: string,
  io: PlanIo,
  signal?: AbortSignal,
): Promise<ResultadoPlan> {
  const objetivo = objetivoBruto.trim();
  if (objetivo.length === 0) {
    io.progresso("· uso: /plan <objetivo>  ·  /plan clear limpa o plano ativo\n");
    return {};
  }

  if (objetivo === "clear" || objetivo === "limpar" || objetivo === "none") {
    io.progresso("· plano ativo limpo (chame /plan <objetivo> para um novo)\n");
    return { cancelado: true };
  }

  io.progresso("· arquiteto: verificando se precisa de decisões…\n");
  const fase1 = await spawner.executar("architect", promptFasePerguntas(objetivo), signal);
  const texto1 = fase1.texto.trim();
  const classe = classificarRespostaArquiteto(texto1);

  const respostas: RespostaPergunta[] = [];

  if (classe === "perguntas") {
    const perguntas = parsePerguntas(texto1);
    if (perguntas.length === 0) {
      io.progresso(
        "· arquiteto pediu perguntas, mas o formato veio inválido — planejando direto…\n",
      );
    } else {
      io.progresso(`· ${perguntas.length} pergunta(s) — escolha pelo número\n`);
      for (const p of perguntas) {
        const prompt = formatarPerguntaUi(p, perguntas.length);
        const raw = await io.pergunta(prompt);
        const { escolha, livre } = interpretarResposta(raw, p);
        respostas.push({
          escolha,
          enunciado: p.enunciado,
          numero: p.numero,
          ...(livre ? { livre: true } : {}),
        });
        io.progresso(`· ✓ ${p.numero}: ${escolha}\n`);
      }
    }
  } else if (classe === "sem_perguntas") {
    io.progresso("· sem perguntas extras — montando o plano…\n");
  } else {
    // Já veio plano completo na 1ª resposta
    return salvarPlano(root, objetivo, texto1, respostas, io);
  }

  io.progresso("· arquiteto redigindo o plano…\n");
  const fase2 = await spawner.executar("architect", promptFasePlano(objetivo, respostas), signal);
  const planoTexto =
    fase2.texto.trim().length > 0 ? fase2.texto.trim() : "(o arquiteto não produziu plano)";
  return salvarPlano(root, objetivo, planoTexto, respostas, io);
}

async function salvarPlano(
  root: string,
  objetivo: string,
  texto: string,
  respostas: readonly RespostaPergunta[],
  io: PlanIo,
): Promise<ResultadoPlan> {
  io.saida(`${texto}\n`);
  let caminho = join(
    root,
    ".codingpro",
    "plans",
    `${new Date().toISOString().slice(0, 10)}-${slugify(objetivo)}.md`,
  );
  try {
    const dir = join(root, ".codingpro", "plans");
    await mkdir(dir, { recursive: true });
    const corpo = [
      `# Plano: ${objetivo}`,
      "",
      ...(respostas.length > 0
        ? [
            "## Decisões do usuário",
            ...respostas.map((r) => `- **${r.enunciado}:** ${r.escolha}`),
            "",
          ]
        : []),
      texto,
      "",
    ].join("\n");
    await writeFile(caminho, corpo, "utf8");
    io.progresso(`· plano salvo em ${caminho}\n`);
    io.progresso("· plano ativo na sessão — peça para executar e eu seguirei estes passos\n");
  } catch {
    io.progresso("· não consegui salvar o plano em disco (ainda ativo na sessão)\n");
    caminho = "(não salvo)";
  }
  return {
    plano: {
      caminho,
      objetivo,
      respostas,
      texto,
    },
  };
}
