import type { UsageSnapshotUi } from "@codingpro/core";
import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  COMANDOS_CHAT,
  type ComandoChat,
  filtrarSugestoes,
  type SugestaoComando,
} from "../../shared/slash-commands.js";
import type { EstadoAcesso, UpdateStateUI } from "../../types/electron.js";

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
  cost?: UsageSnapshotUi | null;
  projectName: string;
  workspacePath: string;
  modelName: string;
  effort: string;
  acesso: EstadoAcesso | null;
  appVersion?: string | undefined;
  updateState?: UpdateStateUI | null;
  onCheckUpdate?: (() => void) | undefined;
  onDownloadUpdate?: (() => void) | undefined;
  onInstallUpdate?: (() => void) | undefined;
}

/** Percentual do orçamento de contexto já consumido, para o medidor da barra. */
function pctContexto(cost: FloatingInputDockProps["cost"]): number | null {
  if (!cost || cost.contextBudget <= 0) return null;
  return Math.min(100, Math.round((cost.contextTokens / cost.contextBudget) * 100));
}

/** Cache-hit % da sessão (D1): tokens de cache / tokens de entrada. */
function pctCacheHit(cost: FloatingInputDockProps["cost"]): number | null {
  if (!cost || cost.inputTokens <= 0) return null;
  return Math.min(100, Math.round((cost.cacheReadTokens / cost.inputTokens) * 100));
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
  projectName,
  workspacePath,
  modelName,
  effort,
  acesso,
  appVersion,
  updateState,
  onCheckUpdate,
  onDownloadUpdate,
  onInstallUpdate,
}) => {
  const [sugestoes, setSugestoes] = useState<SugestaoComando[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listaId = useId();
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!statusOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!statusRef.current?.contains(event.target as Node)) setStatusOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatusOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
    };
  }, [statusOpen]);

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
  const cachePct = pctCacheHit(cost);
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

      <div className="dock-status-wrap" ref={statusRef}>
        <button
          type="button"
          className="dock-status-bar"
          onClick={() => setStatusOpen((value) => !value)}
          aria-expanded={statusOpen}
          aria-haspopup="dialog"
          title="Abrir detalhes da execução, uso e atualização"
        >
          <span className="dock-status-left">
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
          </span>
          <span className="dock-status-right">
            {pct !== null && (
              <span
                title={`Contexto: ${cost?.contextTokens.toLocaleString("pt-BR")} de ${cost?.contextBudget.toLocaleString("pt-BR")} tokens`}
              >
                {cost?.estimated ? "≈ " : ""}contexto {pct}%
              </span>
            )}
            {cost && cost.turns > 0 && (
              <>
                <span className="dock-status-sep">·</span>
                <span
                  title={`${cost.inputTokens} tokens de entrada, ${cost.outputTokens} de saída${cachePct !== null ? `, cache-hit ${cachePct}%` : ""}`}
                >
                  {cost.estimated ? "≈ " : ""}US$ {cost.totalCostUsd.toFixed(4)}
                  {cachePct !== null ? ` · cache ${cachePct}%` : ""} · {cost.turns}{" "}
                  {cost.turns === 1 ? "turno" : "turnos"}
                </span>
              </>
            )}
          </span>
        </button>
        {statusOpen && (
          <section className="dock-status-popover" role="dialog" aria-label="Detalhes da sessão">
            <header>
              <span>Detalhes da sessão</span>
              <button type="button" onClick={() => setStatusOpen(false)} aria-label="Fechar">
                ×
              </button>
            </header>
            <dl className="status-detail-grid">
              <div>
                <dt>Projeto</dt>
                <dd>{projectName}</dd>
              </div>
              <div className="wide">
                <dt>Pasta</dt>
                <dd title={workspacePath}>{workspacePath}</dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{branchName ?? "Sem Git"}</dd>
              </div>
              <div>
                <dt>Execução</dt>
                <dd>Local neste computador</dd>
              </div>
              <div>
                <dt>Contexto usado</dt>
                <dd>
                  {cost
                    ? `${cost.estimated ? "≈ " : ""}${cost.contextTokens.toLocaleString("pt-BR")} (${pct ?? 0}%)`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Contexto restante</dt>
                <dd>
                  {cost
                    ? Math.max(0, cost.contextBudget - cost.contextTokens).toLocaleString("pt-BR")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Custo</dt>
                <dd>
                  {cost ? `${cost.estimated ? "≈ " : ""}US$ ${cost.totalCostUsd.toFixed(6)}` : "—"}
                </dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>
                  {cost
                    ? `${cost.inputTokens.toLocaleString("pt-BR")} in · ${cost.outputTokens.toLocaleString("pt-BR")} out`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Cache-hit</dt>
                <dd>
                  {cost
                    ? `${cachePct ?? 0}% (${cost.cacheReadTokens.toLocaleString("pt-BR")} tok)`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Raciocínio</dt>
                <dd>
                  {cost ? cost.reasoningTokens.toLocaleString("pt-BR") : "—"}
                </dd>
              </div>
              <div>
                <dt>Turnos / chamadas</dt>
                <dd>{cost ? `${cost.turns} · ${cost.apiCalls}` : "—"}</dd>
              </div>
              <div>
                <dt>Subagentes</dt>
                <dd>{cost?.subagentCalls ?? 0}</dd>
              </div>
              <div>
                <dt>Modelo / esforço</dt>
                <dd>
                  {modelName} · {effort}
                </dd>
              </div>
              <div>
                <dt>Conta Cloud</dt>
                <dd>
                  {acesso?.modo === "conta"
                    ? "Conectada"
                    : acesso?.modo === "chave-propria"
                      ? "Chave própria (dev)"
                      : "Desconectada"}
                </dd>
              </div>
              <div>
                <dt>Versão</dt>
                <dd>{appVersion ?? "—"}</dd>
              </div>
            </dl>
            <div className={`status-update-card ${updateState?.status ?? "idle"}`}>
              <div>
                <strong>Atualizações</strong>
                <span>
                  {updateState?.status === "available"
                    ? `Versão ${updateState.availableVersion} disponível`
                    : updateState?.status === "downloading"
                      ? `Baixando ${Math.round(updateState.progress ?? 0)}%`
                      : updateState?.status === "downloaded"
                        ? `Versão ${updateState.availableVersion} pronta para instalar`
                        : updateState?.status === "checking"
                          ? "Verificando…"
                          : updateState?.status === "error"
                            ? updateState.error
                            : "Aplicativo atualizado"}
                </span>
              </div>
              {updateState?.status === "available" && onDownloadUpdate ? (
                <button type="button" onClick={onDownloadUpdate}>
                  {updateState.mode === "portable" ? "Abrir download" : "Baixar agora"}
                </button>
              ) : updateState?.status === "downloaded" && onInstallUpdate ? (
                <button type="button" onClick={onInstallUpdate}>
                  Reiniciar e instalar
                </button>
              ) : onCheckUpdate && updateState?.status !== "downloading" ? (
                <button type="button" onClick={onCheckUpdate}>
                  Verificar
                </button>
              ) : null}
            </div>
            {cost && cost.sources.length > 0 && (
              <details className="status-usage-sources">
                <summary>Uso por fonte</summary>
                {cost.sources.map((source) => (
                  <div key={source.source}>
                    <span>{source.source}</span>
                    <span>
                      {source.apiCalls} chamadas · {source.inputTokens + source.outputTokens} tok ·
                      US$ {source.costUsd.toFixed(6)}
                    </span>
                  </div>
                ))}
              </details>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
