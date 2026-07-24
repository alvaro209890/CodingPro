import type { Session } from "./PlaygroundTypes.js";

interface SidebarProps {
  sessions: Session[];
  activeId: string | null;
  sidebarOpen: boolean;
  renameId: string | null;
  renameVal: string;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, val: string) => void;
  onDelete: (id: string) => void;
  onCancelRename: () => void;
  onStartRename: (id: string, currentName: string) => void;
  userEmail: string;
  mobile?: boolean;
}

export function Sidebar({
  sessions,
  activeId,
  sidebarOpen,
  renameId,
  renameVal,
  onToggle,
  onClose,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onCancelRename,
  onStartRename,
  userEmail,
  mobile = false,
}: SidebarProps) {
  const sidebarContent = (
    <div className="playground__sidebar">
      <div className="playground__sidebar-header">
        <div className="playground__sidebarTitle">
          <span className="playground__sidebarIcon">💬</span>
          <span>Sessões AI</span>
          <span className="playground__sessionBadge">{sessions.length}</span>
        </div>
        <div className="playground__sidebarHeaderBtnGroup">
          <button
            onClick={onNew}
            type="button"
            className="playground__btnNewSession"
            title="Novo Chat"
            aria-label="Novo chat"
          >
            <span>+</span> Novo
          </button>
          {mobile && (
            <button
              onClick={onClose}
              type="button"
              className="playground__btnCloseSidebar"
              aria-label="Fechar sidebar"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="playground__sidebar-list">
        {sessions.length === 0 ? (
          <div className="playground__sidebarEmpty">
            <span style={{ fontSize: "1.5rem", display: "block", marginBottom: "0.5rem" }}>💬</span>
            Nenhum chat ainda. Clique em "+ Novo" para começar!
          </div>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === activeId;
            return (
              <div
                key={s.id}
                className={`playground__session ${isActive ? "playground__session-ativo" : ""}`}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect(s.id);
                }}
                tabIndex={0}
                role="button"
                aria-selected={isActive}
              >
                <div className="playground__sessionIndicator" />
                <div className="playground__sessionInfo">
                  {renameId === s.id ? (
                    <input
                      value={renameVal}
                      onChange={(e) => onRename(s.id, e.target.value)}
                      onBlur={() => onCancelRename()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onCancelRename();
                        if (e.key === "Escape") onCancelRename();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="playground__renameInput"
                      autoFocus
                    />
                  ) : (
                    <>
                      <div className="playground__sessionName">{s.nome}</div>
                      <div className="playground__sessionMeta">
                        <span>{s.mensagens.length} msgs</span>
                        <span>·</span>
                        <span>
                          {new Date(s.criadaEm).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div className="playground__sessionActions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartRename(s.id, s.nome);
                    }}
                    title="Renomear"
                    type="button"
                    className="playground__sessionActionBtn"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Deletar '${s.nome}'?`)) onDelete(s.id);
                    }}
                    title="Deletar"
                    type="button"
                    className="playground__sessionActionBtn playground__sessionDelete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="playground__sidebarFooter">
        <div className="playground__userAvatar">
          <span className="playground__userOnlineDot" />
          <span>{userEmail ? userEmail.split("@")[0] : "Usuário"}</span>
        </div>
        <div className="playground__userFullEmail">{userEmail}</div>
      </div>
    </div>
  );

  if (mobile) {
    return (
      <>
        {sidebarOpen && <div className="playground__overlay" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} role="presentation" />}
        <div className={`playground__sidebar-mobile ${sidebarOpen ? "playground__sidebar-aberta" : ""}`}>
          {sidebarContent}
        </div>
      </>
    );
  }

  return sidebarContent;
}