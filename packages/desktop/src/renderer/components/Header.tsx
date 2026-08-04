import type React from "react";
import { formatarSaldoUsd, type SaldoContaUI } from "../../shared/saldo-conta.js";

interface HeaderProps {
  title: string;
  projectName: string;
  workspacePath: string;
  branch?: string | undefined;
  /** Saldo da conta Cloud (badge); sem valor até a 1ª resposta do proxy. */
  saldoConta?: SaldoContaUI;
  isRunning: boolean;
  isTerminalOpen: boolean;
  onToggleTerminal: () => void;
  onCancel?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  projectName,
  workspacePath,
  branch,
  saldoConta,
  isRunning,
  isTerminalOpen,
  onToggleTerminal,
  onCancel,
}) => (
  <header className="top-header">
    <div className="header-title-container">
      {/* O projeto aberto é a informação mais importante do cabeçalho: define o que o
          agente enxerga. Antes chegava como prop e não era renderizado. */}
      <span className="header-projeto" title={workspacePath}>
        {projectName}
      </span>
      {branch && (
        <span className="header-branch" title={`Branch git: ${branch}`}>
          <svg
            aria-hidden="true"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          {branch}
        </span>
      )}
      <span className="header-sep" aria-hidden="true">
        /
      </span>
      <span className="header-conversa">{title}</span>
    </div>

    <div className="header-actions">
      {saldoConta?.saldoMicro != null && (
        <span
          className="header-saldo"
          title="Saldo de créditos da conta CodingPro Cloud (atualiza a cada resposta do proxy)"
        >
          Saldo: {formatarSaldoUsd(saldoConta.saldoMicro)}
        </span>
      )}
      {isRunning && onCancel && (
        <button
          type="button"
          className="header-btn header-btn--parar"
          onClick={onCancel}
          title="Cancelar execução (Ctrl+.)"
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Parar
        </button>
      )}
      <button
        type="button"
        className={`header-btn ${isTerminalOpen ? "active" : ""}`}
        onClick={onToggleTerminal}
        aria-pressed={isTerminalOpen}
        title={isTerminalOpen ? "Fechar o terminal integrado" : "Abrir o terminal integrado"}
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        Terminal
      </button>
    </div>
  </header>
);
