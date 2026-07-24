import { useMemo, useState } from "react";

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

function iconeDoPasso(texto: string, ativo: boolean, concluido: boolean): string {
  if (concluido) return "✓";
  if (ativo) return "◎";
  const t = texto.toLowerCase();
  if (t.includes("ferramenta") || t.includes("executando") || t.includes("🔧")) return "⚙";
  if (t.includes("concluído") || t.includes("concluida")) return "✓";
  if (t.includes("planej")) return "◈";
  if (t.includes("analis")) return "◉";
  return "·";
}

export function ThinkingBalloon({
  loading,
  statusText,
  elapsedMs,
  thinkingSteps = [],
}: ThinkingBalloonProps) {
  const [collapsed, setCollapsed] = useState(false);
  const passos = useMemo(() => thinkingSteps.filter(Boolean), [thinkingSteps]);

  if (!loading && passos.length === 0) return null;

  const titulo = loading
    ? statusText?.replace(/^🔧\s*/, "") || "Raciocinando..."
    : "Raciocínio concluído";

  return (
    <div
      className={`playground__thinkingBalloon ${loading ? "playground__thinkingBalloon--live" : "playground__thinkingBalloon--done"}`}
      aria-live="polite"
      aria-busy={loading}
    >
      <div className="playground__thinkingAura" aria-hidden="true" />

      <header className="playground__thinkingHeader">
        <div className="playground__thinkingTitleGroup">
          <span className="playground__thinkingOrb" aria-hidden="true" />
          <div className="playground__thinkingTitleBlock">
            <span className="playground__thinkingKicker">Raciocínio da IA</span>
            <span className="playground__thinkingTitle">{titulo}</span>
          </div>
          <span className="playground__thinkingTimerBadge">{formatTime(elapsedMs)}</span>
        </div>

        <div className="playground__thinkingControls">
          {loading && <span className="playground__thinkingSpinner" aria-hidden="true" />}
          {passos.length > 0 && (
            <button
              type="button"
              className="playground__thinkingCollapseBtn"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
            >
              {collapsed ? "Mostrar" : "Ocultar"}
            </button>
          )}
        </div>
      </header>

      {loading && (
        <div className="playground__thinkingProgress" aria-hidden="true">
          <span className="playground__thinkingProgressBar" />
        </div>
      )}

      {!collapsed && (passos.length > 0 || loading) && (
        <div className="playground__thinkingBody">
          <ol className="playground__thinkingTimeline">
            {passos.map((step, i) => {
              const ultimo = i === passos.length - 1;
              const ativo = loading && ultimo;
              const concluido = !ativo && (!loading || !ultimo);
              return (
                <li
                  key={`${step}-${ultimo ? "u" : "p"}-${ativo ? "a" : "i"}`}
                  className={`playground__thinkingStep ${ativo ? "playground__thinkingStep--active" : ""} ${concluido ? "playground__thinkingStep--done" : ""}`}
                >
                  <span className="playground__thinkingStepIcon" aria-hidden="true">
                    {iconeDoPasso(step, ativo, concluido)}
                  </span>
                  <span className="playground__thinkingStepText">{step}</span>
                </li>
              );
            })}
          </ol>

          {loading && (
            <div className="playground__thinkingPulseLine">
              <span className="playground__thinkingPulseDot" />
              <span className="playground__thinkingPulseDot" />
              <span className="playground__thinkingPulseDot" />
              <span className="playground__thinkingStatusText">
                {statusText || "Processando contexto e planejando próximos passos..."}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
