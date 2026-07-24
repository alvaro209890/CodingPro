import { useState } from "react";

interface ThinkingBalloonProps {
  loading: boolean;
  statusText: string;
  elapsedMs: number;
  /** Texto bruto de reasoning (pode ser longo). */
  reasoning?: string;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/** Painel de pensamento ao vivo — recolhido por padrão, só aparece durante a geração. */
export function ThinkingBalloon({
  loading,
  statusText,
  elapsedMs,
  reasoning = "",
}: ThinkingBalloonProps) {
  const [open, setOpen] = useState(false);

  if (!loading) return null;

  const temReasoning = reasoning.trim().length > 0;

  return (
    <div className="playground__thinkingBalloon">
      <button
        type="button"
        className="playground__thinkingHeader"
        onClick={() => temReasoning && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!temReasoning}
      >
        <span className="playground__thinkingPulse" aria-hidden />
        <span className="playground__thinkingTitle">{statusText || "Pensando…"}</span>
        <span className="playground__thinkingTimerBadge">{formatTime(elapsedMs)}</span>
        {temReasoning && (
          <span className="playground__thinkingToggle">{open ? "ocultar" : "ver raciocínio"}</span>
        )}
      </button>

      {open && temReasoning && <pre className="playground__thinkingBody">{reasoning.trim()}</pre>}
    </div>
  );
}

/** Bloco de pensamento já gravado na mensagem (estilo ChatGPT). */
export function ThinkingFold({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false);
  if (!thinking.trim()) return null;

  return (
    <div className="playground__thinkingFold">
      <button
        type="button"
        className="playground__thinkingFoldBtn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} Pensamento
      </button>
      {open && <pre className="playground__thinkingFoldBody">{thinking.trim()}</pre>}
    </div>
  );
}
