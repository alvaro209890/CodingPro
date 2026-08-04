import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { readFileWithin, writeFileWithin } from "../fs-safe.js";
import { type ExecutableTool, errorResult, type ToolContext, textResult } from "../tool.js";
import { READ_FILE_MAX_BYTES } from "./read-file.js";

const definition: Tool = {
  description:
    "Aplica um patch unificado (diff) a um ou mais arquivos atomicamente o melhor possível. " +
    "Cada arquivo alvo precisa ter sido lido antes (exceto criação). Prefira edit_file para " +
    "trocas pontuais; use apply_patch para mudanças multi-arquivo coerentes.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      patch: { description: "Diff unificado completo.", type: "string" },
    },
    required: ["patch"],
    type: "object",
  },
  name: "apply_patch",
};

interface ArquivoPatch {
  readonly path: string;
  readonly hunks: Hunk[];
  readonly novo: boolean;
}

interface Hunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newLines: string[];
  readonly oldLines: string[];
}

function parsePatch(patch: string): ArquivoPatch[] {
  const linhas = patch.replace(/\r\n?/gu, "\n").split("\n");
  const arquivos: ArquivoPatch[] = [];
  let atual: ArquivoPatch | undefined;
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i] ?? "";
    if (linha.startsWith("--- ")) {
      const oldPath = linha
        .slice(4)
        .trim()
        .replace(/^[ab]\//u, "");
      const next = linhas[i + 1] ?? "";
      if (!next.startsWith("+++ ")) {
        i += 1;
        continue;
      }
      const newPath = next
        .slice(4)
        .trim()
        .replace(/^[ab]\//u, "");
      const path = newPath === "/dev/null" ? oldPath : newPath;
      atual = {
        hunks: [],
        novo: oldPath === "/dev/null",
        path: path === "/dev/null" ? oldPath : path,
      };
      arquivos.push(atual);
      i += 2;
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(linha);
    if (m && atual) {
      const oldStart = Number(m[1]);
      const oldCount = Number(m[2] ?? "1");
      const oldLines: string[] = [];
      const newLines: string[] = [];
      i += 1;
      while (i < linhas.length) {
        const l = linhas[i] ?? "";
        if (l.startsWith("--- ") || l.startsWith("@@ ")) break;
        if (l.startsWith("\\")) {
          i += 1;
          continue;
        }
        if (l.startsWith("+")) newLines.push(l.slice(1));
        else if (l.startsWith("-")) oldLines.push(l.slice(1));
        else if (l.startsWith(" ") || l === "") {
          const ctx = l.startsWith(" ") ? l.slice(1) : l;
          oldLines.push(ctx);
          newLines.push(ctx);
        } else break;
        i += 1;
      }
      atual.hunks.push({ newLines, oldCount, oldLines, oldStart });
      continue;
    }
    i += 1;
  }
  return arquivos;
}

function aplicarHunks(texto: string, hunks: Hunk[]): string {
  const linhas = texto.split("\n");
  // Aplica de trás para frente para não deslocar índices
  const ordenados = [...hunks].sort((a, b) => b.oldStart - a.oldStart);
  for (const hunk of ordenados) {
    const inicio = Math.max(0, hunk.oldStart - 1);
    const fim = inicio + hunk.oldCount;
    const fatia = linhas.slice(inicio, fim);
    // Validação frouxa: se oldLines bate, ok; senão tenta mesmo assim na posição
    const esperado = hunk.oldLines;
    const ok =
      esperado.length === 0 || fatia.slice(0, esperado.length).join("\n") === esperado.join("\n");
    if (!ok && esperado.length > 0) {
      // procura sequência
      const alvo = esperado.join("\n");
      const bruto = linhas.join("\n");
      const idx = bruto.indexOf(alvo);
      if (idx === -1) {
        throw new Error(`Hunk @${hunk.oldStart} não casou com o arquivo.`);
      }
      const antes = bruto.slice(0, idx);
      const depois = bruto.slice(idx + alvo.length);
      return `${antes}${hunk.newLines.join("\n")}${depois}`;
    }
    linhas.splice(inicio, hunk.oldCount, ...hunk.newLines);
  }
  return linhas.join("\n");
}

export const applyPatchTool: ExecutableTool = {
  definition,
  sideEffect: "write",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const patch = typeof input.patch === "string" ? input.patch : "";
    if (!patch.trim()) return errorResult("Patch vazio.");
    const arquivos = parsePatch(patch);
    if (arquivos.length === 0) {
      return errorResult("Não encontrei arquivos no patch (esperado formato unificado).");
    }

    const ok: string[] = [];
    const falhas: string[] = [];
    for (const arq of arquivos) {
      try {
        const absolute = context.workspace.resolve(arq.path);
        const rel = context.workspace.toRelative(absolute);
        if (!arq.novo && context.readTracker && !context.readTracker.wasRead(rel)) {
          throw new Error(`leia ${rel} antes de aplicar o patch`);
        }
        let base = "";
        if (!arq.novo) {
          const bytes = await readFileWithin(context.workspace, absolute, READ_FILE_MAX_BYTES);
          base = bytes.toString("utf8");
        }
        const novo = aplicarHunks(base, arq.hunks);
        await context.checkpoints?.capture(rel);
        await writeFileWithin(context.workspace, absolute, novo, READ_FILE_MAX_BYTES);
        ok.push(rel);
      } catch (error) {
        falhas.push(`${arq.path}: ${error instanceof Error ? error.message : "falha"}`);
      }
    }

    if (ok.length === 0) {
      return errorResult(`Nenhum arquivo aplicado.\n${falhas.join("\n")}`);
    }
    return textResult(
      `Patch aplicado em ${ok.length} arquivo(s): ${ok.join(", ")}.` +
        (falhas.length ? `\nFalhas:\n${falhas.join("\n")}` : ""),
    );
  },
};
