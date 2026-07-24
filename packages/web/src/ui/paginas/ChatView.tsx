import type { RefObject } from "react";
import { Banner } from "./Banner.js";
import { SlashDropdown } from "./SlashDropdown.js";

interface ChatViewProps {
  session: Session | null;
  stream: string;
  loading: boolean;
  input: string;
  showCmds: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInput: (val: string) => void;
  onShowCmds: (show: boolean) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onSelectCmd: (cmd: string, fullInput: string) => void;
}

const CMD_SLASH = [
  { cmd: "/clear", desc: "Limpar tela" },
  { cmd: "/new", desc: "Novo chat" },
  { cmd: "/list", desc: "Listar chats" },
  { cmd: "/switch <id>", desc: "Trocar chat" },
  { cmd: "/delete <id>", desc: "Deletar chat" },
  { cmd: "/rename <nome>", desc: "Renomear chat" },
  { cmd: "/export", desc: "Exportar como .md" },
  { cmd: "/history", desc: "Histórico de comandos" },
  { cmd: "/context", desc: "Arquivos no workspace" },
  { cmd: "/agent <prompt>", desc: "Modo agente (Chat)" },
  { cmd: "/memory", desc: "Salvar contexto" },
  { cmd: "/help", desc: "Ajuda" },
];

export function ChatView({
  session,
  stream,
  loading,
  input,
  showCmds,
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
        {!hasMessages && !stream && !loading && <Banner />}

        {msgs.map((m, i) => (
          <div key={`${i}-${m.content.slice(0, 20)}`} className="playground__msg">
            <div
              className={`playground__msgLabel playground__msgLabel-${m.role}`}
            >
              {m.role === "user"
                ? "▸ você"
                : m.role === "system"
                  ? "⚙ sistema"
                  : "◂ codingpro"}
            </div>
            <div className="playground__msgContent">{m.content}</div>
            {m.tools?.map((t) => (
              <div key={j} className="playground__msgTools">
                <span className="playground__msgTool">🔧 {t.nome}</span> —{" "}
                {t.result?.slice(0, 150)}
              </div>
            ))}
          </div>
        ))}

        {isStreaming && (
          <div className="playground__streaming">
            <div className="playground__msgLabel playground__msgLabel-assistant">
              ◂ codingpro
            </div>
            <div className="playground__msgContent">
              {stream}
              <span className="playground__streamingCursor">▌</span>
            </div>
          </div>
        )}

        {loading && !stream && (
          <div className="playground__typing">...</div>
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
        <span className="playground__prompt">▸</span>
        <textarea
          ref={textareaRef as RefObject<HTMLTextAreaElement>}
          value={input}
          onChange={(e) => {
            onInput(e.target.value);
            onShowCmds(e.target.value.startsWith("/") && e.target.value.length <= 12);
          }}
          onKeyDown={onKeyDown}
          placeholder="O que você quer criar, corrigir ou analisar?"
          rows={1}
          className="playground__textarea"
          onInput={(e) => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
          }}
        />
        <button onClick={onSend} disabled={loading || !input.trim()} type="button">▶</button>
      </div>
    </div>
  );
}