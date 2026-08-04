import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { readFileWithin, writeFileWithin } from "../fs-safe.js";
import { extrairSimbolos, linguagemDeArquivo } from "../symbols.js";
import { type ExecutableTool, errorResult, type ToolContext, textResult } from "../tool.js";
import { READ_FILE_MAX_BYTES } from "./read-file.js";

const definition: Tool = {
  description:
    "Substitui o corpo de uma função/classe pelo nome do símbolo, sem precisar citar o texto " +
    "exato. Exige leitura prévia do arquivo (como edit_file). newBody deve incluir a declaração.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      newBody: {
        description: "Novo texto completo do símbolo (assinatura + corpo).",
        type: "string",
      },
      path: { description: "Arquivo relativo à raiz.", type: "string" },
      symbol: { description: "Nome do símbolo (função/classe/interface).", type: "string" },
    },
    required: ["path", "symbol", "newBody"],
    type: "object",
  },
  name: "edit_symbol",
};

/** Encontra o fim do bloco a partir da linha da declaração (brace-match ou próximo símbolo). */
function fimDoSimbolo(linhas: string[], inicio: number, proximosInicios: number[]): number {
  const texto = linhas.slice(inicio).join("\n");
  const abre = texto.indexOf("{");
  if (abre === -1) {
    // Sem chaves: até a próxima declaração ou fim (ex.: arrow one-liner)
    const prox = proximosInicios.find((n) => n > inicio + 1);
    return (prox ?? linhas.length + 1) - 1;
  }
  let profundidade = 0;
  let i = inicio;
  let j = 0;
  const trecho = linhas.slice(inicio);
  for (; i < linhas.length; i += 1) {
    const linha = trecho[i - inicio] ?? "";
    for (j = 0; j < linha.length; j += 1) {
      const c = linha[j];
      if (c === "{") profundidade += 1;
      else if (c === "}") {
        profundidade -= 1;
        if (profundidade === 0) return i + 1; // 1-based end inclusive via slice end
      }
    }
  }
  const prox = proximosInicios.find((n) => n > inicio + 1);
  return (prox ?? linhas.length + 1) - 1;
}

export const editSymbolTool: ExecutableTool = {
  definition,
  sideEffect: "write",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const path = typeof input.path === "string" ? input.path.trim() : "";
    const symbol = typeof input.symbol === "string" ? input.symbol.trim() : "";
    const newBody = typeof input.newBody === "string" ? input.newBody : "";
    if (!path || !symbol) return errorResult("Informe path e symbol.");
    if (!newBody.trim()) return errorResult("newBody vazio.");

    const absolute = context.workspace.resolve(path);
    const rel = context.workspace.toRelative(absolute);
    if (context.readTracker && !context.readTracker.wasRead(rel)) {
      return errorResult(`Leia ${rel} com read_file antes de editar o símbolo.`);
    }

    const linguagem = linguagemDeArquivo(rel);
    if (linguagem === undefined) {
      return errorResult("Linguagem do arquivo não suportada por edit_symbol.");
    }

    const bytes = await readFileWithin(context.workspace, absolute, READ_FILE_MAX_BYTES);
    const texto = bytes.toString("utf8");
    const linhas = texto.split("\n");
    const simbolos = extrairSimbolos(linguagem, texto).filter((s) => s.nome === symbol);
    if (simbolos.length === 0) {
      return errorResult(`Símbolo "${symbol}" não encontrado em ${rel}.`);
    }
    const alvo = simbolos[0];
    if (alvo === undefined) {
      return errorResult(`Símbolo "${symbol}" não encontrado em ${rel}.`);
    }
    const inicios = simbolos.map((s) => s.linha);
    const todosInicios = extrairSimbolos(linguagem, texto).map((s) => s.linha);
    const fimLinha = fimDoSimbolo(linhas, alvo.linha - 1, todosInicios);
    const antes = linhas.slice(0, alvo.linha - 1);
    const depois = linhas.slice(fimLinha);
    const corpo = newBody.replace(/\r\n?/gu, "\n").replace(/\n$/u, "");
    const novo = [...antes, corpo, ...depois].join("\n");

    await context.checkpoints?.capture(rel);
    await writeFileWithin(context.workspace, absolute, novo, READ_FILE_MAX_BYTES);
    return textResult(
      `Símbolo "${symbol}" em ${rel} (linhas ${alvo.linha}–${fimLinha}) substituído.` +
        (inicios.length > 1 ? ` (${inicios.length} ocorrências; usei a primeira.)` : ""),
    );
  },
};
