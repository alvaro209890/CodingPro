import { useState } from "react";

interface ThinkingBalloonProps {
  loading: boolean;
  statusText: string;
  elapsedMs: number;
  thinkingSteps?: string[];
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function ThinkingBalloon({
  loading,
  statusText,
  elapsedMs,
  thinkingSteps = [],
}: ThinkingBalloonProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!loading && thinkingSteps.length === 0) return null;

  return (
    <div className="playground__thinkingBalloon playground__card-rotating-border">
      <div className="playground__thinkingHeader">
        <div className="playground__thinkingTitleGroup">
          <span className="playground__thinkingBrainIcon">🧠</span>
          <span className="playground__thinkingTitle">
            {loading ? statusText || "Pensando..." : "Pensamento concluído"}
          </span>
          <span className="playground__thinkingTimerBadge">{formatTime(elapsedMs)}</span>
        </div>

        <div className="playground__thinkingControls">
          {loading && <span className="playground__thinkingSpinner" />}
          {thinkingSteps.length > 0 && (
            <button
              type="button"
              className="playground__thinkingCollapseBtn"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? "Expandir raciocínio" : "Recolher raciocínio"}
            >
              {collapsed ? "▶ Raciocínio" : "▼ Raciocínio"}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (thinkingSteps.length > 0 || loading) && (
        <div className="playground__thinkingBody">
          {thinkingSteps.map((step) => (
            <div key={step} className="playground__thinkingStepRow">
              <span className="playground__thinkingStepDot">▸</span>
              <span>{step}</span>
            </div>
          ))}

          {loading && (
            <div className="playground__thinkingPulseLine">
              <span className="playground__thinkingPulseDot" />
              <span className="playground__thinkingPulseDot" />
              <span className="playground__thinkingPulseDot" />
              <span className="playground__thinkingStatusText">
                {statusText || "Analisando contexto e planejando ações..."}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
