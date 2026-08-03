import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

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
  onToggleTerminal?: () => void;
  isTerminalOpen?: boolean;
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
  onToggleTerminal,
  isTerminalOpen = false,
  branchName = "master",
  modelName = "DeepSeek V4 Flash",
  effortLevel = "Auto",
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

      {onToggleTerminal && (
        <div className="dock-terminals-row">
          <button type="button" className="dock-terminals-pill" onClick={onToggleTerminal}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <title>Terminal</title>
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            {isTerminalOpen ? "Terminal" : "Terminals"}
          </button>
        </div>
      )}

      <div className="dock-composer">
        <button type="button" className="dock-plus-btn" title="Anexar / comandos" tabIndex={-1}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <title>Anexar</title>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          onPaste={onImagePaste ? handleImagePaste(onImagePaste) : undefined}
          className="dock-textarea"
          placeholder="Send follow-up"
          value={inputPrompt}
          onChange={(e) => onChangeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isRunning}
        />

        <div className="dock-composer-right">
          {onToggleAutoApprove && (
            <button
              type="button"
              className={`dock-autoapprove-btn ${autoApprove ? "on" : "off"}`}
              title={
                autoApprove
                  ? "Auto-aprovar ligado — comandos de escrita/edição rodam sem pedir permissão"
                  : "Auto-aprovar desligado — comandos pedem permissão antes de executar"
              }
              onClick={onToggleAutoApprove}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {autoApprove ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 3v18M3 12h18" />}
              </svg>
              <span>Auto-aprovar</span>
            </button>
          )}

          <button
            type="button"
            className="dock-model-chip"
            title={`${modelName}${effortLevel ? ` · esforço ${effortLevel}` : ""}`}
          >
            {modelName}
            {effortLevel ? ` · ${effortLevel}` : ""}
          </button>

          {isRunning ? (
            <button
              type="button"
              className="dock-stop-btn"
              onClick={onCancel}
              title="Parar (Ctrl+.)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <title>Parar</title>
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
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <title>Enviar</title>
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="dock-status-bar">
        <div className="dock-status-left">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <title>Status</title>
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          <span>{branchName}</span>
          <span className="dock-status-sep">·</span>
          <span>This PC</span>
        </div>
        <div className="dock-status-right">
          {cost && cost.turns > 0 && (
            <span>
              US$ {cost.totalCostUsd.toFixed(4)} · {cost.turns}t
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
