import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CoreUiEvent, PermissionRequest } from "@codingpro/core";
import { Sidebar } from "./components/Sidebar.js";
import { Header } from "./components/Header.js";
import { ToolSummaryBlock, type ToolItem } from "./components/ToolSummaryBlock.js";
import { FloatingInputDock } from "./components/FloatingInputDock.js";
import { PermissionModal } from "./components/PermissionModal.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { IntegratedTerminal } from "./components/IntegratedTerminal.js";
import "./aurora.css";

interface ChatMessageUI {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolGroup?: {
    summaryText: string;
    items: ToolItem[];
    diffAdd?: number;
    diffDel?: number;
  };
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"home" | "code">("code");
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const [workspaceInfo, setWorkspaceInfo] = useState<{ cwd: string; platform: string }>({
    cwd: "Carregando...",
    platform: "win32",
  });

  const [currentPermissionRequest, setCurrentPermissionRequest] = useState<{
    request: PermissionRequest;
    id: string;
  } | null>(null);

  const [recentSessions, setRecentSessions] = useState([
    { id: "current", title: "Nova sessão", active: true },
  ]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // ─── Global Ctrl+K listener (no App level, não dentro do CommandPalette) ───
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (window.codingproAPI) {
      window.codingproAPI.getWorkspaceInfo().then(setWorkspaceInfo).catch(console.error);

      window.codingproAPI.listSessions().then((sessions) => {
        if (sessions.length > 0) {
          setRecentSessions(
            sessions.map((s, idx) => ({
              id: s.id,
              title: s.preview || `Sessão ${s.id.slice(0, 8)}`,
              active: idx === 0,
            })),
          );
        }
      }).catch(() => undefined);

      const unsubscribe = window.codingproAPI.onCoreEvent((event: CoreUiEvent) => {
        if (event.type === "permission-request") {
          setCurrentPermissionRequest({
            request: event.request,
            id: event.requestId,
          });
        } else if (event.type === "agent-event") {
          const ae = event.event;
          if (ae.type === "text-delta") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content: last.content + ae.text }];
              }
              return [
                ...prev,
                { id: `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: "assistant", content: ae.text },
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
                { id: `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: "assistant", content: "", reasoning: ae.text },
              ];
            });
          } else if (ae.type === "tool-call") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              const newItem: ToolItem = {
                id: `${ae.call.name}-${Date.now()}`,
                name: ae.call.name,
                target: (ae.call.input as any)?.path ?? (ae.call.input as any)?.command ?? ae.call.name,
                status: "success",
              };

              if (last && last.role === "assistant") {
                const group = last.toolGroup ?? {
                  summaryText: `Executado ${ae.call.name}`,
                  items: [],
                };
                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    toolGroup: {
                      ...group,
                      items: [...group.items, newItem],
                      summaryText: `Executado ${group.items.length + 1} ferramentas`,
                    },
                  },
                ];
              }

              return [
                ...prev,
                {
                  id: String(Date.now()),
                  role: "assistant",
                  content: "",
                  toolGroup: {
                    summaryText: `Executado ${ae.call.name}`,
                    items: [newItem],
                  },
                },
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: rola o chat no scroll.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (customPrompt?: string) => {
    const textToSend = customPrompt ?? inputPrompt;
    if (!textToSend.trim() || isRunning) return;
    if (!customPrompt) setInputPrompt("");
    setIsRunning(true);

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: "user", content: textToSend },
    ]);

    if (window.codingproAPI) {
      await window.codingproAPI.sendMessage(textToSend);
    }
  }, [inputPrompt, isRunning]);

  const handlePermissionResponse = (action: "allow" | "always" | "deny") => {
    if (!currentPermissionRequest || !window.codingproAPI) return;
    window.codingproAPI.respondPermission({
      requestId: currentPermissionRequest.id,
      decision: { action },
    });
    setCurrentPermissionRequest(null);
  };

  const handleSelectSession = async (id: string) => {
    setRecentSessions((prev) =>
      prev.map((s) => ({ ...s, active: s.id === id })),
    );
    if (window.codingproAPI) {
      const res = await window.codingproAPI.loadSession(id);
      if (res.success && res.messages) {
        setMessages(
          res.messages.map((msg: any, i: number) => ({
            id: `loaded-${i}`,
            role: msg.role === "user" ? ("user" as const) : ("assistant" as const),
            content: msg.content ?? "",
          })),
        );
      }
    }
  };

  const cwdShort = workspaceInfo.cwd.split(/[/\\]/).slice(-1)[0] || workspaceInfo.cwd;

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        recentSessions={recentSessions}
        onSelectSession={handleSelectSession}
        onNewSession={() => {
          setMessages([]);
          setRecentSessions((prev) => [
            { id: `new-${Date.now()}`, title: "Nova sessão", active: true },
            ...prev.map((s) => ({ ...s, active: false })),
          ]);
        }}
        workspacePath={workspaceInfo.cwd}
      />

      <div className="main-content">
        <Header
          title={recentSessions.find((s) => s.active)?.title ?? "Nova sessão"}
          projectName={cwdShort}
          onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
        />

        {/* Chat Feed */}
        <div className="chat-feed">
          {messages.length === 0 && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              gap: 12,
              opacity: 0.6,
              paddingTop: 80,
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--accent-purple), var(--accent-blue))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 700,
                color: "#fff",
                boxShadow: "0 0 24px rgba(56, 189, 248, 0.2)",
              }}>CP</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
                CodingPro Desktop
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 400, textAlign: "center" }}>
                Seu assistente de desenvolvimento com IA. Digite um pedido abaixo ou pressione <strong style={{ color: "var(--accent-blue)" }}>Ctrl+K</strong> para abrir a paleta de comandos.
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className="message-group">
              {m.role === "user" ? (
                <div className="user-message-card">{m.content}</div>
              ) : (
                <div className="assistant-message-card">
                  {m.toolGroup && (
                    <ToolSummaryBlock
                      summaryText={m.toolGroup.summaryText}
                      items={m.toolGroup.items}
                      totalAdd={m.toolGroup.diffAdd}
                      totalDel={m.toolGroup.diffDel}
                    />
                  )}
                  {m.reasoning && <div className="reasoning-box">🧠 {m.reasoning}</div>}
                  {m.content && <div className="text-response-block">{m.content}</div>}
                </div>
              )}
            </div>
          ))}

          {isRunning && (
            <div className="message-group" style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}>
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Terminal Integrado */}
        <IntegratedTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />

        {/* Dock Flutuante */}
        <FloatingInputDock
          inputPrompt={inputPrompt}
          onChangeInput={setInputPrompt}
          onSend={() => handleSend()}
          isRunning={isRunning}
          branchName="master"
          modelName="DeepSeek V4"
          effortLevel="Alto"
        />

        {/* Paleta de Comandos (Ctrl+K) */}
        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          onSelectCommand={(cmd) => handleSend(cmd)}
        />

        {/* Modal de Permissão */}
        {currentPermissionRequest && (
          <PermissionModal
            request={currentPermissionRequest.request}
            onRespond={handlePermissionResponse}
          />
        )}
      </div>
    </div>
  );
};
