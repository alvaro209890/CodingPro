import type { CSSProperties, ReactNode } from "react";
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
        <span>💬 Chats</span>
        <button onClick={onNew} type="button" aria-label="Novo chat">+</button>
        <button onClick={onClose} type="button" aria-label="Fechar sidebar">✕</button>
      </div>
      <div className="playground__sidebar-list">
        {sessions.length === 0 && (
          <div className="playground__sidebarEmpty">Nenhum chat ainda. Use o botão "+ Novo" para criar.</div>
        )}
        {sessions.map((s) => (
            <div
              key={s.id}
              className={`playground__session${s.id === activeId ? " playground__session-ativo" : ""}`}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => { if (e.key === "Enter") onSelect(s.id); }}
              tabIndex={0}
              role="button"
            >
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
                  style={{
                    background: "var(--fundo)",
                    border: "1px solid var(--esmeralda)",
                    borderRadius: "3px",
                    color: "var(--esmeralda)",
                    fontSize: "0.7rem",
                    padding: "0.1rem 0.2rem",
                    width: "100%",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              ) : (
                <>
                  <div className="playground__sessionName">{s.nome}</div>
                  <div className="playground__sessionMeta">
                    {s.mensagens.length} msgs ·{" "}
                    {new Date(s.criadaEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </div>
                </>
              )}
            </div>
            <div className="playground__sessionActions">
              <button onClick={(e) => { e.stopPropagation(); onStartRename(s.id, s.nome); }} title="Renomear" type="button">✎</button>
              <button onClick={(e) => { e.stopPropagation(); if (confirm(`Deletar '${s.nome}'?`)) onDelete(s.id); }} title="Deletar" type="button" className="playground__sessionDelete">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="playground__sidebarFooter">{userEmail}</div>
    </div>
  );

  if (mobile) {
    return (
      <>
        {sidebarOpen && <div className="playground__overlay" onClick={onClose} />}
        <div className={`playground__sidebar-mobile${sidebarOpen ? " playground__sidebar-aberta" : ""}`}>
          {sidebarContent}
        </div>
      </>
    );
  }

  return sidebarContent;
}