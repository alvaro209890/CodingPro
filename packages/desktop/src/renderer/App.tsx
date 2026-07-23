import type { CoreUiEvent, PermissionRequest, PreviaEscrita } from "@codingpro/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CommandPalette } from "./components/CommandPalette.js";
import { FloatingInputDock } from "./components/FloatingInputDock.js";
import { Header } from "./components/Header.js";
import { IntegratedTerminal } from "./components/IntegratedTerminal.js";
import { PermissionModal } from "./components/PermissionModal.js";
import { Sidebar } from "./components/Sidebar.js";
import { type ToolItem, ToolSummaryBlock } from "./components/ToolSummaryBlock.js";
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

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"home" | "code">("code");
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [apiReady, setApiReady] = useState(() => typeof window.codingproAPI !== "undefined");
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const [workspaceInfo, setWorkspaceInfo] = useState<{
    cwd: string;
    platform: string;
    hasApiKey?: boolean;
  }>({
    cwd: "Carregando...",
    platform: "win32",
  });

  const [currentPermissionRequest, setCurrentPermissionRequest] = useState<{
    request: PermissionRequest;
    id: string;
    previa?: PreviaEscrita;
  } | null>(null);

  const [recentSessions, setRecentSessions] = useState([
    { id: "current", title: "Nova sessão", active: true },
  ]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef(workspaceInfo.cwd);
  workspaceRef.current = workspaceInfo.cwd;

  const refreshSessions = useCallback(async () => {
    if (!window.codingproAPI) return;
    try {
      const sessions = await window.codingproAPI.listSessions();
      if (sessions.length > 0) {
        setRecentSessions((prev) => {
          const activeId = prev.find((s) => s.active)?.id;
          return sessions.map((s, idx) => ({
            id: s.id,
            title: s.preview || `Sessão ${s.id.slice(0, 8)}`,
            active: activeId ? s.id === activeId : idx === 0,
          }));
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // Espera o preload (às vezes o React monta um tick antes do contextBridge)
  useEffect(() => {
    if (window.codingproAPI) {
      setApiReady(true);
      return;
    }
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      if (window.codingproAPI) {
        setApiReady(true);
        setStatusNote(null);
        window.clearInterval(id);
        return;
      }
      if (tries >= 40) {
        window.clearInterval(id);
        setApiReady(false);
        setStatusNote(
          "API desktop indisponível (preload). Feche e rode: pnpm desktop — não abra o HTML no browser.",
        );
      }
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  // ─── Global Ctrl+K / Escape ───
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === ".") {
        e.preventDefault();
        if (window.codingproAPI) {
          void window.codingproAPI.cancelRun().then(() => setIsRunning(false));
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!apiReady || !window.codingproAPI) return;

    let cancelled = false;
    const api = window.codingproAPI;

    void api
      .getWorkspaceInfo()
      .then((info) => {
        if (cancelled) return;
        setWorkspaceInfo(info);
        if (info.hasApiKey === false) {
          setStatusNote(
            "DEEPSEEK_API_KEY não encontrada. Coloque em .codingpro/.env ou ~/.config/codingpro/deepseek.env e reinicie.",
          );
        } else {
          setStatusNote(null);
        }
      })
      .catch((err: unknown) => {
        console.error(err);
        setStatusNote("Falha ao obter info do workspace");
      });

    void refreshSessions();

    const unsubscribe = api.onCoreEvent((event: CoreUiEvent) => {
      if (event.type === "permission-request") {
        setCurrentPermissionRequest({
          request: event.request,
          id: event.requestId,
          ...(event.previa !== undefined ? { previa: event.previa } : {}),
        });
      } else if (event.type === "agent-event") {
        const ae = event.event;
        if (ae.type === "text-delta") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              return [...prev.slice(0, -1), { ...last, content: last.content + ae.text }];
            }
            return [...prev, { id: newId("asst"), role: "assistant", content: ae.text }];
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
              { id: newId("asst"), role: "assistant", content: "", reasoning: ae.text },
            ];
          });
        } else if (ae.type === "tool-call") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            const input = ae.call.input as Record<string, unknown> | undefined;
            const target =
              (typeof input?.path === "string" && input.path) ||
              (typeof input?.command === "string" && input.command) ||
              ae.call.name;
            const newItem: ToolItem = {
              id: `${ae.call.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: ae.call.name,
              target: String(target),
              status: "running",
            };

            if (last && last.role === "assistant") {
              const group = last.toolGroup ?? {
                summaryText: `Executando ${ae.call.name}`,
                items: [],
              };
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  toolGroup: {
                    ...group,
                    items: [...group.items, newItem],
                    summaryText: `Executando ${group.items.length + 1} ferramenta(s)`,
                  },
                },
              ];
            }

            return [
              ...prev,
              {
                id: newId("asst"),
                role: "assistant",
                content: "",
                toolGroup: {
                  summaryText: `Executando ${ae.call.name}`,
                  items: [newItem],
                },
              },
            ];
          });
        } else if (ae.type === "tool-result") {
          const ok =
            ae.result.type !== "error-text" &&
            ae.result.type !== "error-json" &&
            ae.result.type !== "execution-denied";
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last?.toolGroup) return prev;
            const items = last.toolGroup.items.map((it) =>
              it.name === ae.call.name && it.status === "running"
                ? { ...it, status: ok ? ("success" as const) : ("failed" as const) }
                : it,
            );
            const still = items.some((it) => it.status === "running" && it.name === ae.call.name);
            const finalItems = still
              ? items
              : (() => {
                  const copy = [...items];
                  for (let i = copy.length - 1; i >= 0; i -= 1) {
                    const it = copy[i];
                    if (it && it.name === ae.call.name) {
                      copy[i] = {
                        ...it,
                        status: ok ? ("success" as const) : ("failed" as const),
                      };
                      break;
                    }
                  }
                  return copy;
                })();
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                toolGroup: {
                  ...last.toolGroup,
                  items: finalItems,
                  summaryText: `Executado ${finalItems.length} ferramenta(s)`,
                },
              },
            ];
          });
        }
      } else if (event.type === "session-updated") {
        setIsRunning(false);
        setCurrentPermissionRequest(null);
        // se o main mandou o transcript completo (ex.: /limpar), sincroniza UI
        if (event.messages.length === 0) {
          setMessages([]);
        }
        void refreshSessions();
      } else if (event.type === "error") {
        setIsRunning(false);
        setCurrentPermissionRequest(null);
        setMessages((prev) => [
          ...prev,
          { id: newId("err"), role: "assistant", content: `❌ ${event.message}` },
        ]);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [apiReady, refreshSessions]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rola o chat no scroll.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isRunning]);

  const handleSend = useCallback(
    async (customPrompt?: string) => {
      const textToSend = (customPrompt ?? inputPrompt).trim();
      if (!textToSend || isRunning) return;
      if (!customPrompt) setInputPrompt("");

      if (!window.codingproAPI) {
        setMessages((prev) => [
          ...prev,
          { id: newId("user"), role: "user", content: textToSend },
          {
            id: newId("err"),
            role: "assistant",
            content:
              "❌ API desktop não conectada (preload). Feche esta janela e rode `pnpm desktop` na pasta CodingPro — não abra o index.html no Chrome.",
          },
        ]);
        return;
      }

      setIsRunning(true);
      setMessages((prev) => [...prev, { id: newId("user"), role: "user", content: textToSend }]);

      try {
        const cwd =
          workspaceRef.current && workspaceRef.current !== "Carregando..."
            ? workspaceRef.current
            : undefined;
        const result = await window.codingproAPI.sendMessage(textToSend, cwd);

        if (result.local && result.reply) {
          setMessages((prev) => [
            ...prev,
            { id: newId("asst"), role: "assistant", content: result.reply ?? "" },
          ]);
        } else if (!result.success && result.error) {
          // erro já pode ter vindo via evento; evita duplicar se já setou isRunning false
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.content.startsWith("❌")) {
              return prev;
            }
            return [
              ...prev,
              { id: newId("err"), role: "assistant", content: `❌ ${result.error}` },
            ];
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [
          ...prev,
          { id: newId("err"), role: "assistant", content: `❌ Falha IPC: ${msg}` },
        ]);
      } finally {
        setIsRunning(false);
        setCurrentPermissionRequest(null);
      }
    },
    [inputPrompt, isRunning],
  );

  const handleCancel = useCallback(async () => {
    if (!window.codingproAPI) return;
    await window.codingproAPI.cancelRun();
    setIsRunning(false);
    setCurrentPermissionRequest(null);
  }, []);

  const handlePermissionResponse = (action: "allow" | "always" | "deny") => {
    if (!currentPermissionRequest || !window.codingproAPI) return;
    window.codingproAPI.respondPermission({
      requestId: currentPermissionRequest.id,
      decision: { action },
    });
    setCurrentPermissionRequest(null);
  };

  const handleSelectSession = async (id: string) => {
    setRecentSessions((prev) => prev.map((s) => ({ ...s, active: s.id === id })));
    if (!window.codingproAPI || id.startsWith("new-") || id === "current") return;
    const res = await window.codingproAPI.loadSession(id);
    if (res.success && res.messages) {
      setMessages(
        res.messages.map((msg: unknown, i: number) => {
          const m = msg as { role?: string; content?: unknown };
          return {
            id: `loaded-${i}`,
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            content: contentToString(m.content),
          };
        }),
      );
    } else if (res.error) {
      setStatusNote(res.error);
    }
  };

  const handleNewSession = async () => {
    setMessages([]);
    setRecentSessions((prev) => [
      { id: `new-${Date.now()}`, title: "Nova sessão", active: true },
      ...prev.map((s) => ({ ...s, active: false })),
    ]);
    if (window.codingproAPI) {
      await window.codingproAPI.newSession();
    }
  };

  const handleChooseWorkspace = async () => {
    if (!window.codingproAPI) return;
    const chosen = await window.codingproAPI.chooseWorkspaceFolder();
    if (!chosen) return;
    setWorkspaceInfo((prev) => ({ ...prev, cwd: chosen }));
    setMessages([]);
    setStatusNote(`Workspace: ${chosen}`);
    void refreshSessions();
  };

  const cwdShort =
    workspaceInfo.cwd.split(/[/\\]/).filter(Boolean).slice(-1)[0] || workspaceInfo.cwd;

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        recentSessions={recentSessions}
        onSelectSession={handleSelectSession}
        onNewSession={() => {
          void handleNewSession();
        }}
        onChooseWorkspace={() => {
          void handleChooseWorkspace();
        }}
        workspacePath={workspaceInfo.cwd}
      />

      <div className="main-content">
        <Header
          title={recentSessions.find((s) => s.active)?.title ?? "Nova sessão"}
          projectName={cwdShort}
          onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
          {...(isRunning ? { onCancel: () => void handleCancel() } : {})}
        />

        {statusNote && (
          <div
            style={{
              margin: "8px 24px 0",
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(56, 189, 248, 0.08)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              color: "var(--text-secondary)",
              fontSize: 12,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>{statusNote}</span>
            <button
              type="button"
              onClick={() => setStatusNote(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Chat Feed */}
        <div className="chat-feed">
          {messages.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                gap: 12,
                opacity: 0.6,
                paddingTop: 80,
              }}
            >
              <div
                style={{
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
                }}
              >
                CP
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
                CodingPro Desktop
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  maxWidth: 420,
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                Assistente de desenvolvimento com DeepSeek. Digite um pedido abaixo,{" "}
                <strong style={{ color: "var(--accent-blue)" }}>Ctrl+K</strong> abre a paleta,{" "}
                <strong style={{ color: "var(--accent-blue)" }}>Ctrl+.</strong> cancela.
              </div>
              <div
                style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                {workspaceInfo.cwd}
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
            <div
              className="message-group"
              style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}
            >
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        <IntegratedTerminal
          isOpen={isTerminalOpen}
          onClose={() => setIsTerminalOpen(false)}
          cwd={workspaceInfo.cwd}
        />

        <FloatingInputDock
          inputPrompt={inputPrompt}
          onChangeInput={setInputPrompt}
          onSend={() => void handleSend()}
          onCancel={() => void handleCancel()}
          isRunning={isRunning}
          branchName="master"
          modelName="DeepSeek V4"
          effortLevel="Alto"
        />

        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          onSelectCommand={(cmd) => {
            if (cmd === "/limpar") {
              void handleNewSession();
              return;
            }
            void handleSend(cmd);
          }}
        />

        {currentPermissionRequest && (
          <PermissionModal
            request={currentPermissionRequest.request}
            {...(currentPermissionRequest.previa !== undefined
              ? { previa: currentPermissionRequest.previa }
              : {})}
            onRespond={handlePermissionResponse}
          />
        )}
      </div>
    </div>
  );
};
