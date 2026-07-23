import type React from "react";

interface FloatingInputDockProps {
  inputPrompt: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  isRunning: boolean;
  branchName?: string;
  modelName?: string;
  effortLevel?: string;
}

export const FloatingInputDock: React.FC<FloatingInputDockProps> = ({
  inputPrompt,
  onChangeInput,
  onSend,
  onCancel,
  isRunning,
  branchName = "master",
  modelName = "DeepSeek V4",
  effortLevel = "Alto",
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isRunning) onSend();
    }
    if (e.key === "Escape" && isRunning && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="floating-input-dock">
      <div className="dock-git-row">
        <div className="git-branch-info">
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          <span style={{ color: "var(--accent-blue)" }}>{branchName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Ctrl+K paleta · Ctrl+. cancela
          </span>
        </div>
      </div>

      <div className="dock-textarea-row">
        <textarea
          className="dock-textarea"
          placeholder="O que deseja construir? (ex: liste os arquivos, /ajuda, /custo...)"
          value={inputPrompt}
          onChange={(e) => onChangeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isRunning}
        />
        {isRunning ? (
          <button
            type="button"
            className="dock-send-btn active"
            onClick={onCancel}
            title="Cancelar (Ctrl+.)"
            style={{ background: "var(--accent-red, #ef4444)" }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className={`dock-send-btn ${inputPrompt.trim() ? "active" : ""}`}
            onClick={onSend}
            disabled={!inputPrompt.trim()}
            title="Enviar (Enter)"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>

      <div className="dock-toolbar-row">
        <div className="toolbar-left">
          <div className="toolbar-badge">
            <svg
              aria-hidden="true"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Automático
          </div>
        </div>

        <div className="toolbar-right">
          <div className="model-selector">
            <span>{modelName}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{effortLevel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
