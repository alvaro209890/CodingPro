import type React from "react";
import { useState } from "react";
import type { ToolItem } from "./ToolSummaryBlock.js";

interface TaskRow {
  id: string;
  label: string;
  status: "running" | "done" | "failed";
  diffAdd?: number;
  diffDel?: number;
}

interface TaskTrackerProps {
  items: TaskRow[];
  /** Se true, mostra "Atualizando tarefas" no cabeçalho */
  isRunning: boolean;
}

function labelForItem(name: string, target?: string): string {
  const t = target && target !== name && target !== "" ? target : "";
  if (name === "read_file") return `Ler ${t || "arquivo"}`;
  if (name === "edit_file") return `Editado ${t || "arquivo"}`;
  if (name === "write_file") return `Criado ${t || "arquivo"}`;
  if (name === "grep") return `Pesquisado ${t || "padrão"}`;
  if (name === "bash") return `Executado ${t || "comando"}`;
  if (name === "list_dir") return `Listado ${t || "diretório"}`;
  if (name === "repo_map") return `Mapa do repositório`;
  if (name === "task") return `Subagentes em paralelo`;
  return `${name} ${t}`.trim();
}

export function toTaskRow(item: ToolItem): TaskRow {
  const row: TaskRow = {
    id: item.id,
    label: labelForItem(item.name, item.target),
    status: item.status === "running" ? "running" : item.status === "failed" ? "failed" : "done",
  };
  if (item.diffAdd !== undefined) row.diffAdd = item.diffAdd;
  if (item.diffDel !== undefined) row.diffDel = item.diffDel;
  return row;
}

export const TaskTracker: React.FC<TaskTrackerProps> = ({ items, isRunning }) => {
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0 && !isRunning) return null;

  const done = items.filter((t) => t.status === "done").length;
  const total = items.length;

  return (
    <div className="task-tracker-card">
      <div className="task-tracker-header">
        <button
          type="button"
          className="task-tracker-collapse"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        <span className="task-tracker-title">
          {isRunning && items.some((t) => t.status === "running")
            ? "Executando tarefas"
            : `${done}/${total} tarefas`}
        </span>
        {isRunning && <span className="task-tracker-spinner" />}
      </div>
      {!collapsed && (
        <div className="task-tracker-list">
          {items.map((item) => (
            <div
              key={item.id}
              className={`task-tracker-row ${item.status === "failed" ? "failed" : ""}`}
            >
              <span className="task-tracker-icon">
                {item.status === "running" ? "…" : item.status === "failed" ? "✗" : "✓"}
              </span>
              <span className="task-tracker-label">{item.label}</span>
              {item.diffAdd !== undefined && item.diffAdd > 0 && (
                <span className="diff-badge-add">+{item.diffAdd}</span>
              )}
              {item.diffDel !== undefined && item.diffDel > 0 && (
                <span className="diff-badge-del">-{item.diffDel}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
