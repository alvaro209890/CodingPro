import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  COMANDOS_CHAT,
  type ComandoChat,
  filtrarSugestoes,
  type SugestaoComando,
} from "../../shared/slash-commands.js";

interface FloatingInputDockProps {
  inputPrompt: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  isRunning: boolean;
  autoApprove?: boolean;
  onToggleAutoApprove?: () => void;
  /** Catálogo vindo do main; sem ele caímos no catálogo compartilhado compilado junto. */
  comandos?: readonly ComandoChat[] | undefined;
  branchName?: string | undefined;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    turns: number;
    contextTokens: number;
    contextBudget: number;
  } | null;
}

/** Percentual do orçamento de contexto já consumido, para o medidor da barra. */
function pctContexto(cost: FloatingInputDockProps["cost"]): number | null {
  if (!cost || cost.contextBudget <= 0) return null;
  return Math.min(100, Math.round((cost.contextTokens / cost.contextBudget) * 100));
}

export const FloatingInputDock: React.FC<FloatingInputDockProps> = ({
  inputPrompt,
  onChangeInput,
  onSend,
  onCancel,
  isRunning,
  autoApprove = false,
  onToggleAutoApprove,
  comandos = COMANDOS_CHAT,
  branchName,
  cost = null,
}) => {
  const [sugestoes, setSugestoes] = useState<SugestaoComando[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listaId = useId();

  // biome-ignore lint/correctness/useExhaustiveDependencies: setSelectedIdx é estável
  useEffect(() => {
    const s = filtrarSugestoes(inputPrompt, comandos);
    setSugestoes(s);
    setSelectedIdx((i) => (i >= s.length ? 0 : i));
  }, [inputPrompt, comandos]);

  // Textarea que cresce com o conteúdo, até um teto — digitar um prompt longo não pode
  // ficar preso numa linha só.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o texto é o gatilho do recálculo
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [inputPrompt]);

  const handleAcceptSuggestion = useCallback(
    (sug: SugestaoComando) => {
      onChangeInput(sug.nome + (sug.aceitaArgs ? " " : ""));
      setSugestoes([]);
      textareaRef.current?.focus();
    },
    [onChangeInput],
  );

  /** Abre a lista de comandos a partir do botão — mesma coisa que digitar "/". */
  const abrirComandos = useCallback(() => {
    if (!inputPrompt.startsWith("/")) onChangeInput("/");
    textareaRef.current?.focus();
  }, [inputPrompt, onChangeInput]);

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
        e.preventDefault();
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

  const pct = pctContexto(cost);
  const idSelecionado = sugestoes[selectedIdx] ? `${listaId}-${selectedIdx}` : undefined;

  return (
    <div className="floating-input-dock">
      {sugestoes.length > 0 && (
        <div className="slash-suggestions" id={listaId} role="listbox" aria-label="Comandos">
          {sugestoes.map((s, i) => (
            <div
              key={s.nome}
              id={`${listaId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === selectedIdx}
              className={`slash-suggestion-item${i === selectedIdx ? " selected" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAcceptSuggestion(s);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span className="slash-suggestion-name">{s.nome}</span>
              <span className="slash-suggestion-desc">{s.descricao}</span>
            </div>
          ))}
        </div>
      )}

      <div className="dock-composer">
        <button
          type="button"
          className="dock-plus-btn"
          title="Inserir um comando (ou digite /)"
          aria-label="Inserir um comando"
          onClick={abrirComandos}
        >
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
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          className="dock-textarea"
          placeholder={
            isRunning ? "Aguardando a resposta…" : "Peça uma tarefa, ou digite / para comandos"
          }
          aria-label="Mensagem para o agente"
          value={inputPrompt}
          onChange={(e) => onChangeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isRunning}
          role="combobox"
          aria-expanded={sugestoes.length > 0}
          aria-controls={sugestoes.length > 0 ? listaId : undefined}
          aria-activedescendant={idSelecionado}
        />

        <div className="dock-composer-right">
          {onToggleAutoApprove && (
            <button
              type="button"
              className={`dock-autoapprove-btn ${autoApprove ? "on" : "off"}`}
              aria-pressed={autoApprove}
              title={
                autoApprove
                  ? "Auto-aprovar ligado — escritas e comandos rodam sem pedir permissão"
                  : "Auto-aprovar desligado — cada escrita ou comando pede permissão"
              }
              onClick={onToggleAutoApprove}
            >
              <svg
                aria-hidden="true"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {autoApprove ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 3v18M3 12h18" />}
              </svg>
              <span>Auto-aprovar</span>
            </button>
          )}

          {isRunning ? (
            <button
              type="button"
              className="dock-stop-btn"
              onClick={onCancel}
              aria-label="Parar execução"
              title="Parar (Ctrl+.)"
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className={`dock-send-btn ${inputPrompt.trim() ? "active" : ""}`}
              onClick={onSend}
              disabled={!inputPrompt.trim()}
              aria-label="Enviar mensagem"
              title="Enviar (Enter) · Shift+Enter quebra linha"
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="dock-status-bar">
        <div className="dock-status-left">
          {branchName && (
            <>
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 01-9 9" />
              </svg>
              <span>{branchName}</span>
              <span className="dock-status-sep">·</span>
            </>
          )}
          <span>roda neste computador</span>
        </div>
        <div className="dock-status-right">
          {pct !== null && (
            <span
              title={`Contexto: ${cost?.contextTokens.toLocaleString("pt-BR")} de ${cost?.contextBudget.toLocaleString("pt-BR")} tokens`}
            >
              contexto {pct}%
            </span>
          )}
          {cost && cost.turns > 0 && (
            <>
              <span className="dock-status-sep">·</span>
              <span title={`${cost.inputTokens} tokens de entrada, ${cost.outputTokens} de saída`}>
                US$ {cost.totalCostUsd.toFixed(4)} · {cost.turns}{" "}
                {cost.turns === 1 ? "turno" : "turnos"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
