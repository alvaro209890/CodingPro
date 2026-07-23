import React, { useState } from "react";

interface FloatingInputDockProps {
  inputPrompt: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  isRunning: boolean;
  branchName?: string;
  additions?: number;
  deletions?: number;
  modelName?: string;
  effortLevel?: string;
  onSelectModel?: (model: string) => void;
  onSelectEffort?: (effort: string) => void;
}

export const FloatingInputDock: React.FC<FloatingInputDockProps> = ({
  inputPrompt,
  onChangeInput,
  onSend,
  isRunning,
  branchName = "master",
  additions = 259,
  deletions = 90,
  modelName = "DeepSeek V4",
  effortLevel = "Alto",
}) => {
  const [showBanner, setShowBanner] = useState(true);

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
          <span>CodingPro</span>
          <span style={{ color: "var(--accent-blue)" }}>{branchName}</span>
          <span className="diff-badge-add">+{additions}</span>
          <span className="diff-badge-del">-{deletions}</span>
        </div>
        <button type="button" className="git-pr-btn">
          Criar PR
        </button>
      </div>

      {/* Banner de Limite de Sessao */}
      {showBanner && (
        <div className="dock-banner-row">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>⏱ Próximo do limite de uso da sessão. Redefine às 12:00</span>
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
          placeholder="Digite seu pedido (ex: crie um componente ou refatore as rotas)..."
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
            <polyline points="9 10 4 15 9 20" />
            <path d="M20 4v7a4 4 0 01-4 4H4" />
          </svg>
        </button>
      </div>

      {/* Toolbar Inferior */}
      <div className="dock-toolbar-row">
        <div className="toolbar-left">
          <div className="toolbar-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Automático
          </div>

          <button type="button" className="toolbar-icon-btn" title="Adicionar Contexto/Arquivo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button type="button" className="toolbar-icon-btn" title="Entrada por Voz">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          </button>

          <button type="button" className="toolbar-icon-btn" title="Anexar Arquivo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
        </div>

        <div className="toolbar-right">
          <div className="model-selector">
            <span>{modelName}</span>
            <span style={{ opacity: 0.7 }}>{effortLevel}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
