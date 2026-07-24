import type { RefObject } from "react";
import { Banner } from "./Banner.js";
import type { Session } from "./PlaygroundTypes.js";
import { SlashDropdown } from "./SlashDropdown.js";
import { type TaskRow, TaskTrackerCard } from "./TaskTrackerCard.js";
import { ThinkingBalloon, ThinkingFold } from "./ThinkingBalloon.js";

interface ChatViewProps {
  session: Session | null;
  stream: string;
  loading: boolean;
  input: string;
  showCmds: boolean;
  statusText?: string;
  elapsedMs?: number;
  reasoning?: string;
  tasks?: TaskRow[];
  scrollRef: RefObject<HTMLDivElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  stickToBottom?: boolean;
  onJumpBottom?: () => void;
  onInput: (val: string) => void;
  onShowCmds: (show: boolean) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onSelectCmd: (cmd: string, fullInput: string) => void;
}

const CMD_SLASH = [
  { cmd: "/clear", desc: "Limpar mensagens" },
  { cmd: "/new", desc: "Novo chat" },
  { cmd: "/list", desc: "Listar chats" },
  { cmd: "/switch <id>", desc: "Trocar chat" },
  { cmd: "/delete <id>", desc: "Deletar chat" },
  { cmd: "/rename <nome>", desc: "Renomear chat" },
  { cmd: "/export", desc: "Exportar como .md" },
  { cmd: "/history", desc: "Histórico de comandos" },
  { cmd: "/context", desc: "Arquivos no workspace" },
  { cmd: "/agent <prompt>", desc: "Modo agente AI" },
  { cmd: "/memory", desc: "Salvar contexto em memory" },
  { cmd: "/help", desc: "Exibir todos os comandos" },
];

export function ChatView({
  session,
  stream,
  loading,
  input,
  showCmds,
  statusText = "",
  elapsedMs = 0,
  reasoning = "",
  tasks = [],
  scrollRef,
  textareaRef,
  stickToBottom = true,
  onJumpBottom,
  onInput,
  onShowCmds,
  onKeyDown,
  onSend,
  onSelectCmd,
}: ChatViewProps) {
  if (!session) return null;
  const msgs = session.mensagens;
  const hasMessages = msgs.length > 0;
  const isStreaming = stream.length > 0;
  const showLive = loading || isStreaming || tasks.length > 0;

  return (
    <div className="playground__chat">
      <div ref={scrollRef} className="playground__messages">
        {!hasMessages && !showLive && (
          <Banner
            onSelectSuggestion={(prompt) => {
              if (prompt.startsWith("/")) {
                const parts = prompt.split(" ");
                onSelectCmd(parts[0] ?? "", prompt);
              } else {
                onInput(prompt);
                setTimeout(() => textareaRef.current?.focus(), 50);
              }
            }}
          />
        )}

        {msgs.map((m) => (
          <article key={m.id} className={`playground__msg playground__msg--${m.role}`}>
            <div className="playground__msgMeta">
              <span className="playground__msgRole">
                {m.role === "user" ? "Você" : m.role === "system" ? "Sistema" : "CodingPro"}
              </span>
              <time className="playground__msgTime" dateTime={new Date(m.timestamp).toISOString()}>
                {new Date(m.timestamp).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>

            <div className="playground__msgBubble">
              {m.thinking && <ThinkingFold thinking={m.thinking} />}
              <div className="playground__msgContent">{m.content}</div>

              {m.tools && m.tools.length > 0 && (
                <div className="playground__msgToolsContainer">
                  {m.tools.map((t) => (
                    <details
                      key={`${m.id}-${t.nome}-${t.result.slice(0, 24)}`}
                      className="playground__msgToolTag"
                    >
                      <summary className="playground__msgToolName">{t.nome}</summary>
                      {t.result && (
                        <pre className="playground__msgToolOutput">{t.result.slice(0, 800)}</pre>
                      )}
                    </details>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}

        {showLive && (
          <div className="playground__liveTurn">
            {loading && (
              <ThinkingBalloon
                loading={loading}
                statusText={statusText}
                elapsedMs={elapsedMs}
                reasoning={reasoning}
              />
            )}
            {tasks.length > 0 && <TaskTrackerCard tasks={tasks} isRunning={loading} />}
            {isStreaming && (
              <article className="playground__msg playground__msg--assistant playground__streaming">
                <div className="playground__msgMeta">
                  <span className="playground__msgRole">CodingPro</span>
                  <span className="playground__msgStreamingLabel">gerando…</span>
                </div>
                <div className="playground__msgBubble">
                  <div className="playground__msgContent">
                    {stream}
                    <span className="playground__streamingCursor">▍</span>
                  </div>
                </div>
              </article>
            )}
          </div>
        )}
      </div>

      {!stickToBottom && (
        <button type="button" className="playground__jumpBottom" onClick={onJumpBottom}>
          ↓ Nova resposta
        </button>
      )}

      <div className="playground__inputArea">
        {showCmds && input.startsWith("/") && (
          <SlashDropdown
            filter={input}
            commands={CMD_SLASH}
            onSelect={onSelectCmd}
            currentInput={input}
          />
        )}
        <div className="playground__inputRow">
          <textarea
            ref={textareaRef as RefObject<HTMLTextAreaElement>}
            value={input}
            onChange={(e) => {
              onInput(e.target.value);
              onShowCmds(e.target.value.startsWith("/") && e.target.value.length <= 16);
              const t = e.target;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
            }}
            onKeyDown={onKeyDown}
            placeholder="Mensagem ou /comando…"
            rows={1}
            className="playground__textarea"
            disabled={loading}
          />
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            type="button"
            className="playground__sendBtn"
            title="Enviar"
          >
            {loading ? "…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
