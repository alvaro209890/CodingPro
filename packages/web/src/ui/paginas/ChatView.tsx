import type { RefObject } from "react";
import { Banner } from "./Banner.js";
import { SlashDropdown } from "./SlashDropdown.js";
import { ThinkingBalloon } from "./ThinkingBalloon.js";
import { TaskTrackerCard, type TaskRow } from "./TaskTrackerCard.js";
import type { Session } from "./PlaygroundTypes.js";

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

        {msgs.map((m, i) => (
          <div key={`${i}-${m.content.slice(0, 20)}`} className={`playground__msg playground__msg--${m.role}`}>
            <div className={`playground__msgHeader playground__msgHeader-${m.role}`}>
              <span className="playground__msgBadge">
                {m.role === "user" ? "👤 Você" : m.role === "system" ? "⚙️ Sistema" : "⚡ CodingPro AI"}
              </span>
              <span className="playground__msgTime">
                {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <div className="playground__msgBubble">
              <div className="playground__msgContent">{m.content}</div>

              {m.tools && m.tools.length > 0 && (
                <div className="playground__msgToolsContainer">
                  <div className="playground__msgToolsHeader">🔧 Ferramentas executadas:</div>
                  {m.tools.map((t, j) => (
                    <div key={`${t.nome}-${j}`} className="playground__msgToolTag">
                      <span className="playground__msgToolName">{t.nome}</span>
                      {t.result && <span className="playground__msgToolOutput">{t.result.slice(0, 140)}...</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Dynamic Thinking Balloon */}
        {(loading || thinkingSteps.length > 0) && (
          <ThinkingBalloon
            loading={loading}
            statusText={statusText}
            elapsedMs={elapsedMs}
            thinkingSteps={thinkingSteps}
          />
        )}

        {/* Dynamic Task Tracker Card */}
        {(tasks.length > 0 || (loading && tasks.length > 0)) && (
          <TaskTrackerCard tasks={tasks} isRunning={loading} />
        )}

        {isStreaming && (
          <div className="playground__msg playground__msg--assistant playground__streaming">
            <div className="playground__msgHeader playground__msgHeader-assistant">
              <span className="playground__msgBadge">⚡ CodingPro AI</span>
              <span className="playground__msgStreamingLabel">resposta contínua...</span>
            </div>
            <div className="playground__msgBubble">
              <div className="playground__msgContent">
                {stream}
                <span className="playground__streamingCursor">▌</span>
              </div>
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
          }}
          onKeyDown={onKeyDown}
          placeholder="Digite sua mensagem ou um comando com '/' (ex: /agent, /context, /help)..."
          rows={1}
          className="playground__textarea"
          onInput={(e) => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
          }}
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
