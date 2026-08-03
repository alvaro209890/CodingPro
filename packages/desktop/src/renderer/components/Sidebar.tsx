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

function formatRelative(updatedAt?: string): string {
  if (!updatedAt) return "";
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return updatedAt;
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
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
  return (
    <aside className="sidebar">
      <div className="sidebar-actions">
        <button type="button" className="sidebar-action-btn new-chat" onClick={onNewSession}>
          <svg
            aria-hidden="true"
            width="15"
            height="15"
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
          onClick={() => onSelectTab("code")}
          title="Buscar (Ctrl+K)"
        >
          <svg
            aria-hidden="true"
            width="15"
            height="15"
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
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          Workspace
        </button>
        <button
          type="button"
          className={`sidebar-action-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => onSelectTab(activeTab === "settings" ? "code" : "settings")}
        >
          <svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Customize
        </button>
      </div>

      {settingsPanel && activeTab === "settings" ? (
        <div className="sidebar-settings">{settingsPanel}</div>
      ) : (
        <>
          <div className="sidebar-section-header">
            <span>Agents</span>
          </div>

          <div className="sidebar-recent-list">
            {recentSessions.map((session) => (
              <button
                type="button"
                key={session.id}
                className={`recent-item ${session.active ? "active" : ""}`}
                onClick={() => onSelectSession(session.id)}
              >
                <span className="recent-icon" aria-hidden="true">
                  {session.isRunning ? (
                    <span className="session-running-dot" />
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <title>Voltar</title>
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                  )}
                </span>
                <span className="recent-title">{session.title}</span>
                <span className="recent-time">{formatRelative(session.updatedAt)}</span>
              </button>
            ))}
          </div>

          <div className="sidebar-footer">
            <div className="sidebar-user-badge">
              <div className="user-avatar">Á</div>
              <div className="sidebar-user-meta">
                <span className="sidebar-user-name">Álvaro Emanuel</span>
                <span className="sidebar-user-plan">Pro Plan</span>
              </div>
              <button
                type="button"
                className="sidebar-gear"
                title="Configurações"
                onClick={() => onSelectTab("settings")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <title>Configurações</title>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
