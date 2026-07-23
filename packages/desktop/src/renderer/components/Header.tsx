import type React from "react";

interface HeaderProps {
  title: string;
  projectName: string;
  onToggleTerminal?: () => void;
  onCancel?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  projectName,
  onToggleTerminal,
  onCancel,
}) => {
  return (
    <header className="top-header">
      <div className="header-title-container">
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span>{title}</span>
        <span className="header-project-tag">{projectName}</span>
      </div>

      <div className="header-actions">
        {onCancel && (
          <button
            type="button"
            className="header-icon-btn"
            onClick={onCancel}
            title="Cancelar execução (Ctrl+.)"
            style={{ color: "#f87171" }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="header-icon-btn"
          onClick={onToggleTerminal}
          title="Alternar Terminal Integrado"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
      </div>
    </header>
  );
};
