import type React from "react";

interface RuntimeStatusRowProps {
  /** ms since run started */
  elapsedMs: number;
  totalTokens: number;
  steps: number;
  thinkingMs: number;
  isRunning: boolean;
}

function formatTime(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1_000);
  return `${mins}m ${secs}s`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1_000) return `${tokens}`;
  return `${(tokens / 1_000).toFixed(1)}k`;
}

export const RuntimeStatusRow: React.FC<RuntimeStatusRowProps> = ({
  elapsedMs,
  totalTokens,
  steps,
  thinkingMs,
  isRunning,
}) => (
  <div className="runtime-status-row">
    {isRunning ? (
      <span className="runtime-status-icon running" />
    ) : (
      <span className="runtime-status-icon done" />
    )}
    <span className="runtime-status-text">
      {formatTime(elapsedMs)} · {formatTokens(totalTokens)} tokens · {steps} steps
      {thinkingMs > 0 && <> · pensou por {formatTime(thinkingMs)}</>}
      {isRunning ? <> · <span className="runtime-status-running-text">executando</span></> : ""}
    </span>
  </div>
);
