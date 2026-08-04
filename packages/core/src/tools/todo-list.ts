import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { JsonObject, Tool, ToolResult } from "@codingpro/llm";
import { type ExecutableTool, errorResult, type ToolContext, textResult } from "../tool.js";

const ARQUIVO = ".codingpro/session-todos.json";

interface TodoItem {
  readonly done: boolean;
  readonly id: string;
  readonly text: string;
  readonly updatedAt: string;
}

const definition: Tool = {
  description:
    "Checklist persistente da sessão (.codingpro/session-todos.json). Ações: add, list, done, " +
    "remove, clear. Use para acompanhar progresso em tarefas longas sem inflar o histórico.",
  inputSchema: {
    additionalProperties: false,
    properties: {
      action: {
        description: "Operação.",
        enum: ["add", "list", "done", "remove", "clear"],
        type: "string",
      },
      id: { description: "Id do item (done/remove).", type: "string" },
      text: { description: "Texto do item (add).", type: "string" },
    },
    required: ["action"],
    type: "object",
  },
  name: "todo_list",
};

async function carregar(caminho: string): Promise<TodoItem[]> {
  try {
    const bruto = await readFile(caminho, "utf8");
    const parsed = JSON.parse(bruto) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TodoItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as TodoItem).id === "string" &&
        typeof (item as TodoItem).text === "string",
    );
  } catch {
    return [];
  }
}

async function salvar(caminho: string, items: TodoItem[]): Promise<void> {
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

function formatar(items: TodoItem[]): string {
  if (items.length === 0) return "Checklist vazio.";
  return items.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.id}: ${item.text}`).join("\n");
}

export const todoListTool: ExecutableTool = {
  definition,
  sideEffect: "write",
  async execute(input: JsonObject, context: ToolContext): Promise<ToolResult> {
    const action = typeof input.action === "string" ? input.action : "";
    const caminho = join(context.workspace.root, ARQUIVO);
    const items = await carregar(caminho);

    if (action === "list") {
      return textResult(formatar(items));
    }
    if (action === "clear") {
      await salvar(caminho, []);
      return textResult("Checklist limpo.");
    }
    if (action === "add") {
      const text = typeof input.text === "string" ? input.text.trim() : "";
      if (!text) return errorResult("Informe text para add.");
      const id =
        typeof input.id === "string" && input.id.trim() !== ""
          ? input.id.trim()
          : `t${items.length + 1}`;
      const next = [
        ...items.filter((i) => i.id !== id),
        { done: false, id, text, updatedAt: new Date().toISOString() },
      ];
      await salvar(caminho, next);
      return textResult(`Adicionado ${id}.\n${formatar(next)}`);
    }
    if (action === "done" || action === "remove") {
      const id = typeof input.id === "string" ? input.id.trim() : "";
      if (!id) return errorResult("Informe id.");
      if (action === "remove") {
        const next = items.filter((i) => i.id !== id);
        await salvar(caminho, next);
        return textResult(`Removido ${id}.\n${formatar(next)}`);
      }
      const next = items.map((i) =>
        i.id === id ? { ...i, done: true, updatedAt: new Date().toISOString() } : i,
      );
      if (!items.some((i) => i.id === id)) return errorResult(`Item ${id} não existe.`);
      await salvar(caminho, next);
      return textResult(`Marcado ${id} como feito.\n${formatar(next)}`);
    }
    return errorResult("Ação inválida. Use add|list|done|remove|clear.");
  },
};
