import type React from "react";

interface SidebarProps {
  activeTab: "home" | "code";
  onSelectTab: (tab: "home" | "code") => void;
  recentSessions: { id: string; title: string; active?: boolean }[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onChooseWorkspace: () => void;
  workspacePath: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  recentSessions,
  onSelectSession,
  onNewSession,
  onChooseWorkspace,
  workspacePath,
}) => {
  const shortPath = workspacePath.length > 36 ? `…${workspacePath.slice(-34)}` : workspacePath;

  return (
    <aside className="sidebar">
      <div className="sidebar-top-tabs">
        <button
          type="button"
          className={`sidebar-tab ${activeTab === "home" ? "active" : ""}`}
          onClick={() => onSelectTab("home")}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Início
        </button>

        <button
          type="button"
          className={`sidebar-tab ${activeTab === "code" ? "active" : ""}`}
          onClick={() => onSelectTab("code")}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Code
        </button>
      </div>

      <div className="sidebar-actions">
        <button type="button" className="sidebar-action-btn new-chat" onClick={onNewSession}>
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Novo
        </button>

        <button
          type="button"
          className="sidebar-action-btn"
          onClick={onChooseWorkspace}
          title={workspacePath}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          Pasta
        </button>
      </div>

      <div
        style={{
          padding: "4px 14px 10px",
          fontSize: 10,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          lineHeight: 1.35,
          wordBreak: "break-all",
        }}
        title={workspacePath}
      >
        {shortPath}
      </div>

      <div className="sidebar-section-header">
        <span>Recentes</span>
      </div>

      <div className="sidebar-recent-list">
        {recentSessions.map((session, index) => (
          <button
            type="button"
            key={session.id}
            className={`recent-item ${session.active ? "active" : ""}`}
            onClick={() => onSelectSession(session.id)}
            style={{
              all: "unset",
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            <span className="recent-number">{index + 1}</span>
            <span title={session.title}>{session.title}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user-badge">
          <div className="user-avatar">Á</div>
          <span>IMAP · Pro</span>
        </div>
      </div>
    </aside>
  );
};
