import type React from "react";
import type { EstadoAcesso } from "../../types/electron.js";

export interface SessionRow {
  id: string;
  title: string;
  active?: boolean;
  updatedAt?: string;
  isRunning?: boolean;
}

interface SidebarProps {
  activeTab: "code" | "settings";
  onSelectTab: (tab: "code" | "settings") => void;
  recentSessions: SessionRow[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onChooseWorkspace: () => void;
  onOpenPalette: () => void;
  onLogout?: () => void;
  workspacePath: string;
  projectName: string;
  acesso: EstadoAcesso | null;
  settingsPanel?: React.ReactNode;
}

/** Rótulo relativo curto ("agora", "12 min", "3 h", "5 d") para a lista de sessões. */
export function rotuloRelativo(updatedAt?: string): string {
  if (!updatedAt) return "";
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return "";
  const seg = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (seg < 45) return "agora";
  if (seg < 3600) return `${Math.round(seg / 60)} min`;
  if (seg < 86_400) return `${Math.round(seg / 3600)} h`;
  return `${Math.round(seg / 86_400)} d`;
}

/** Texto curto do modo de acesso, sem inventar plano nem nome de usuário. */
function descreverAcesso(acesso: EstadoAcesso | null): { titulo: string; detalhe: string } {
  if (acesso?.modo === "conta") {
    return { detalhe: "conectado", titulo: "CodingPro Cloud" };
  }
  if (acesso?.modo === "chave-propria") {
    return { detalhe: "chave própria do ambiente", titulo: "Modo avançado" };
  }
  return { detalhe: "entre para começar", titulo: "Sem acesso" };
}

const IconeNova = () => (
  <svg
    aria-hidden="true"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const IconeBusca = () => (
  <svg
    aria-hidden="true"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const IconePasta = () => (
  <svg
    aria-hidden="true"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
  >
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

const IconeAjustes = () => (
  <svg
    aria-hidden="true"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  recentSessions,
  onSelectSession,
  onNewSession,
  onChooseWorkspace,
  onOpenPalette,
  onLogout,
  workspacePath,
  projectName,
  acesso,
  settingsPanel,
}) => {
  const conta = descreverAcesso(acesso);
  const emConfiguracoes = activeTab === "settings";

  return (
    <aside className="sidebar" aria-label="Navegação principal">
      <div className="sidebar-actions">
        <button type="button" className="sidebar-action-btn new-chat" onClick={onNewSession}>
          <IconeNova />
          Nova conversa
        </button>
        <button
          type="button"
          className="sidebar-action-btn"
          onClick={onOpenPalette}
          title="Paleta de comandos (Ctrl+K)"
        >
          <IconeBusca />
          Comandos
          <kbd className="sidebar-kbd">Ctrl K</kbd>
        </button>
        <button
          type="button"
          className="sidebar-action-btn"
          onClick={onChooseWorkspace}
          title={`Pasta aberta: ${workspacePath}`}
        >
          <IconePasta />
          <span className="sidebar-action-truncate">{projectName}</span>
        </button>
        <button
          type="button"
          className={`sidebar-action-btn ${emConfiguracoes ? "active" : ""}`}
          onClick={() => onSelectTab(emConfiguracoes ? "code" : "settings")}
          aria-pressed={emConfiguracoes}
        >
          <IconeAjustes />
          Configurações
        </button>
      </div>

      {settingsPanel && emConfiguracoes ? (
        <div className="sidebar-settings">{settingsPanel}</div>
      ) : (
        <>
          <div className="sidebar-section-header">
            <span>Conversas</span>
            {recentSessions.length > 0 && (
              <span className="sidebar-section-count">{recentSessions.length}</span>
            )}
          </div>

          {recentSessions.length === 0 ? (
            <p className="sidebar-empty">
              Nenhuma conversa ainda. Envie uma mensagem para começar.
            </p>
          ) : (
            <nav className="sidebar-recent-list" aria-label="Conversas recentes">
              {recentSessions.map((session) => (
                <button
                  type="button"
                  key={session.id}
                  className={`recent-item ${session.active ? "active" : ""}`}
                  onClick={() => onSelectSession(session.id)}
                  aria-current={session.active ? "true" : undefined}
                  title={session.title}
                >
                  <span className="recent-icon" aria-hidden="true">
                    {session.isRunning ? (
                      <span className="session-running-dot" />
                    ) : (
                      <svg
                        aria-hidden="true"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                    )}
                  </span>
                  <span className="recent-title">{session.title}</span>
                  <span className="recent-time">{rotuloRelativo(session.updatedAt)}</span>
                </button>
              ))}
            </nav>
          )}

          <div className="sidebar-footer">
            <div className="sidebar-conta">
              <span
                className={`sidebar-conta-status ${acesso?.modo === "sem-acesso" ? "off" : "on"}`}
                aria-hidden="true"
              />
              <span className="sidebar-conta-texto">
                <span className="sidebar-conta-titulo">{conta.titulo}</span>
                <span className="sidebar-conta-detalhe">{conta.detalhe}</span>
              </span>
              {onLogout && acesso?.modo === "conta" && (
                <button
                  type="button"
                  className="sidebar-conta-sair"
                  onClick={onLogout}
                  title="Desconectar esta máquina da conta"
                >
                  Sair
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
