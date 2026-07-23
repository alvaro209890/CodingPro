import type React from "react";
import { useState } from "react";

interface Subagent {
  id: string;
  label: string;
  status: "running" | "done" | "failed";
}

interface SubagentPanelProps {
  agents: Subagent[];
}

const ROBOT_FRAMES = ["🤖", "🦾", "⚙️", "🧠"];

export const SubagentPanel: React.FC<SubagentPanelProps> = ({ agents }) => {
  const [collapsed, setCollapsed] = useState(false);
  if (agents.length === 0) return null;

  const running = agents.filter((a) => a.status === "running");
  const done = agents.filter((a) => a.status === "done");

  return (
    <div className="subagent-panel">
      <button
        type="button"
        className="subagent-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? "Expandir subagentes" : "Recolher subagentes"}
      >
        {running.length > 0 ? (
          <span className="subagent-icon-pulse">
            {ROBOT_FRAMES[Math.floor(Date.now() / 600) % ROBOT_FRAMES.length]}
          </span>
        ) : (
          <span>🤖</span>
        )}
        <span className="subagent-count">
          {running.length > 0 ? `${running.length} ativo(s)` : `${done.length}/${agents.length}`}
        </span>
        <span className="subagent-chevron">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div className="subagent-list">
          {agents.map((a) => (
            <div
              key={a.id}
              className={`subagent-row ${a.status === "running" ? "running" : a.status === "failed" ? "failed" : ""}`}
            >
              <span className="subagent-icon">
                {a.status === "running" ? "🔄" : a.status === "done" ? "✅" : "❌"}
              </span>
              <span className="subagent-label">{a.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
