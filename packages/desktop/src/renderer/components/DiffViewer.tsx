import type { PreviaEscrita } from "@codingpro/core";
import type React from "react";

interface DiffViewerProps {
  previa?: PreviaEscrita;
  onApprove?: () => void;
  onReject?: () => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ previa, onApprove, onReject }) => {
  if (!previa) {
    return (
      <div
        className="diff-viewer-empty"
        style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}
      >
        Nenhuma alteração de código para visualizar.
      </div>
    );
  }

  const linesAntes = previa.antes.split("\n");
  const linesDepois = previa.depois.split("\n");

  return (
    <div
      className="diff-viewer-card"
      style={{
        background: "var(--bg-app)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        overflow: "hidden",
        margin: "12px 0",
      }}
    >
      <div
        className="diff-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border-subtle)",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>{previa.path}</span>
          <span className="diff-badge-add">+{linesDepois.length}</span>
          <span className="diff-badge-del">-{linesAntes.length}</span>
        </div>

        {onApprove && onReject && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-deny"
              onClick={onReject}
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              Rejeitar
            </button>
            <button
              type="button"
              className="btn btn-allow"
              onClick={onApprove}
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              Aplicar Diff
            </button>
          </div>
        )}
      </div>

      <div
        className="diff-lines-container"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          padding: 12,
          maxHeight: 280,
          overflowY: "auto",
          lineHeight: 1.5,
        }}
      >
        {linesDepois.map((line) => (
          <div
            key={`+${line}`}
            style={{
              background: "rgba(34, 197, 94, 0.12)",
              color: "var(--green-add)",
              padding: "2px 8px",
              borderRadius: 2,
              display: "flex",
              gap: 12,
            }}
          >
            <span style={{ width: 24, opacity: 0.5, userSelect: "none" }}>+</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
