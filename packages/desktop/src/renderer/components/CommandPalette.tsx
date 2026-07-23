import type React from "react";
import { useEffect, useRef, useState } from "react";

interface CommandItem {
  command: string;
  description: string;
}

const COMMANDS: CommandItem[] = [
  { command: "/ajuda", description: "Lista comandos e atalhos disponíveis." },
  { command: "/limpar", description: "Limpa o histórico da conversa atual." },
  { command: "/custo", description: "Exibe o custo acumulado de tokens da sessão." },
  { command: "/desfazer", description: "Desfaz o último checkpoint de escrita." },
  { command: "/refazer", description: "Refaz um checkpoint desfeito." },
  { command: "/checkpoint", description: "Lista checkpoints recentes." },
  { command: "/cancelar", description: "Cancela a execução em andamento." },
  { command: "/review", description: "Pede revisão de código ao agente." },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCommand: (cmd: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectCommand,
}) => {
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFilter("");
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    // foco sem autoFocus attribute (biome a11y)
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = COMMANDS.filter(
    (c) =>
      c.command.toLowerCase().includes(filter.toLowerCase()) ||
      c.description.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay fecha ao clicar fora
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: 600, padding: 16 }}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingBottom: 12,
            borderBottom: "1px solid var(--border-subtle)",
          }}
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
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Digite um comando (ex: /plano, /desfazer)..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
            }}
          />
          <span
            style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            ESC para fechar
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 300,
            overflowY: "auto",
            paddingTop: 8,
          }}
        >
          {filtered.map((cmd) => (
            <button
              type="button"
              key={cmd.command}
              onClick={() => {
                onSelectCommand(cmd.command);
                onClose();
              }}
              className="recent-item"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: 8,
                cursor: "pointer",
                border: "none",
                background: "transparent",
                color: "inherit",
                textAlign: "left",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--accent-blue)",
                    fontWeight: 600,
                  }}
                >
                  {cmd.command}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {cmd.description}
                </span>
              </div>
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
