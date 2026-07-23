import type React from "react";
import { useEffect, useRef, useState, useCallback } from "react";

interface ComandoChat {
  readonly nome: string;
  readonly aliases: readonly string[];
  readonly descricao: string;
  readonly aceitaArgs: boolean;
}

interface SugestaoComando {
  readonly nome: string;
  readonly descricao: string;
  readonly aceitaArgs: boolean;
  readonly match: string;
}

const COMANDOS_CHAT: readonly ComandoChat[] = Object.freeze([
  {
    nome: "/ajuda",
    aliases: ["/help"],
    descricao: "lista os comandos disponíveis",
    aceitaArgs: false,
  },
  {
    nome: "/abrir",
    aliases: ["/open", "/workspace"],
    descricao: "abre pasta do projeto",
    aceitaArgs: true,
  },
  { nome: "/pwd", aliases: [], descricao: "mostra a pasta aberta agora", aceitaArgs: false },
  {
    nome: "/custo",
    aliases: ["/cost", "/gasto"],
    descricao: "custo e tokens da sessão",
    aceitaArgs: false,
  },
  {
    nome: "/compact",
    aliases: ["/compactar"],
    descricao: "compacta o histórico",
    aceitaArgs: false,
  },
  {
    nome: "/limpar",
    aliases: ["/clear", "/nova", "/new"],
    descricao: "nova sessão",
    aceitaArgs: false,
  },
  {
    nome: "/desfazer",
    aliases: ["/undo"],
    descricao: "desfaz edições ([N] passos)",
    aceitaArgs: true,
  },
  { nome: "/refazer", aliases: ["/redo"], descricao: "refaz edições ([N])", aceitaArgs: true },
  {
    nome: "/checkpoint",
    aliases: ["/checkpoints"],
    descricao: "linha do tempo",
    aceitaArgs: false,
  },
  { nome: "/mapa", aliases: ["/map"], descricao: "repo map", aceitaArgs: false },
  {
    nome: "/lembrar",
    aliases: ["/remember"],
    descricao: "salva fato na memória",
    aceitaArgs: true,
  },
  { nome: "/init", aliases: [], descricao: "gera CODINGPRO.md", aceitaArgs: true },
  { nome: "/plan", aliases: ["/plano"], descricao: "plano interativo", aceitaArgs: true },
  { nome: "/review", aliases: [], descricao: "revisão de código", aceitaArgs: true },
  { nome: "/cancelar", aliases: ["/stop"], descricao: "cancela execução", aceitaArgs: false },
]);

function tokenComando(buffer: string): string | undefined {
  if (!buffer.startsWith("/")) return undefined;
  const espaco = buffer.indexOf(" ");
  return espaco === -1 ? buffer : undefined;
}

function filtrarSugestoes(
  buffer: string,
  catalogo: readonly ComandoChat[] = COMANDOS_CHAT,
): SugestaoComando[] {
  const token = tokenComando(buffer);
  if (token === undefined) return [];
  const lower = token.toLowerCase();
  const out: SugestaoComando[] = [];
  for (const cmd of catalogo) {
    const candidatos = [cmd.nome, ...cmd.aliases];
    for (const c of candidatos) {
      if (c.toLowerCase().startsWith(lower)) {
        out.push({
          aceitaArgs: cmd.aceitaArgs,
          descricao: cmd.descricao,
          match: c,
          nome: cmd.nome,
        });
        break;
      }
    }
  }
  return out;
}

interface FloatingInputDockProps {
  inputPrompt: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  onImagePaste?: (base64: string) => void;
  isRunning: boolean;
  autoApprove?: boolean;
  onToggleAutoApprove?: () => void;
  branchName?: string;
  modelName?: string;
  effortLevel?: string;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    turns: number;
    contextTokens: number;
    contextBudget: number;
  } | null;
}

/** Handler de colagem de imagem: converte para base64 e chama callback. */
function handleImagePaste(cb: (b64: string) => void) {
  return async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const b64 = (reader.result as string).split(",")[1];
          if (b64) cb(b64);
        };
        reader.readAsDataURL(blob);
        e.preventDefault();
        return;
      }
    }
  };
}

export const FloatingInputDock: React.FC<FloatingInputDockProps> = ({
  inputPrompt,
  onChangeInput,
  onSend,
  onCancel,
  onImagePaste,
  isRunning,
  autoApprove = false,
  onToggleAutoApprove,
  branchName = "master",
  modelName = "DeepSeek V4",
  effortLevel = "Alto",
  cost = null,
}) => {
  const [sugestoes, setSugestoes] = useState<SugestaoComando[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const s = filtrarSugestoes(inputPrompt);
    setSugestoes(s);
    if (s.length === 0) setSelectedIdx(0);
    else if (selectedIdx >= s.length) setSelectedIdx(0);
  }, [inputPrompt, selectedIdx]);

  const handleAcceptSuggestion = useCallback(
    (sug: SugestaoComando) => {
      onChangeInput(sug.nome + (sug.aceitaArgs ? " " : ""));
      setSugestoes([]);
      textareaRef.current?.focus();
    },
    [onChangeInput],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugestoes.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % sugestoes.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + sugestoes.length) % sugestoes.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const s = sugestoes[selectedIdx];
        if (s) handleAcceptSuggestion(s);
        return;
      }
      if (e.key === "Escape") {
        setSugestoes([]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isRunning) onSend();
    }
    if (e.key === "Escape" && isRunning && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="floating-input-dock">
      {sugestoes.length > 0 && (
        <div className="slash-suggestions" role="listbox">
          {sugestoes.map((s, i) => (
            <div
              key={s.nome}
              role="option"
              aria-selected={i === selectedIdx}
              tabIndex={-1}
              className={`slash-suggestion-item${i === selectedIdx ? " selected" : ""}`}
              onMouseDown={() => handleAcceptSuggestion(s)}
            >
              <span className="slash-suggestion-name">{s.nome}</span>
              <span className="slash-suggestion-desc">{s.descricao}</span>
            </div>
          ))}
        </div>
      )}

      <div className="dock-git-row">
        <div className="git-branch-info">
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          <span style={{ color: "var(--accent-blue)" }}>{branchName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {cost && cost.turns > 0 && (
            <span
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                background: "rgba(56,189,248,0.08)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              US$ {cost.totalCostUsd.toFixed(4)} · {cost.turns}t
              {cost.contextTokens > 0 && (
                <> · {Math.round((cost.contextTokens / cost.contextBudget) * 100)}% ctx</>
              )}
            </span>
          )}
          <span
            style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Ctrl+K paleta · Ctrl+. cancela · / sugere
          </span>
        </div>
      </div>

      <div className="dock-textarea-row">
        <textarea
          ref={textareaRef}
          onPaste={onImagePaste ? handleImagePaste(onImagePaste) : undefined}
          className="dock-textarea"
          placeholder="O que deseja construir? (ex: liste os arquivos, /ajuda, /custo, /abrir...)"
          value={inputPrompt}
          onChange={(e) => onChangeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isRunning}
        />
        {isRunning ? (
          <button
            type="button"
            className="dock-send-btn active"
            onClick={onCancel}
            title="Cancelar (Ctrl+.)"
            style={{ background: "var(--accent-red, #ef4444)" }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className={`dock-send-btn ${inputPrompt.trim() ? "active" : ""}`}
            onClick={onSend}
            disabled={!inputPrompt.trim()}
            title="Enviar (Enter)"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>

      <div className="dock-toolbar-row">
        <div className="toolbar-left">
          <div className="toolbar-badge">
            <svg
              aria-hidden="true"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Automático
          </div>
          {onToggleAutoApprove && (
            <button
              type="button"
              className={`toolbar-badge ${autoApprove ? "auto-approve-on" : ""}`}
              onClick={onToggleAutoApprove}
              title={autoApprove ? "Auto-aprovar LIGADO" : "Auto-aprovar desligado"}
              style={{
                marginLeft: 4,
                background: autoApprove ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                border: autoApprove
                  ? "1px solid rgba(34,197,94,0.35)"
                  : "1px solid rgba(255,255,255,0.08)",
                color: autoApprove ? "var(--accent-green)" : "var(--text-muted)",
                cursor: "pointer",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 10.5,
                fontFamily: "var(--font-mono)",
              }}
            >
              {autoApprove ? "✓ Auto" : "Auto"}
            </button>
          )}
        </div>

        <div className="toolbar-right">
          <div className="model-selector">
            <span>{modelName}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{effortLevel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
