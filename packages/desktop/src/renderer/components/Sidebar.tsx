import type React from "react";

interface SidebarProps {
  activeTab: "code" | "settings";
  onSelectTab: (tab: "code" | "settings") => void;
  recentSessions: {
    id: string;
    title: string;
    active?: boolean;
    updatedAt?: string;
    isRunning?: boolean;
  }[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onChooseWorkspace: () => void;
  workspacePath: string;
  settingsPanel?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  recentSessions,
  onSelectSession,
  onNewSession,
  onChooseWorkspace,
  workspacePath,
  settingsPanel,
}) => {
  const shortPath = workspacePath.length > 36 ? `…${workspacePath.slice(-34)}` : workspacePath;

  return (
    <aside className="sidebar">
      <div className="sidebar-top-tabs">
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
        <button
          type="button"
          className={`sidebar-tab ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => onSelectTab("settings")}
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Config
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
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Agent
        </button>
        <button
          type="button"
          className="sidebar-action-btn"
          onClick={onNewSession}
          title="Buscar sessões (Ctrl+K)"
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
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          Search
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

        <button
          type="button"
          className="sidebar-action-btn pc-mode"
          onClick={onNewSession}
          title="Modo PC — acesso total ao sistema"
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
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          PC
        </button>
      </div>

      {settingsPanel && activeTab === "settings" ? (
        <div className="sidebar-settings">{settingsPanel}</div>
      ) : (
        <>
          <div
            style={{
              padding: "4px 14px 10px",
              fontSize: 10,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              wordBreak: "break-all",
            }}
            title={workspacePath}
          >
            {shortPath}
          </div>

          <div className="sidebar-section-header">
            <span>Recent</span>
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
                  gap: 10,
                  width: "100%",
                  cursor: "pointer",
                  boxSizing: "border-box",
                  padding: "6px 12px",
                  borderRadius: 6,
                }}
              >
                <span className="recent-number">{index + 1}</span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {session.isRunning && (
                      <span className="session-running-dot" title="Em execução" />
                    )}
                    {session.title}
                  </div>
                  {session.updatedAt && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                      {session.updatedAt}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="sidebar-footer">
            <div className="sidebar-user-badge">
              <div className="user-avatar">Á</div>
              <span>Álvaro Emanuel · Pro Plan</span>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
