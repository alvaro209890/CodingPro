import type { CoreUiEvent, PermissionRequest, PreviaEscrita } from "@codingpro/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComandoChat } from "../shared/slash-commands.js";
import type { EstadoAcesso, WorkspaceInfo } from "../types/electron.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { FloatingInputDock } from "./components/FloatingInputDock.js";
import { Header } from "./components/Header.js";
import { IntegratedTerminal } from "./components/IntegratedTerminal.js";
import { renderMarkdown } from "./components/MarkdownRenderer.js";
import { PermissionModal } from "./components/PermissionModal.js";
import { type PlanTask, PlanTracker } from "./components/PlanTracker.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { type SessionRow, Sidebar } from "./components/Sidebar.js";
import { SubagentPanel } from "./components/SubagentPanel.js";
import { TaskTracker, toTaskRow } from "./components/TaskTracker.js";
import { TelaConta } from "./components/TelaConta.js";
import { type ToolItem, ToolSummaryBlock } from "./components/ToolSummaryBlock.js";
import { useReducaoMovimento, useTheme } from "./useTheme.js";
import "./aurora.css";
import "./cursor-skin.css";
// Por último: refina o que as duas folhas legadas deixaram inconsistente.
import "./refino.css";

const CollapsibleReasoning: React.FC<{
  text?: string | undefined;
  startedAt?: number;
  endedAt?: number;
}> = ({ text, startedAt, endedAt }) => {
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!text || startedAt === undefined) return;
    // Se o reasoning já terminou, congela o valor final — não roda timer.
    if (endedAt !== undefined) {
      setElapsed(Math.max(1, Math.round((endedAt - startedAt) / 1000)));
      return;
    }
    const tick = () => setElapsed(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [text, startedAt, endedAt]);

  if (!text) return null;
  const label = elapsed > 0 ? `Raciocinou por ${elapsed}s` : "Raciocínio";
  return (
    <div className="reasoning-box">
      <button
        type="button"
        className="reasoning-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="reasoning-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        {label}
      </button>
      {open && (
        <div
          className="reasoning-body"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown do LLM
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
        />
      )}
    </div>
  );
};

interface ChatMessageUI {
  id: string;
  /** `notice` = aviso do próprio app (ex.: caiu para a conta cloud) — nunca fala pela IA. */
  role: "user" | "assistant" | "notice";
  content: string;
  reasoning?: string;
  reasoningStartedAt?: number;
  reasoningEndedAt?: number;
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
  const [activeTab, setActiveTab] = useState<"code" | "settings">("code");
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [apiReady, setApiReady] = useState(() => typeof window.codingproAPI !== "undefined");
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const [workspaceInfo, setWorkspaceInfo] = useState<WorkspaceInfo>({
    cwd: "Carregando…",
    platform: "win32",
  });

  /**
   * Portão de acesso do app distribuído: sem conta conectada e sem chave própria,
   * mostramos a tela de login em vez de deixar o usuário digitar e só então descobrir
   * que não há credencial nenhuma.
   */
  const [acesso, setAcesso] = useState<EstadoAcesso | null>(null);

  /**
   * FILA, não um slot só. Subagentes rodam em paralelo e podem pedir permissão ao mesmo
   * tempo; guardar apenas o pedido atual fazia o segundo sobrescrever o primeiro, que
   * nunca era respondido — a promessa correspondente no main ficava pendente para sempre
   * e o turno travava. Agora cada pedido é respondido na ordem em que chegou.
   */
  const [permissionQueue, setPermissionQueue] = useState<
    Array<{
      request: PermissionRequest;
      id: string;
      previa?: PreviaEscrita;
    }>
  >([]);
  const currentPermissionRequest = permissionQueue[0] ?? null;

  const [recentSessions, setRecentSessions] = useState<SessionRow[]>([]);

  const [sessionCost, setSessionCost] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    turns: number;
    contextTokens: number;
    contextBudget: number;
  } | null>(null);

  const [_runStartTime, setRunStartTime] = useState<number | null>(null);

  const [taskItems, setTaskItems] = useState<ReturnType<typeof toTaskRow>[]>([]);
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);

  const [autoApprove, setAutoApprove] = useState(false);

  const { tema, setTema } = useTheme();
  const { reducaoMovimento, alternarReducaoMovimento } = useReducaoMovimento();

  /** Catálogo real de comandos, vindo do main (era duplicado em 3 lugares divergentes). */
  const [comandos, setComandos] = useState<readonly ComandoChat[] | undefined>(undefined);

  const [subAgents, setSubAgents] = useState<
    Array<{ id: string; label: string; status: "running" | "done" | "failed" }>
  >([]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatFeedRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const workspaceRef = useRef(workspaceInfo.cwd);
  workspaceRef.current = workspaceInfo.cwd;

  const refreshSessions = useCallback(async () => {
    if (!window.codingproAPI) return;
    try {
      const sessions = await window.codingproAPI.listSessions();
      setRecentSessions((prev) => {
        const activeId = prev.find((s) => s.active)?.id;
        return sessions.map((s, idx) => ({
          active: activeId ? s.id === activeId : idx === 0,
          id: s.id,
          // `updatedAt` chegava da API e era descartado — a coluna de tempo ficava vazia.
          title: s.preview || `Sessão ${s.id.slice(0, 8)}`,
          updatedAt: s.updatedAt,
        }));
      });
    } catch {
      // lista de sessões é acessório: falhar aqui não pode derrubar a tela
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
        setAcesso(info.acesso ?? { modo: info.hasApiKey ? "chave-propria" : "sem-acesso" });
        if (info.isCodingProMonorepo) {
          setStatusNote(
            "Pasta aberta = monorepo CodingPro. Para analisar outro projeto (ex. Downloads), clique em Pasta ou digite /abrir",
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

    // Estado real do main, não o palpite `false` do useState: depois de recarregar a
    // janela a UI mostrava "desligado" mesmo com auto-aprovar ligado no processo.
    void api
      .getAutoApprove()
      .then((v) => {
        if (!cancelled) setAutoApprove(v);
      })
      .catch(() => undefined);

    void api
      .getSlashCommands()
      .then((lista) => {
        if (!cancelled) setComandos(lista);
      })
      .catch(() => undefined);

    const unsubscribe = api.onCoreEvent((event: CoreUiEvent) => {
      if (event.type === "permission-request") {
        setPermissionQueue((prev) =>
          // Reentrega do mesmo id não duplica o card.
          prev.some((p) => p.id === event.requestId)
            ? prev
            : [
                ...prev,
                {
                  request: event.request,
                  id: event.requestId,
                  ...(event.previa !== undefined ? { previa: event.previa } : {}),
                },
              ],
        );
      } else if (event.type === "agent-event") {
        const ae = event.event;
        if (ae.type === "text-delta") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: last.content + ae.text,
                  // primeiro texto da resposta final = reasoning terminou
                  ...(last.reasoning !== undefined && last.reasoningEndedAt === undefined
                    ? { reasoningEndedAt: Date.now() }
                    : {}),
                },
              ];
            }
            return [...prev, { id: newId("asst"), role: "assistant", content: ae.text }];
          });
        } else if (ae.type === "reasoning-delta") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && !last.toolGroup) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  reasoning: (last.reasoning ?? "") + ae.text,
                  reasoningStartedAt: last.reasoningStartedAt ?? Date.now(),
                },
              ];
            }
            return [
              ...prev,
              {
                id: newId("asst"),
                role: "assistant",
                content: "",
                reasoning: ae.text,
                reasoningStartedAt: Date.now(),
              },
            ];
          });
        } else if (ae.type === "notice") {
          setStatusNote(ae.text);
          setMessages((prev) => [
            ...prev,
            {
              id: newId("notice"),
              role: "notice",
              content: ae.text,
            },
          ]);
        } else if (ae.type === "tool-call") {
          // Cada tool ganha seu próprio bloco de raciocínio
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            // tool começou → reasoning do bloco anterior terminou
            const lastComFim =
              last && last.role === "assistant" && last.reasoningEndedAt === undefined
                ? { ...last, reasoningEndedAt: Date.now() }
                : last;
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

            // Atualiza task tracker em tempo real (só task tool = tarefas planejadas)
            if (ae.call.name === "task") {
              const tRow = toTaskRow({ ...newItem, status: "running" });
              setTaskItems((prev) => [...prev, tRow]);
            }

            // Painel de subagentes visuais
            if (ae.call.name === "task") {
              const input = ae.call.input as Record<string, unknown> | undefined;
              const taskList = Array.isArray(input?.tarefas)
                ? (input.tarefas as Array<{ prompt?: string }>)
                : Array.isArray(input?.tasks)
                  ? (input.tasks as Array<{ prompt?: string }>)
                  : [];
              taskList.forEach((t, idx) => {
                const label = t?.prompt ? t.prompt.slice(0, 50) : `Subtarefa ${idx + 1}`;
                setSubAgents((prev) => [
                  ...prev,
                  { id: `${ae.call.name}-${idx}-${Date.now()}`, label, status: "running" },
                ]);
              });
            }

            if (lastComFim && lastComFim.role === "assistant") {
              const group = lastComFim.toolGroup ?? {
                summaryText: `Executando ${ae.call.name}`,
                items: [],
              };
              return [
                ...prev.slice(0, -1),
                {
                  ...lastComFim,
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

          // Atualiza task tracker
          if (ae.call.name === "task") {
            setTaskItems((prev) =>
              prev.map((t) =>
                t.id.startsWith("task-") ? { ...t, status: ok ? "done" : ("failed" as const) } : t,
              ),
            );
            // Marca subagentes como done/failed
            setSubAgents((prev) =>
              prev.map((a) =>
                a.id.startsWith("task-") ? { ...a, status: ok ? "done" : ("failed" as const) } : a,
              ),
            );
          }
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last?.toolGroup) return prev;
            const items = last.toolGroup.items.map((it) => {
              if (it.name === ae.call.name && it.status === "running") {
                const out =
                  ae.result.type === "text"
                    ? ae.result.value
                    : ae.result.type === "error-text"
                      ? ae.result.value
                      : undefined;
                const updated = { ...it, status: ok ? ("success" as const) : ("failed" as const) };
                if (out !== undefined) (updated as { output?: string }).output = out;
                return updated;
              }
              return it;
            });
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
      } else if (event.type === "plan-task") {
        setPlanTasks((prev) => {
          const idx = prev.findIndex((t) => t.id === event.task.id);
          if (idx === -1) return [...prev, event.task];
          const copy = [...prev];
          copy[idx] = event.task;
          return copy;
        });
      } else if (event.type === "session-updated") {
        setIsRunning(false);
        setPermissionQueue([]);
        // congela reasoning pendente (fim do turno — contador não fica rodando)
        setMessages((prev) =>
          prev.map((m) =>
            m.role === "assistant" && m.reasoning !== undefined && m.reasoningEndedAt === undefined
              ? { ...m, reasoningEndedAt: Date.now() }
              : m,
          ),
        );
        // se o main mandou o transcript completo (ex.: /limpar), sincroniza UI
        if (event.messages.length === 0) {
          setMessages([]);
        }
        void refreshSessions();
        void window.codingproAPI
          ?.getSessionCost()
          .then((c) => setSessionCost(c ?? null))
          .catch(() => undefined);
      } else if (event.type === "error") {
        setIsRunning(false);
        setPermissionQueue([]);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll inteligente.
  useEffect(() => {
    if (autoScrollRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isRunning]);

  // Detecta scroll manual do usuário
  useEffect(() => {
    const el = chatFeedRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      autoScrollRef.current = atBottom;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

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
      setRunStartTime(Date.now());
      setTaskItems([]);
      // O painel de subagentes é do turno atual; sem isso ele acumulava as execuções
      // de todos os turnos anteriores da sessão.
      setSubAgents([]);
      setMessages((prev) => [...prev, { id: newId("user"), role: "user", content: textToSend }]);

      try {
        const cwd =
          workspaceRef.current && workspaceRef.current !== "Carregando..."
            ? workspaceRef.current
            : undefined;
        const result = await window.codingproAPI.sendMessage(textToSend, cwd);

        if (result.cwd) {
          // atualiza resumo após /abrir
          void window.codingproAPI
            .getWorkspaceInfo()
            .then(setWorkspaceInfo)
            .catch(() => {
              setWorkspaceInfo((prev) => ({ ...prev, cwd: result.cwd as string }));
            });
        }

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
        setPermissionQueue([]);
      }
    },
    [inputPrompt, isRunning],
  );

  const handleCancel = useCallback(async () => {
    if (!window.codingproAPI) return;
    await window.codingproAPI.cancelRun();
    setIsRunning(false);
    setPermissionQueue([]);
  }, []);

  const handlePermissionResponse = (action: "allow" | "always" | "deny") => {
    if (!currentPermissionRequest || !window.codingproAPI) return;
    const respondido = currentPermissionRequest.id;
    window.codingproAPI.respondPermission({
      requestId: respondido,
      decision: { action },
    });
    // Só o pedido respondido sai da fila; o próximo assume o modal.
    setPermissionQueue((prev) => prev.filter((p) => p.id !== respondido));
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
    setPlanTasks([]);
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
    setMessages([]);
    const info = await window.codingproAPI.getWorkspaceInfo();
    setWorkspaceInfo(info);
    setStatusNote(
      `Projeto aberto: ${chosen}${info.projectSummary ? ` · ${info.projectSummary}` : ""}`,
    );
    void refreshSessions();
  };

  const projectName =
    workspaceInfo.projectName ||
    workspaceInfo.cwd.split(/[/\\]/).filter(Boolean).slice(-1)[0] ||
    workspaceInfo.cwd;

  /** Desconecta esta máquina da conta e volta para a tela de acesso. */
  const handleLogout = useCallback(async () => {
    if (!window.codingproAPI) return;
    await window.codingproAPI.contaLogout();
    const estado = await window.codingproAPI.estadoAcesso();
    setAcesso(estado);
    setMessages([]);
    setRecentSessions([]);
    setStatusNote(null);
  }, []);

  // Portão: o app distribuído exige conta; chave própria só existe no modo de desenvolvimento.
  if (acesso?.modo === "sem-acesso") {
    return (
      <TelaConta
        aoConectar={() => {
          void window.codingproAPI.getWorkspaceInfo().then((info) => {
            setWorkspaceInfo(info);
            setAcesso(info.acesso ?? { modo: "conta" });
          });
        }}
      />
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        recentSessions={recentSessions}
        onSelectSession={(id) => {
          void handleSelectSession(id);
        }}
        onNewSession={() => {
          void handleNewSession();
        }}
        onChooseWorkspace={() => {
          void handleChooseWorkspace();
        }}
        onOpenPalette={() => setIsPaletteOpen(true)}
        onLogout={() => {
          void handleLogout();
        }}
        workspacePath={workspaceInfo.cwd}
        projectName={projectName}
        acesso={acesso}
        settingsPanel={
          <SettingsPanel
            autoApprove={autoApprove}
            onToggleAutoApprove={() => {
              const next = !autoApprove;
              setAutoApprove(next);
              void window.codingproAPI?.setAutoApprove(next);
            }}
            tema={tema}
            onTemaChange={setTema}
            appVersion={workspaceInfo.appVersion}
            skills={workspaceInfo.skills}
            reducaoMovimento={reducaoMovimento}
            onToggleReducaoMovimento={alternarReducaoMovimento}
          />
        }
      />

      <div className="main-content">
        <Header
          title={recentSessions.find((s) => s.active)?.title ?? "Nova conversa"}
          projectName={projectName}
          workspacePath={workspaceInfo.cwd}
          branch={workspaceInfo.branch}
          isRunning={isRunning}
          isTerminalOpen={isTerminalOpen}
          onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
          {...(isRunning ? { onCancel: () => void handleCancel() } : {})}
        />

        {statusNote && (
          <div className="status-banner" role="status">
            <span>{statusNote}</span>
            <button
              type="button"
              className="status-banner-close"
              onClick={() => setStatusNote(null)}
              aria-label="Dispensar aviso"
              title="Dispensar"
            >
              ✕
            </button>
          </div>
        )}

        <div className="chat-feed" ref={chatFeedRef}>
          <SubagentPanel agents={subAgents} />

          {messages.length === 0 && (
            <div className="empty-chat">
              <h2 className="empty-chat-title">Em que vamos trabalhar?</h2>
              <p className="empty-chat-hint">
                O agente lê e edita arquivos apenas dentro da pasta aberta, neste computador. Toda
                escrita passa por você antes de acontecer.
              </p>
              <p className="empty-chat-path" title={workspaceInfo.cwd}>
                {workspaceInfo.cwd}
              </p>
              <button
                type="button"
                className="empty-chat-open"
                onClick={() => {
                  void handleChooseWorkspace();
                }}
              >
                Abrir outra pasta…
              </button>
              <ul className="empty-chat-exemplos">
                {[
                  "explique a estrutura deste projeto",
                  "onde fica a validação de login?",
                  "escreva testes para o módulo de datas",
                ].map((exemplo) => (
                  <li key={exemplo}>
                    <button
                      type="button"
                      className="empty-chat-exemplo"
                      onClick={() => setInputPrompt(exemplo)}
                    >
                      {exemplo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className="message-group">
              {m.role === "notice" ? (
                <div className="system-notice" role="status">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8h.01M11 12h1v4h1" />
                  </svg>
                  <span>{m.content}</span>
                </div>
              ) : m.role === "user" ? (
                <div className="user-message-card">
                  <div className="user-message-bubble">{m.content}</div>
                </div>
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
                  <CollapsibleReasoning
                    text={m.reasoning}
                    {...(m.reasoningStartedAt !== undefined
                      ? { startedAt: m.reasoningStartedAt }
                      : {})}
                    {...(m.reasoningEndedAt !== undefined ? { endedAt: m.reasoningEndedAt } : {})}
                  />
                  {/* biome-ignore lint/security/noDangerouslySetInnerHtml: markdown do LLM */}
                  {m.content && (
                    <div
                      className="text-response-block"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                    />
                  )}
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

        <PlanTracker tasks={planTasks} isRunning={isRunning} />

        <TaskTracker items={taskItems} isRunning={isRunning} />

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
          autoApprove={autoApprove}
          onToggleAutoApprove={() => {
            const next = !autoApprove;
            setAutoApprove(next);
            void window.codingproAPI?.setAutoApprove(next);
          }}
          comandos={comandos}
          branchName={workspaceInfo.branch}
          cost={sessionCost}
        />

        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          comandos={comandos}
          onSelectCommand={(cmd) => {
            if (cmd === "/limpar") {
              void handleNewSession();
              return;
            }
            if (cmd === "/abrir") {
              void handleChooseWorkspace();
              return;
            }
            void handleSend(cmd);
          }}
        />

        {currentPermissionRequest && (
          <PermissionModal
            naFila={permissionQueue.length - 1}
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
