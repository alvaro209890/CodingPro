import type React from "react";
import { useEffect, useRef, useState } from "react";
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
  const [messages, setMessages] = useState<ChatMessageUI[]>([
    {
      id: "demo-1",
      role: "assistant",
      content:
        "Full pipeline pnpm build (llm->core->cli->desktop) succeeds end-to-end. Terminal integrado e ferramentas visuais ativas.",
      toolGroup: {
        summaryText: "Leu 2 arquivos, editado um arquivo, encontrado arquivos, executado 2 comandos",
        diffAdd: 14,
        diffDel: 2,
        items: [
          { id: "t1", name: "read_file", target: "CODINGPRO.md", status: "success" },
          { id: "t2", name: "edit_file", target: "CODINGPRO.md", status: "success", diffAdd: 14, diffDel: 2 },
          { id: "t3", name: "read_file", target: "README.md", status: "success" },
          { id: "t4", name: "grep", target: "check if other packages have their own README", status: "failed" },
          { id: "t5", name: "bash", target: "formatting including markdown doc edits", status: "success" },
        ],
      },
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const [workspaceInfo, setWorkspaceInfo] = useState<{ cwd: string; platform: string }>({
    cwd: "c:\\GIS\\CodingPro",
    platform: "win32",
  });

  const [currentPermissionRequest, setCurrentPermissionRequest] = useState<{
    request: PermissionRequest;
    id: string;
  } | null>(null);

  const [recentSessions, setRecentSessions] = useState([
    { id: "1", title: "Análise e desenvolvimento do app Windows", active: true },
    { id: "2", title: "CLI design e animações", active: false },
    { id: "3", title: "Segurança do site de rifas", active: false },
    { id: "4", title: "Divisão de lotes 16 e 17", active: false },
    { id: "5", title: "Simbologia não carrega no ArcMap 10.8", active: false },
    { id: "6", title: "Análise de vencimento de carros no SIMCAR", active: false },
  ]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

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
              return [...prev, { id: String(Date.now()), role: "assistant", content: ae.text }];
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

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt ?? inputPrompt;
    if (!textToSend.trim() || isRunning) return;
    if (!customPrompt) setInputPrompt("");
    setIsRunning(true);

    setMessages((prev) => [...prev, { id: String(Date.now()), role: "user", content: textToSend }]);

    if (window.codingproAPI) {
      await window.codingproAPI.sendMessage(textToSend);
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

  const handleSelectSession = async (id: string) => {
    setRecentSessions((prev) =>
      prev.map((s) => ({
        ...s,
        active: s.id === id,
      })),
    );
    if (window.codingproAPI) {
      const res = await window.codingproAPI.loadSession(id);
      if (res.success && res.messages) {
        setMessages(
          res.messages.map((msg, i) => ({
            id: `loaded-${i}`,
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.content ?? "",
          })),
        );
      }
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar no estilo Claude Code */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        recentSessions={recentSessions}
        onSelectSession={handleSelectSession}
        onNewSession={() => setMessages([])}
        workspacePath={workspaceInfo.cwd}
      />

      {/* Area Principal */}
      <div className="main-content">
        {/* Header superior */}
        <Header
          title={recentSessions.find((s) => s.active)?.title ?? "Análise e desenvolvimento do app Windows"}
          projectName="CodingPro"
          onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
        />

        {/* Chat Feed */}
        <div className="chat-feed">
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

          {/* Stat Footer Line */}
          <div className="session-stats-bar" style={{ maxWidth: 860, margin: "0 auto", width: "100%" }}>
            <span>• 11m 32s</span>
            <span>• 9.2k tokens</span>
            <span>• {isRunning ? "1 tarefa em execução" : "0 tarefas ativas"}</span>
          </div>

          <div ref={chatEndRef} />
        </div>

        {/* Terminal Integrado embutido */}
        <IntegratedTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />

        {/* Dock Flutuante Inferior */}
        <FloatingInputDock
          inputPrompt={inputPrompt}
          onChangeInput={setInputPrompt}
          onSend={() => handleSend()}
          isRunning={isRunning}
          branchName="master"
          additions={259}
          deletions={90}
          modelName="DeepSeek V4"
          effortLevel="Alto"
        />

        {/* Paleta de Comandos (Ctrl+K) */}
        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          onSelectCommand={(cmd) => handleSend(cmd)}
        />

        {/* Modal de Permissao de Efeito Colateral */}
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
