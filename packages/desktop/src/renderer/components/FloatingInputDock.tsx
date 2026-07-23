import type React from "react";
import { useState } from "react";

interface FloatingInputDockProps {
  inputPrompt: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  isRunning: boolean;
  branchName?: string;
  modelName?: string;
  effortLevel?: string;
}

export const FloatingInputDock: React.FC<FloatingInputDockProps> = ({
  inputPrompt,
  onChangeInput,
  onSend,
  isRunning,
  branchName = "master",
  modelName = "DeepSeek V4",
  effortLevel = "Alto",
}) => {
  const [showBanner, setShowBanner] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="floating-input-dock">
      {/* Git row */}
      <div className="dock-git-row">
        <div className="git-branch-info">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          <span style={{ color: "var(--accent-blue)" }}>{branchName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Ctrl+K paleta
          </span>
        </div>
      </div>

      {/* Banner (desativado por padrão) */}
      {showBanner && (
        <div className="dock-banner-row">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>⏱ Próximo do limite de uso da sessão</span>
            <span className="banner-action-link">Fazer Upgrade</span>
          </div>
          <span
            style={{ cursor: "pointer", opacity: 0.7 }}
            onClick={() => setShowBanner(false)}
          >
            ✕
          </span>
        </div>
      )}

      {/* Textarea Input */}
      <div className="dock-textarea-row">
        <textarea
          className="dock-textarea"
          placeholder="O que deseja construir? (ex: crie um componente de login, refatore as rotas, execute os testes...)"
          value={inputPrompt}
          onChange={(e) => onChangeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isRunning}
        />
        <button
          type="button"
          className={`dock-send-btn ${inputPrompt.trim() && !isRunning ? "active" : ""}`}
          onClick={onSend}
          disabled={!inputPrompt.trim() || isRunning}
          title="Enviar (Enter)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {/* Toolbar */}
      <div className="dock-toolbar-row">
        <div className="toolbar-left">
          <div className="toolbar-badge">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
