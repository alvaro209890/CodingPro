import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { COMANDOS_CHAT, type ComandoChat } from "../../shared/slash-commands.js";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCommand: (cmd: string) => void;
  /** Catálogo real vindo do main; cai no compartilhado se o IPC ainda não respondeu. */
  comandos?: readonly ComandoChat[] | undefined;
}

function filtrar(catalogo: readonly ComandoChat[], termo: string): ComandoChat[] {
  const t = termo.trim().toLowerCase();
  if (t.length === 0) return [...catalogo];
  return catalogo.filter(
    (c) =>
      c.nome.toLowerCase().includes(t) ||
      c.descricao.toLowerCase().includes(t) ||
      c.aliases.some((a) => a.toLowerCase().includes(t)),
  );
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectCommand,
  comandos = COMANDOS_CHAT,
}) => {
  const [filter, setFilter] = useState("");
  const [selecionado, setSelecionado] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);

  const filtrados = useMemo(() => filtrar(comandos, filter), [comandos, filter]);

  useEffect(() => {
    if (!isOpen) {
      setFilter("");
      setSelecionado(0);
      return;
    }
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    setSelecionado((i) => (i >= filtrados.length ? 0 : i));
  }, [filtrados.length]);

  // Mantém o item selecionado visível ao navegar com as setas.
  useEffect(() => {
    const lista = listaRef.current;
    const item = lista?.children[selecionado] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  if (!isOpen) return null;

  const escolher = (nome: string) => {
    onSelectCommand(nome);
    onClose();
  };

  /**
   * Toda a navegação vive no input: setas movem, Enter escolhe, Esc fecha. Antes só dava
   * para escolher com o mouse (ou tabulando por todos os itens).
   */
  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelecionado((i) => (filtrados.length === 0 ? 0 : (i + 1) % filtrados.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelecionado((i) =>
        filtrados.length === 0 ? 0 : (i - 1 + filtrados.length) % filtrados.length,
      );
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setSelecionado(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setSelecionado(Math.max(0, filtrados.length - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const alvo = filtrados[selecionado];
      if (alvo) escolher(alvo.nome);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay fecha ao clicar fora
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: contêiner do diálogo */}
      <div
        className="modal-card paleta"
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={aoTeclar}
      >
        <div className="paleta-busca">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="paleta-input"
            placeholder="Buscar comando (ex.: desfazer, custo, plano)"
            aria-label="Buscar comando"
            role="combobox"
            aria-expanded="true"
            aria-controls="paleta-lista"
            aria-activedescendant={
              filtrados[selecionado] ? `paleta-item-${selecionado}` : undefined
            }
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <kbd className="paleta-kbd">Esc</kbd>
        </div>

        {filtrados.length === 0 ? (
          <p className="paleta-vazio">Nenhum comando corresponde a “{filter}”.</p>
        ) : (
          <div className="paleta-lista" id="paleta-lista" role="listbox" ref={listaRef}>
            {filtrados.map((cmd, i) => (
              <button
                type="button"
                key={cmd.nome}
                id={`paleta-item-${i}`}
                role="option"
                aria-selected={i === selecionado}
                className={`paleta-item${i === selecionado ? " selected" : ""}`}
                onClick={() => escolher(cmd.nome)}
                onMouseEnter={() => setSelecionado(i)}
              >
                <span className="paleta-item-nome">{cmd.nome}</span>
                <span className="paleta-item-desc">{cmd.descricao}</span>
                {cmd.aceitaArgs && <span className="paleta-item-args">aceita argumento</span>}
              </button>
            ))}
          </div>
        )}

        <div className="paleta-rodape">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>Enter</kbd> executar
          </span>
          <span>
            <kbd>Esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
};
