import { useCallback, useEffect, useRef, useState } from "react";
import type { Usuario } from "../api.js";
import { ChatView } from "./ChatView.js";
import { EditorPanel } from "./EditorPanel.js";
import { FilesPanel } from "./FilesPanel.js";
import { GitPanel } from "./GitPanel.js";
import { MemoryPanel } from "./MemoryPanel.js";
import { type Mensagem, novaMensagem, type Session } from "./PlaygroundTypes.js";
import { Sidebar } from "./Sidebar.js";
import { TabBar } from "./TabBar.js";
import type { TaskRow } from "./TaskTrackerCard.js";
import { TerminalPanel } from "./TerminalPanel.js";

function alvoDaTool(name: string, argsRaw?: string, target?: string): string {
  if (typeof target === "string" && target.trim()) return target.trim();
  if (!argsRaw) return name;
  try {
    const args = JSON.parse(argsRaw) as Record<string, unknown>;
    const v = args.path ?? args.command ?? args.pattern ?? args.query;
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120);
  } catch {
    /* args não-JSON */
  }
  return argsRaw.slice(0, 80) || name;
}

type Tab = "chat" | "files" | "editor" | "terminal" | "git" | "memory";

const SESSIONS_KEY = "cp_playground_sessions";
const ACTIVE_KEY = "cp_playground_active";
const MAX_SESSIONS = 20;

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

const TABS: { id: Tab; ico: string; lbl: string }[] = [
  { id: "chat", ico: "💬", lbl: "Chat" },
  { id: "files", ico: "📁", lbl: "Files" },
  { id: "editor", ico: "📝", lbl: "Editor" },
  { id: "terminal", ico: "›", lbl: "Terminal" },
  { id: "git", ico: "⑂", lbl: "Git" },
  { id: "memory", ico: "📋", lbl: "Memory" },
];

function gerarId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nomeAutomatico(idx: number): string {
  return `chat-${String(idx + 1).padStart(2, "0")}`;
}

function carregarSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s: Session, i: number) => {
      const id = s.id || gerarId();
      return {
        id,
        nome: s.nome || nomeAutomatico(i),
        criadaEm: s.criadaEm || Date.now(),
        mensagens: (s.mensagens ?? []).map((m, j) => {
          const msg: Mensagem = {
            id: m.id || `${id}-${j}-${m.timestamp ?? j}`,
            role: m.role === "user" || m.role === "system" ? m.role : "assistant",
            content: String(m.content ?? ""),
            timestamp: m.timestamp ?? Date.now(),
          };
          if (m.tools?.length) msg.tools = m.tools;
          if (m.thinking) msg.thinking = m.thinking;
          return msg;
        }),
      };
    });
  } catch {
    return [];
  }
}

function carregarActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || "";
  } catch {
    return "";
  }
}

function salvarSessions(ss: Session[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(ss.slice(0, MAX_SESSIONS)));
  } catch {}
}

function salvarActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
}

export function Playground({ usuario }: { usuario: Usuario }) {
  const [sessions, setSessions] = useState<Session[]>(() => carregarSessions());
  const [activeId, setActiveId] = useState<string>(() => carregarActiveId());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [globalDragging, setGlobalDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const [tab, setTab] = useState<Tab>("chat");
  const [stream, setStream] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCmds, setShowCmds] = useState(false);
  const [status, setStatus] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reasoning, setReasoning] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [stickToBottom, setStickToBottom] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const limparEphemeral = useCallback(() => {
    setStream("");
    setStatus("");
    setReasoning("");
    setTasks([]);
    setElapsedMs(0);
  }, []);

  const activeIdx = sessions.findIndex((s) => s.id === activeId);
  const activeSession = activeIdx >= 0 ? sessions[activeIdx] : (sessions[0] ?? null);

  useEffect(() => {
    if (sessions.length === 0) {
      const s: Session = {
        id: gerarId(),
        nome: nomeAutomatico(0),
        mensagens: [],
        criadaEm: Date.now(),
      };
      setSessions([s]);
      setActiveId(s.id);
    } else if (activeIdx < 0) {
      const first = sessions[0];
      if (first) setActiveId(first.id);
    }
  }, [sessions, activeIdx]);

  const _msgs = activeSession?.mensagens ?? [];

  useEffect(() => {
    salvarSessions(sessions);
  }, [sessions]);
  useEffect(() => {
    salvarActiveId(activeId);
  }, [activeId]);

  const updateSession = useCallback((id: string, fn: (s: Session) => Session) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));
  }, []);

  const setMsgs = useCallback(
    (fn: (prev: Mensagem[]) => Mensagem[]) => {
      const id = activeIdRef.current;
      if (!id) return;
      updateSession(id, (s) => ({ ...s, mensagens: fn(s.mensagens) }));
    },
    [updateSession],
  );

  const appendMsg = useCallback(
    (sessionId: string, msg: Mensagem) => {
      updateSession(sessionId, (s) => ({ ...s, mensagens: [...s.mensagens, msg] }));
    },
    [updateSession],
  );

  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [pendingInput, setPendingInput] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [filesCwd, setFilesCwd] = useState("");
  const [uploading, setUploading] = useState(false);
  const [code, setCode] = useState("");
  const [activeFile, setActiveFile] = useState("");
  const [out, setOut] = useState("");
  const [cmd, setCmd] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [gitOut, setGitOut] = useState("");
  const [cloning, setCloning] = useState(false);
  const [memFiles, setMemFiles] = useState<string[]>([]);
  const [memName, setMemName] = useState("");
  const [memContent, setMemContent] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inpRef = useRef<HTMLTextAreaElement>(null);
  const cmdRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-rola só se o usuário estiver perto do fim
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [_msgs, stream, loading, reasoning, tasks, stickToBottom]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reanexa listener ao trocar de chat
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setStickToBottom(dist < 96);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeId]);

  const POST = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
      credentials: "include",
    });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as any).mensagem || "Erro");
    return r.json() as T;
  }, []);

  const novaSessao = useCallback(() => {
    const idx = sessions.length;
    const s: Session = {
      id: gerarId(),
      nome: nomeAutomatico(idx),
      mensagens: [],
      criadaEm: Date.now(),
    };
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
    setSidebarOpen(false);
  }, [sessions.length]);

  const trocarSessao = useCallback(
    (id: string) => {
      abortRef.current?.abort();
      abortRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      setLoading(false);
      limparEphemeral();
      setActiveId(id);
      setSidebarOpen(false);
      setStickToBottom(true);
    },
    [limparEphemeral],
  );

  const deletarSessao = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const rest = prev.filter((s) => s.id !== id);
        if (rest.length === 0) {
          const s: Session = {
            id: gerarId(),
            nome: nomeAutomatico(0),
            mensagens: [],
            criadaEm: Date.now(),
          };
          return [s];
        }
        return rest;
      });
      if (activeId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        const first = remaining[0];
        if (first) setActiveId(first.id);
      }
    },
    [activeId, sessions],
  );

  const enviar = useCallback(
    async (prompt?: string) => {
      const p = (prompt ?? input).trim();
      const sessionId = activeIdRef.current;
      if (!p || loading || !sessionId) return;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setCmdHistory((prev) => [p, ...prev.slice(0, 49)]);
      setHistIdx(-1);
      setInput("");
      setLoading(true);
      limparEphemeral();
      setStatus("Pensando…");
      setStickToBottom(true);

      const startTime = Date.now();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 200);

      appendMsg(sessionId, novaMensagem("user", p));

      let content = "";
      let thinkingAcc = "";
      let committed = false;
      const toolsLog: { nome: string; result: string }[] = [];

      const commitAssistant = (texto: string) => {
        if (committed) return;
        committed = true;
        const body = texto.trim();
        if (!body && !thinkingAcc && toolsLog.length === 0) return;
        appendMsg(
          sessionId,
          novaMensagem("assistant", body || "(sem resposta)", {
            ...(toolsLog.length > 0 ? { tools: [...toolsLog] } : {}),
            ...(thinkingAcc.trim() ? { thinking: thinkingAcc.trim() } : {}),
          }),
        );
      };

      try {
        let r: Response;
        try {
          r = await fetch("/api/vps/agent", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt: p }),
            credentials: "include",
            signal: ac.signal,
          });
        } catch (netErr: unknown) {
          if (ac.signal.aborted) return;
          const msg = netErr instanceof Error ? netErr.message : "sem conexão";
          throw new Error(`Rede: ${msg}`);
        }
        if (!r.ok) {
          let msg = `Erro ${r.status}`;
          try {
            const e = (await r.json()) as { mensagem?: string; erro?: string };
            msg = e.mensagem || e.erro || msg;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        if (!r.body) throw new Error("Resposta vazia do servidor");

        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";

        const processarEvento = (payload: string) => {
          try {
            const d = JSON.parse(payload) as Record<string, unknown>;
            const tipo = String(d.type ?? "");

            if (tipo === "thinking" || tipo === "status") {
              setStatus(String(d.message ?? "Pensando…"));
              return;
            }

            if (tipo === "text") {
              const chunk = String(d.content ?? "");
              content = chunk || content;
              if (chunk) setStream(content);
              setStatus("");
              return;
            }

            if (tipo === "think") {
              const step = String(d.content ?? "").trim();
              if (!step) return;
              thinkingAcc = thinkingAcc ? `${thinkingAcc}\n\n${step}` : step;
              setReasoning(thinkingAcc);
              setStatus("Raciocinando…");
              return;
            }

            if (tipo === "tool-start") {
              const toolName = String(d.name || "ferramenta");
              const toolId = String(d.id || `${toolName}-${Date.now()}`);
              const target = alvoDaTool(toolName, String(d.args ?? ""), String(d.target ?? ""));
              setStatus(`${toolName}…`);
              setTasks((prev) => [
                ...prev.filter((t) => t.id !== toolId),
                { id: toolId, name: toolName, target, status: "running" },
              ]);
              return;
            }

            if (tipo === "tool-end") {
              const toolName = String(d.name || "ferramenta");
              const toolId = typeof d.id === "string" ? d.id : "";
              const result = String(d.result ?? "");
              toolsLog.push({ nome: toolName, result });
              setStatus("");
              setTasks((prev) =>
                prev.map((t) => {
                  if (toolId ? t.id === toolId : t.status === "running" && t.name === toolName) {
                    return { ...t, status: "done" as const, result };
                  }
                  return t;
                }),
              );
              return;
            }

            if (tipo === "done") {
              if (!content) content = String(d.content ?? "");
              commitAssistant(content || String(d.content ?? ""));
              if (timerRef.current) clearInterval(timerRef.current);
              setLoading(false);
              limparEphemeral();
              return;
            }

            if (tipo === "error") {
              commitAssistant(String(d.message || "Erro no agente"));
              if (timerRef.current) clearInterval(timerRef.current);
              setLoading(false);
              limparEphemeral();
            }
          } catch {
            /* linha SSE inválida */
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (ac.signal.aborted) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            return;
          }
          buf += dec.decode(value, { stream: true });

          let sepIdx = buf.indexOf("\n\n");
          while (sepIdx !== -1) {
            const bloco = buf.slice(0, sepIdx);
            buf = buf.slice(sepIdx + 2);
            for (const line of bloco.split("\n")) {
              if (line.startsWith("data: ")) processarEvento(line.slice(6));
            }
            sepIdx = buf.indexOf("\n\n");
          }
        }
        if (buf.trim()) {
          for (const line of buf.split("\n")) {
            if (line.startsWith("data: ")) processarEvento(line.slice(6));
          }
        }

        // Stream encerrou sem evento done — preserva resposta parcial
        if (!committed && (content || thinkingAcc || toolsLog.length > 0)) {
          commitAssistant(content);
        }
      } catch (e: unknown) {
        if (ac.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        commitAssistant(msg.startsWith("❌") ? msg : `❌ ${msg}`);
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        setLoading(false);
        limparEphemeral();
      }
    },
    [input, loading, appendMsg, limparEphemeral],
  );

  const handleSlash = useCallback(
    async (cmdName: string, fullInput?: string) => {
      setShowCmds(false);
      switch (cmdName) {
        case "/clear":
          setMsgs(() => []);
          limparEphemeral();
          break;
        case "/new":
          novaSessao();
          break;
        case "/list":
          setMsgs((prev) => [
            ...prev,
            novaMensagem(
              "system",
              sessions
                .filter((s) => s.mensagens.length > 0)
                .map(
                  (s) =>
                    `  ${s.id.slice(-6)}  ${s.nome}  ${s.mensagens.length} msgs  ${new Date(s.criadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
                )
                .join("\n") || "  Nenhum chat salvo.",
            ),
          ]);
          break;
        case "/switch":
          if (fullInput) {
            const target = fullInput.split(" ")[1];
            if (target) {
              const found = sessions.find((s) => s.id.endsWith(target));
              if (found) trocarSessao(found.id);
              else
                setMsgs((prev) => [
                  ...prev,
                  novaMensagem(
                    "system",
                    `Chat '${target}' não encontrado. Use /list para ver os chats.`,
                  ),
                ]);
            }
          }
          break;
        case "/delete":
          if (fullInput) {
            const target = fullInput.split(" ")[1];
            if (target) {
              const found = sessions.find((s) => s.id.endsWith(target));
              if (found) {
                const nome = found.nome;
                deletarSessao(found.id);
                // mensagem no chat ativo restante
                setMsgs((prev) => [...prev, novaMensagem("system", `Chat '${nome}' deletado.`)]);
              } else
                setMsgs((prev) => [
                  ...prev,
                  novaMensagem("system", `Chat '${target}' não encontrado.`),
                ]);
            }
          }
          break;
        case "/rename":
          if (fullInput && activeSession) {
            const novoNome = fullInput.slice("/rename ".length).trim();
            if (novoNome) {
              updateSession(activeSession.id, (s) => ({ ...s, nome: novoNome.slice(0, 30) }));
              setMsgs((prev) => [
                ...prev,
                novaMensagem("system", `Chat renomeado para '${novoNome.slice(0, 30)}'.`),
              ]);
            }
          }
          break;
        case "/export": {
          if (!activeSession) break;
          const md = [
            `# ${activeSession.nome}`,
            `> Exportado em ${new Date().toLocaleString("pt-BR")}`,
            "",
            ...activeSession.mensagens
              .map((m) => {
                const who =
                  m.role === "user"
                    ? "**Você**"
                    : m.role === "system"
                      ? "**Sistema**"
                      : "**CodingPro**";
                let txt = `${who}:\n${m.content}`;
                if (m.tools?.length) txt += `\n\n> Tools: ${m.tools.map((t) => t.nome).join(", ")}`;
                return txt;
              })
              .join("\n\n"),
          ];
          try {
            await navigator.clipboard.writeText(md.join("\n"));
            setMsgs((prev) => [
              ...prev,
              novaMensagem("system", "Chat exportado para a área de transferência como Markdown."),
            ]);
          } catch {
            const joined = md.join("\n");
            const blob = new Blob([joined], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${activeSession.nome.replace(/\s+/g, "_")}.md`;
            a.click();
            URL.revokeObjectURL(url);
          }
          break;
        }
        case "/history":
          setMsgs((prev) => [
            ...prev,
            novaMensagem(
              "system",
              cmdHistory.length > 0
                ? cmdHistory
                    .slice(0, 20)
                    .map((c, i) => `  ${String(i + 1).padStart(2)}. ${c}`)
                    .join("\n")
                : "  Nenhum comando no histórico.",
            ),
          ]);
          break;
        case "/context":
          try {
            const d = await POST<{ files: string[] }>("/api/vps/files");
            setFiles(d.files);
            setMsgs((prev) => [
              ...prev,
              novaMensagem(
                "system",
                `Workspace: ${d.files.length} arquivos/diretórios. Veja a aba Files.`,
              ),
            ]);
            setTab("files");
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setMsgs((prev) => [...prev, novaMensagem("system", `❌ ${msg}`)]);
          }
          break;
        case "/agent":
          if (fullInput) {
            const promptAgente = fullInput.slice("/agent ".length).trim();
            if (promptAgente) {
              setTab("chat");
              enviar(promptAgente);
            }
          } else {
            setTab("chat");
            setMsgs((prev) => [
              ...prev,
              novaMensagem(
                "system",
                "Modo agente ativado. Digite seu prompt para usar ferramentas reais (list_dir, read_file, write_file, bash, grep).",
              ),
            ]);
          }
          break;
        case "/files":
          try {
            const d = await POST<{ files: string[] }>("/api/vps/files");
            setFiles(d.files);
            setTab("files");
          } catch {}
          break;
        case "/memory":
          try {
            const d = await POST<{ files: string[] }>("/api/vps/memory", { action: "list" });
            setMemFiles(d.files);
            setTab("memory");
          } catch {}
          break;
        case "/help":
          setMsgs((prev) => [
            ...prev,
            novaMensagem("system", CMD_SLASH.map((c) => `${c.cmd} — ${c.desc}`).join("\n")),
          ]);
          break;
      }
    },
    [
      sessions,
      activeSession,
      novaSessao,
      trocarSessao,
      deletarSessao,
      updateSession,
      cmdHistory,
      POST,
      enviar,
      setMsgs,
      limparEphemeral,
    ],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "l") {
        e.preventDefault();
        handleSlash("/clear");
      }
      if (ctrl && e.key === "n") {
        e.preventDefault();
        novaSessao();
      }
      if (ctrl && e.key === "k") {
        e.preventDefault();
        setSidebarOpen((p) => !p);
      }
      if (e.key === "Escape") {
        setShowCmds(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [handleSlash, novaSessao]);

  const refreshFiles = useCallback(async () => {
    const d = await POST<{ files: string[] }>("/api/vps/files");
    setFiles(d.files);
  }, [POST]);

  useEffect(() => {
    refreshFiles().catch(() => {});
  }, [refreshFiles]);

  const openFile = useCallback(
    async (path: string) => {
      setActiveFile(path);
      setTab("editor");
      try {
        const d = await POST<{ content: string }>("/api/vps/read", { path });
        setCode(d.content);
      } catch {}
    },
    [POST],
  );

  const uploadFiles = useCallback(
    async (lista: FileList | File[]) => {
      const itens = Array.from(lista);
      if (itens.length === 0 || uploading) return;
      setUploading(true);
      try {
        const dados = new FormData();
        for (const file of itens) {
          const relativo = file.webkitRelativePath || file.name;
          const destino = filesCwd ? `${filesCwd}/${relativo}` : relativo;
          dados.append("path", destino.replaceAll("\\", "/"));
          dados.append("file", file, file.name);
        }
        const resposta = await fetch("/api/vps/upload", {
          method: "POST",
          body: dados,
          credentials: "include",
        });
        if (!resposta.ok) {
          const erroUpload = await resposta.json().catch(() => ({}));
          throw new Error(erroUpload.mensagem || "Não foi possível enviar os arquivos.");
        }
        await refreshFiles();
        setStatus(`${itens.length} arquivo(s) enviado(s)`);
      } catch (e: any) {
        setStatus(`Upload: ${e.message}`);
      } finally {
        setUploading(false);
      }
    },
    [filesCwd, refreshFiles, uploading],
  );

  const deleteFile = useCallback(
    async (path: string) => {
      if (!window.confirm(`Excluir '${path}' do seu workspace?`)) return;
      try {
        await POST("/api/vps/delete", { path });
        await refreshFiles();
      } catch (e: any) {
        setStatus(`Excluir: ${e.message}`);
      }
    },
    [POST, refreshFiles],
  );

  const saveFile = useCallback(async () => {
    if (!activeFile) return;
    try {
      await POST("/api/vps/write", { path: activeFile, content: code });
      setStatus("Arquivo salvo");
    } catch (e: any) {
      setStatus(`Salvar: ${e.message}`);
    }
  }, [POST, activeFile, code]);

  const runCmd = useCallback(
    async (c?: string) => {
      const cc = c ?? cmd;
      if (!cc.trim()) return;
      setCmd("");
      setTab("terminal");
      setOut((p) => `${p}\n$ ${cc}\n`);
      try {
        const d = await POST<{ stdout: string; stderr: string }>("/api/vps/terminal", {
          command: cc,
          cwd: ".",
        });
        setOut((p) => p + (d.stdout || "") + (d.stderr || ""));
      } catch (e: any) {
        setOut((p) => `${p}Erro: ${e.message}`);
      }
    },
    [cmd, POST],
  );

  const git = useCallback(
    async (action: string, url?: string) => {
      setTab("git");
      if (action === "clone") {
        setCloning(true);
        setGitOut("Clonando...");
      } else {
        setGitOut("...");
      }
      try {
        const d = await POST<{ output: string }>("/api/vps/git", {
          action,
          cwd: "repositorios",
          url,
        });
        setGitOut(d.output);
        if (action === "clone") {
          setGitOut((prev) => prev || "✅ Repositório clonado em repositorios/");
        }
      } catch (e: any) {
        setGitOut(e.message || "Erro");
      } finally {
        setCloning(false);
      }
    },
    [POST],
  );

  useEffect(() => {
    POST<{ files: string[] }>("/api/vps/memory", { action: "list" })
      .then((d) => setMemFiles(d.files))
      .catch(() => {});
  }, [POST]);

  const saveMem = useCallback(async () => {
    if (!memName) return;
    try {
      await POST("/api/vps/memory", { action: "save", name: memName, content: memContent });
      const d = await POST<{ files: string[] }>("/api/vps/memory", { action: "list" });
      setMemFiles(d.files);
      setStatus("Memória salva com sucesso");
    } catch (e: any) {
      setStatus(`Erro memória: ${e.message}`);
    }
  }, [memName, memContent, POST]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (input.startsWith("/")) {
          const parts = input.split(" ");
          handleSlash(parts[0] ?? "", input);
        } else enviar();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (histIdx === -1) setPendingInput(input);
        const next = histIdx + 1;
        if (next < cmdHistory.length) {
          setHistIdx(next);
          setInput(cmdHistory[next] ?? "");
        }
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (histIdx > 0) {
          const next = histIdx - 1;
          setHistIdx(next);
          setInput(cmdHistory[next] ?? "");
        } else if (histIdx === 0) {
          setHistIdx(-1);
          setInput(pendingInput);
        }
      }
    },
    [input, histIdx, cmdHistory, pendingInput, handleSlash, enviar],
  );

  // Global Drag and Drop Handler
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setGlobalDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setGlobalDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setGlobalDragging(false);
    if (e.dataTransfer.files?.length) {
      setTab("files");
      uploadFiles(e.dataTransfer.files);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: zona de drag-and-drop global do playground
    <div
      className="playground"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Global Drag and Drop Overlay */}
      {globalDragging && (
        <div className="playground__globalDropOverlay">
          <div className="playground__globalDropCard playground__card-rotating-border">
            <span className="playground__globalDropIcon">📥</span>
            <h3>Solte os arquivos para fazer upload</h3>
            <p>
              Os arquivos serão adicionados ao seu workspace <code>{filesCwd || "raiz"}</code>
            </p>
          </div>
        </div>
      )}

      <Sidebar
        sessions={sessions}
        activeId={activeId}
        sidebarOpen={sidebarOpen}
        renameId={renameId}
        renameVal={renameVal}
        onToggle={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
        onSelect={trocarSessao}
        onNew={novaSessao}
        onRename={(id, val) => {
          setRenameId(id);
          setRenameVal(val);
        }}
        onDelete={deletarSessao}
        onCancelRename={() => {
          if (renameId && renameVal.trim()) {
            updateSession(renameId, (s) => ({ ...s, nome: renameVal.trim().slice(0, 30) }));
          }
          setRenameId(null);
          setRenameVal("");
        }}
        onStartRename={(id, name) => {
          setRenameId(id);
          setRenameVal(name);
        }}
        userEmail={usuario.email}
        mobile={isMobile}
      />

      <div className="playground__main">
        <div className="playground__topbar">
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ display: sidebarOpen ? "none" : "flex" }}
            type="button"
            aria-label="Abrir sidebar"
            className="playground__menuBtn"
          >
            ☰
          </button>
          <div className="playground__brandGroup">
            <span className="playground__topbarLogo">⚡ CodingPro</span>
            <span className="playground__topbarBadge">v2.0</span>
          </div>

          {activeSession && (
            <span className="playground__topbarSession">· {activeSession.nome}</span>
          )}
          <span className="playground__topbarSpacer" />
          {status && <span className="playground__topbarStatus">{status}</span>}
          <span className="playground__topbarUser">{usuario.email}</span>
          <button
            onClick={novaSessao}
            type="button"
            aria-label="Novo chat"
            className="playground__topbarAddBtn"
            title="Novo Chat"
          >
            +
          </button>
        </div>

        {/* Desktop Tab Bar */}
        {!isMobile && (
          <TabBar
            tabs={TABS}
            activeTab={tab}
            onSelect={(id: string) => setTab(id as Tab)}
            isMobile={false}
          />
        )}

        <div className="playground__content">
          {tab === "chat" && (
            <ChatView
              session={activeSession ?? null}
              stream={stream}
              loading={loading}
              input={input}
              showCmds={showCmds}
              statusText={status}
              elapsedMs={elapsedMs}
              reasoning={reasoning}
              tasks={tasks}
              scrollRef={scrollRef}
              textareaRef={inpRef}
              stickToBottom={stickToBottom}
              onJumpBottom={() => {
                setStickToBottom(true);
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
              }}
              onInput={setInput}
              onShowCmds={setShowCmds}
              onKeyDown={handleInputKeyDown}
              onSend={() => enviar()}
              onSelectCmd={handleSlash}
            />
          )}
          {tab === "files" && (
            <FilesPanel
              files={files}
              cwd={filesCwd}
              uploading={uploading}
              onNavigate={setFilesCwd}
              onOpenFile={openFile}
              onUpload={uploadFiles}
              onRefresh={() => {
                refreshFiles().catch(() => {});
              }}
              onDelete={deleteFile}
            />
          )}
          {tab === "editor" && (
            <EditorPanel code={code} fileName={activeFile} onChange={setCode} onSave={saveFile} />
          )}
          {tab === "terminal" && (
            <TerminalPanel
              output={out}
              cmd={cmd}
              onCmdChange={setCmd}
              onRun={() => runCmd()}
              onClear={() => setOut("")}
              cmdRef={cmdRef}
            />
          )}
          {tab === "git" && (
            <GitPanel
              gitUrl={gitUrl}
              gitOut={gitOut}
              cloning={cloning}
              onUrlChange={setGitUrl}
              onClone={() => git("clone", gitUrl)}
              onAction={git}
            />
          )}
          {tab === "memory" && (
            <MemoryPanel
              memFiles={memFiles}
              memName={memName}
              memContent={memContent}
              onNameChange={setMemName}
              onContentChange={setMemContent}
              onSave={saveMem}
              onFileClick={async (f) => {
                try {
                  const d = await POST<{ content: string }>("/api/vps/memory", {
                    action: "load",
                    name: f.replace(".md", ""),
                  });
                  setMemName(f.replace(".md", ""));
                  setMemContent(d.content);
                  setTab("memory");
                } catch {}
              }}
            />
          )}
        </div>

        {/* Mobile Bottom Tab Bar (abas inferiores com ícone + label) */}
        {isMobile && (
          <TabBar
            tabs={TABS}
            activeTab={tab}
            onSelect={(id: string) => setTab(id as Tab)}
            isMobile={true}
          />
        )}
      </div>
    </div>
  );
}
