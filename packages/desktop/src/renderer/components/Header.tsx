import type React from "react";

interface HeaderProps {
  title: string;
  projectName: string;
  onToggleTerminal?: () => void;
  onCancel?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onToggleTerminal,
  onCancel,
}) => {
  return (
    <header className="top-header">
      <div className="header-title-container">
        <span>{title}</span>
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
            Stop
          </button>
        )}
        <button
          type="button"
          className="header-icon-btn"
          onClick={onToggleTerminal}
          title="Terminal / IDE"
        >
          IDE
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ marginLeft: 4 }}
          >
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      </div>
    </header>
  );
};
