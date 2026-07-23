import React, { useEffect, useRef, useState } from "react";
import type { CoreUiEvent, PermissionRequest } from "@codingpro/core";
import "./aurora.css";

interface ChatMessageUI {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls?: { name: string; args: string }[];
}

export const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [workspaceInfo, setWorkspaceInfo] = useState<{ cwd: string; platform: string }>({
    cwd: "Carregando...",
    platform: "win32",
  });
  const [currentPermissionRequest, setCurrentPermissionRequest] = useState<{
    request: PermissionRequest;
    id: string;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (window.codingproAPI) {
      window.codingproAPI.getWorkspaceInfo().then(setWorkspaceInfo).catch(console.error);

      const unsubscribe = window.codingproAPI.onCoreEvent((event: CoreUiEvent) => {
        if (event.type === "permission-request") {
          setCurrentPermissionRequest({
            request: event.request,
            id: `perm-${Date.now()}`,
          });
        } else if (event.type === "agent-event") {
          const ae = event.event;
          if (ae.type === "text-delta") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + ae.text },
                ];
              }
              return [
                ...prev,
                { id: String(Date.now()), role: "assistant", content: ae.text },
              ];
            });
          } else if (ae.type === "reasoning-delta") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { ...last, reasoning: (last.reasoning ?? "") + ae.text },
                ];
              }
              return [
                ...prev,
                { id: String(Date.now()), role: "assistant", content: "", reasoning: ae.text },
              ];
            });
          } else if (ae.type === "tool-call") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              const tc = { name: ae.call.name, args: JSON.stringify(ae.call.input) };
              if (last && last.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { ...last, toolCalls: [...(last.toolCalls ?? []), tc] },
                ];
              }
              return [
                ...prev,
                { id: String(Date.now()), role: "assistant", content: "", toolCalls: [tc] },
              ];
            });
          }
        } else if (event.type === "session-updated") {
          setIsRunning(false);
        } else if (event.type === "error") {
          setIsRunning(false);
          setMessages((prev) => [
            ...prev,
            { id: String(Date.now()), role: "assistant", content: `❌ Erro: ${event.message}` },
          ]);
        }
      });

      return unsubscribe;
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputPrompt.trim() || isRunning) return;
    const userText = inputPrompt;
    setInputPrompt("");
    setIsRunning(true);

    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), role: "user", content: userText },
    ]);

    if (window.codingproAPI) {
      await window.codingproAPI.sendMessage(userText);
    }
  };

  const handlePermissionResponse = (action: "allow" | "always" | "deny") => {
    if (!currentPermissionRequest || !window.codingproAPI) return;
    window.codingproAPI.respondPermission({
      requestId: currentPermissionRequest.id,
      decision: { action },
    });
    setCurrentPermissionRequest(null);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="logo-container">
          <div className="logo-badge">CP</div>
          <div className="logo-title">CodingPro</div>
        </div>

        <div className="workspace-info">
          <div>PROJETO ATIVO</div>
          <div className="workspace-path">{workspaceInfo.cwd}</div>
        </div>
      </div>

      {/* Area Principal */}
      <div className="main-content">
        <div className="header">
          <div style={{ fontWeight: 600 }}>Chat de Desenvolvimento</div>
          <div className="header-status">
            <div className="status-dot" />
            <span>{isRunning ? "Agente Executando..." : "Pronto (DeepSeek V4)"}</span>
          </div>
        </div>

        {/* Chat */}
        <div className="chat-area">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`message-bubble ${
                m.role === "user" ? "message-user" : "message-assistant"
              }`}
            >
              {m.reasoning && (
                <div className="reasoning-block">
                  <strong>🧠 Raciocínio Interno:</strong>
                  <div>{m.reasoning}</div>
                </div>
              )}

              {m.toolCalls && m.toolCalls.map((tc, idx) => (
                <div key={idx} className="tool-indicator">
                  ⚡ Tool: {tc.name} ({tc.args})
                </div>
              ))}

              <div>{m.content}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="input-bar">
          <input
            type="text"
            className="chat-input"
            placeholder="Digite seu pedido (ex: crie um componente de botão ou execute os testes)..."
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={isRunning}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={isRunning || !inputPrompt.trim()}
          >
            Enviar
          </button>
        </div>

        {/* Modal de Permissao */}
        {currentPermissionRequest && (
          <div className="permission-modal-overlay">
            <div className="permission-card">
              <div className="permission-title">
                ⚠️ Solicitada Aprovação de Efeito Colateral
              </div>

              <div>
                O agente deseja executar a tool <strong>{currentPermissionRequest.request.toolName}</strong>:
              </div>

              <div className="permission-input-box">
                {JSON.stringify(currentPermissionRequest.request.input, null, 2)}
              </div>

              <div className="permission-actions">
                <button
                  className="btn btn-deny"
                  onClick={() => handlePermissionResponse("deny")}
                >
                  Recusar
                </button>
                <button
                  className="btn btn-always"
                  onClick={() => handlePermissionResponse("always")}
                >
                  Sempre Permitir
                </button>
                <button
                  className="btn btn-allow"
                  onClick={() => handlePermissionResponse("allow")}
                >
                  Aprovar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
