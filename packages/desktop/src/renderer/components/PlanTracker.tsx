import type React from "react";

export interface PlanTask {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
}

interface PlanTrackerProps {
  tasks: PlanTask[];
  isRunning: boolean;
}

export const PlanTracker: React.FC<PlanTrackerProps> = ({ tasks, isRunning }) => {
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="plan-tracker-card">
      <div className="plan-tracker-header">
        <span className="plan-tracker-title">
          {isRunning && done < tasks.length
            ? `Plano: ${done}/${tasks.length}`
            : `Plano: ${done}/${tasks.length} concluído`}
        </span>
      </div>
      <div className="plan-tracker-list">
        {tasks.map((t) => (
          <div
            key={t.id}
            className={`plan-tracker-row ${t.status === "failed" ? "failed" : t.status === "running" ? "running" : ""}`}
          >
            <span className="plan-tracker-icon">
              {t.status === "done"
                ? "✓"
                : t.status === "failed"
                  ? "✗"
                  : t.status === "running"
                    ? "…"
                    : "○"}
            </span>
            <span className="plan-tracker-label">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
