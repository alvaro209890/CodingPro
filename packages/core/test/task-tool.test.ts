import type { ToolResult } from "@codingpro/llm";
import { describe, expect, it } from "vitest";
import type { SubagenteRelatorio, SubagenteSpawner } from "../src/subagent.js";
import type { ToolContext } from "../src/tool.js";
import { taskTool } from "../src/tools/task.js";

function texto(result: ToolResult): string {
  return (result as { value: string }).value;
}

function spawnerFake(chamadas: { tipo: string; prompt: string }[]): SubagenteSpawner {
  return {
    async executar(tipo, prompt): Promise<SubagenteRelatorio> {
      chamadas.push({ prompt, tipo });
      return {
        finishReason: "stop",
        interrompido: false,
        passos: 1,
        texto: `relatorio de ${tipo}: ${prompt}`,
        tipo,
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
    maxParalelo: 2,
    tiposDisponiveis: ["explorer", "reviewer"],
  };
}

describe("taskTool", () => {
  it("é leitura e delega as tarefas ao spawner, consolidando", async () => {
    const chamadas: { tipo: string; prompt: string }[] = [];
    const context: ToolContext = {
      subagentes: spawnerFake(chamadas),
      workspace: {} as ToolContext["workspace"],
    };
    const r = await taskTool.execute(
      {
        tarefas: [
          { prompt: "revise a", tipo: "reviewer" },
          { prompt: "explore b", tipo: "explorer" },
        ],
      },
      context,
    );
    expect(taskTool.sideEffect).toBe("read");
    expect(chamadas).toHaveLength(2);
    const t = texto(r);
    expect(t).toContain("Subagente 1 — reviewer");
    expect(t).toContain("relatorio de reviewer: revise a");
    expect(t).toContain("Subagente 2 — explorer");
  });

  it("usa concorrência padrão quando maxParalelo é ausente", async () => {
    const chamadas: { tipo: string; prompt: string }[] = [];
    const base = spawnerFake(chamadas);
    const semMax: SubagenteSpawner = {
      executar: base.executar,
      tiposDisponiveis: base.tiposDisponiveis,
    };
    const context: ToolContext = { subagentes: semMax, workspace: {} as ToolContext["workspace"] };
    const r = await taskTool.execute(
      { tarefas: [{ prompt: "só uma", tipo: "explorer" }] },
      context,
    );
    expect((r as { value: string }).value).toContain("Subagente 1 — explorer");
  });

  it("erro quando subagentes indisponíveis", async () => {
    const r = await taskTool.execute(
      { tarefas: [{ prompt: "x", tipo: "explorer" }] },
      { workspace: {} as ToolContext["workspace"] },
    );
    expect(r.type).toBe("error-text");
  });

  it("aceita alias em inglês tasks/type", async () => {
    const chamadas: { tipo: string; prompt: string }[] = [];
    const context: ToolContext = {
      subagentes: spawnerFake(chamadas),
      workspace: {} as ToolContext["workspace"],
    };
    const r = await taskTool.execute(
      {
        tasks: [{ prompt: "revise a", type: "reviewer" }],
      },
      context,
    );
    expect(chamadas).toEqual([{ prompt: "revise a", tipo: "reviewer" }]);
    expect(texto(r)).toContain("Subagente 1 — reviewer");
  });

  it("recusa tipo desconhecido e entrada inválida", async () => {
    const context: ToolContext = {
      subagentes: spawnerFake([]),
      workspace: {} as ToolContext["workspace"],
    };
    expect(
      (await taskTool.execute({ tarefas: [{ prompt: "x", tipo: "nao-existe" }] }, context)).type,
    ).toBe("error-text");
    expect((await taskTool.execute({ tarefas: [] }, context)).type).toBe("error-text");
    expect((await taskTool.execute({}, context)).type).toBe("error-text");
  });
});
