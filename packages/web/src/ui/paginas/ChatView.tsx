import type { RefObject } from "react";
import { renderMarkdown } from "../MarkdownRenderer.js";
import { Banner } from "./Banner.js";
import type { Session } from "./PlaygroundTypes.js";
import { SlashDropdown } from "./SlashDropdown.js";
import { type TaskRow, TaskTrackerCard } from "./TaskTrackerCard.js";
import { ThinkingBalloon } from "./ThinkingBalloon.js";

interface ChatViewProps {
  session: Session | null;
  stream: string;
  loading: boolean;
  input: string;
  showCmds: boolean;
  statusText?: string;
  elapsedMs?: number;
  thinkingSteps?: string[];
  tasks?: TaskRow[];
  cmdHistory?: string[];
  histIdx?: number;
  pendingInput?: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
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

function ConteudoMensagem({ role, content }: { role: string; content: string }) {
  if (role === "assistant") {
    return (
      // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown da IA
      <div
        className="playground__msgContent playground__msgContent--md"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    );
  }
  return <div className="playground__msgContent">{content}</div>;
}

export function ChatView({
  session,
  stream,
  loading,
  input,
  showCmds,
  statusText = "",
  elapsedMs = 0,
  thinkingSteps = [],
  tasks = [],
  scrollRef,
  textareaRef,
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

  return (
    <div className="playground__chat">
      <div ref={scrollRef} className="playground__messages">
        {!hasMessages && !stream && !loading && (
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
          <div
            key={`${m.role}-${m.timestamp ?? 0}-${m.content.slice(0, 48)}`}
            className={`playground__msg playground__msg--${m.role}`}
          >
            <div className={`playground__msgHeader playground__msgHeader-${m.role}`}>
              <span className="playground__msgBadge">
                {m.role === "user"
                  ? "Você"
                  : m.role === "system"
                    ? "Sistema"
                    : "CodingPro AI"}
              </span>
              <span className="playground__msgTime">
                {new Date(m.timestamp ?? Date.now()).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="playground__msgBubble">
              <ConteudoMensagem role={m.role} content={m.content} />

              {m.tools && m.tools.length > 0 && (
                <div className="playground__msgToolsContainer">
                  <div className="playground__msgToolsHeader">Ferramentas executadas</div>
                  {m.tools.map((t, i) => (
                    <details
                      key={`${t.nome}-${i}`}
                      className="playground__msgToolDetails"
                      open={i === m.tools!.length - 1}
                    >
                      <summary className="playground__msgToolSummary">
                        <span className="playground__msgToolName">{t.nome}</span>
                        <span className="playground__msgToolHint">
                          {t.result ? `${t.result.length} chars` : "sem saída"}
                        </span>
                      </summary>
                      {t.result && <pre className="playground__msgToolPre">{t.result}</pre>}
                    </details>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {(loading || thinkingSteps.length > 0) && (
          <ThinkingBalloon
            loading={loading}
            statusText={statusText}
            elapsedMs={elapsedMs}
            thinkingSteps={thinkingSteps}
          />
        )}

        {tasks.length > 0 && <TaskTrackerCard tasks={tasks} isRunning={loading} />}

        {isStreaming && (
          <div className="playground__msg playground__msg--assistant playground__streaming">
            <div className="playground__msgHeader playground__msgHeader-assistant">
              <span className="playground__msgBadge">CodingPro AI</span>
              <span className="playground__msgStreamingLabel">respondendo...</span>
            </div>
            <div className="playground__msgBubble">
              <div
                className="playground__msgContent playground__msgContent--md"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: streaming parcial
                dangerouslySetInnerHTML={{
                  __html: `${renderMarkdown(stream)}<span class="playground__streamingCursor">▌</span>`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {showCmds && input.startsWith("/") && (
        <SlashDropdown
          filter={input}
          commands={CMD_SLASH}
          onSelect={onSelectCmd}
          currentInput={input}
        />
      )}

      <div className="playground__inputArea">
        <div className="playground__inputPrefix">▸</div>
        <textarea
          ref={textareaRef as RefObject<HTMLTextAreaElement>}
          value={input}
          onChange={(e) => {
            onInput(e.target.value);
            onShowCmds(e.target.value.startsWith("/") && e.target.value.length <= 16);
            const t = e.target;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
          }}
          onKeyDown={onKeyDown}
          placeholder="Digite sua mensagem ou um comando com '/' (ex: /agent, /context, /help)..."
          rows={1}
          className="playground__textarea"
        />
        <button
          onClick={onSend}
          disabled={loading || !input.trim()}
          type="button"
          className="playground__sendBtn"
          title="Enviar mensagem"
        >
          <span>Enviar</span>
          <span className="playground__sendIcon">▶</span>
        </button>
      </div>
    </div>
  );
}
