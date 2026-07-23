import React from "react";

interface SidebarProps {
  activeTab: "home" | "code";
  onSelectTab: (tab: "home" | "code") => void;
  recentSessions: { id: string; title: string; active?: boolean }[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  workspacePath: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  recentSessions,
  onSelectSession,
  onNewSession,
  workspacePath,
}) => {
  return (
    <aside className="sidebar">
      {/* Tab bar no topo */}
      <div className="sidebar-top-tabs">
        <button
          type="button"
          className={`sidebar-tab ${activeTab === "home" ? "active" : ""}`}
          onClick={() => onSelectTab("home")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Início
        </button>

        <button
          type="button"
          className={`sidebar-tab ${activeTab === "code" ? "active" : ""}`}
          onClick={() => onSelectTab("code")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Code
        </button>
      </div>

      {/* Acoes principais */}
      <div className="sidebar-actions">
        <button type="button" className="sidebar-action-btn new-chat" onClick={onNewSession}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Novo
        </button>

        <button type="button" className="sidebar-action-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          </svg>
          Artefatos
        </button>

        <button type="button" className="sidebar-action-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Personalizar
        </button>

        <button type="button" className="sidebar-action-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Mais
        </button>
      </div>

      {/* Recentes */}
      <div className="sidebar-section-header">
        <span>Recentes</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14l-1.5-7a4.5 4.5 0 10-11 0L5 17z" />
        </svg>
      </div>

      <div className="sidebar-recent-list">
        {recentSessions.map((session, index) => (
          <div
            key={session.id}
            className={`recent-item ${session.active ? "active" : ""}`}
            onClick={() => onSelectSession(session.id)}
          >
            <span className="recent-number">{index + 1}</span>
            <span title={session.title}>{session.title}</span>
          </div>
        ))}
      </div>

      {/* Profile Bar Rodape */}
      <div className="sidebar-footer">
        <div className="sidebar-user-badge">
          <div className="user-avatar">Á</div>
          <span>IMAP · Pro</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M2 12h20" />
        </svg>
      </div>
    </aside>
  );
};
