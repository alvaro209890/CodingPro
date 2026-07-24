import { useState } from "react";

export interface TaskRow {
  id: string;
  name: string;
  target?: string;
  status: "running" | "done" | "failed";
  result?: string;
  diffAdd?: number;
  diffDel?: number;
}

interface TaskTrackerCardProps {
  tasks: TaskRow[];
  isRunning: boolean;
}

function labelForTask(name: string, target?: string): string {
  const t = target && target !== name && target !== "" ? target : "";
  switch (name) {
    case "read_file":
      return `Ler ${t || "arquivo"}`;
    case "edit_file":
    case "replace_file_content":
    case "multi_replace_file_content":
      return `Editado ${t || "arquivo"}`;
    case "write_file":
    case "write_to_file":
      return `Criado ${t || "arquivo"}`;
    case "grep":
    case "grep_search":
      return `Pesquisado ${t || "padrão"}`;
    case "bash":
    case "terminal":
    case "run_command":
      return `Executado ${t || "comando"}`;
    case "list_dir":
      return `Listado ${t || "diretório"}`;
    case "task":
      return `Subagentes em paralelo`;
    case "git":
      return `Comando Git ${t}`;
    case "memory":
      return `Contexto de Memória ${t}`;
    default:
      return `${name} ${t}`.trim();
  }
}

export function TaskTrackerCard({ tasks, isRunning }: TaskTrackerCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0 && !isRunning) return null;

  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const hasRunning = tasks.some((t) => t.status === "running");

  return (
    <div className="playground__taskTrackerCard">
      <div className="playground__taskTrackerHeader">
        <button
          type="button"
          className="playground__taskTrackerCollapseBtn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expandir tarefas" : "Recolher tarefas"}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        <span className="playground__taskTrackerTitle">
          {isRunning && hasRunning
            ? `Executando tarefas (${done}/${total} concluídas)`
            : `${done}/${total} tarefas concluídas`}
        </span>
        {isRunning && <span className="playground__taskTrackerSpinner" />}
      </div>

      {!collapsed && (
        <div className="playground__taskTrackerList">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`playground__taskTrackerRow playground__taskTrackerRow--${task.status}`}
            >
              <span className="playground__taskTrackerIcon">
                {task.status === "running" ? "…" : task.status === "failed" ? "✗" : "✓"}
              </span>
              <span className="playground__taskTrackerLabel">
                {labelForTask(task.name, task.target)}
              </span>

              {task.diffAdd !== undefined && task.diffAdd > 0 && (
                <span className="playground__diffBadgeAdd">+{task.diffAdd}</span>
              )}
              {task.diffDel !== undefined && task.diffDel > 0 && (
                <span className="playground__diffBadgeDel">-{task.diffDel}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
