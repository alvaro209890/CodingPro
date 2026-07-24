import { useCallback, useEffect, useRef, useState } from "react";
import type { Usuario } from "../api.js";
import { navegar } from "../rotas.js";
import { ChatView } from "./ChatView.js";
import { EditorPanel } from "./EditorPanel.js";
import { FilesPanel } from "./FilesPanel.js";
import { GitPanel } from "./GitPanel.js";
import { ehNomePadrao, inferirNomeSessao, refinarNomeSessaoViaApi } from "./inferirNomeSessao.js";
import { MemoryPanel } from "./MemoryPanel.js";
import type { Mensagem, Session } from "./PlaygroundTypes.js";
import { Sidebar } from "./Sidebar.js";
import { TabBar } from "./TabBar.js";
import type { TaskRow } from "./TaskTrackerCard.js";
import { TerminalPanel } from "./TerminalPanel.js";

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
    return Array.isArray(parsed) ? parsed : [];
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

  // Runtime / Thinking / Task Tracker States
  const [elapsedMs, setElapsedMs] = useState(0);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const timerRef = useRef<any>(null);

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
    };
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
      if (!activeSession) return;
      updateSession(activeSession.id, (s) => ({ ...s, mensagens: fn(s.mensagens) }));
    },
    [activeSession, updateSession],
  );

  const [tab, setTab] = useState<Tab>("chat");
  const [stream, setStream] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCmds, setShowCmds] = useState(false);
  const [status, setStatus] = useState("");
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-rola ao receber mensagens ou streaming
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [_msgs, stream, loading]);

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

  const trocarSessao = useCallback((id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    setStream("");
    setStatus("");
    setTasks([]);
    setThinkingSteps([]);
  }, []);

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
      if (!p || loading) return;
      setCmdHistory((prev) => [p, ...prev.slice(0, 49)]);
      setHistIdx(-1);
      setInput("");
      setLoading(true);
      setStream("");
      setStatus("Pensando...");
      setThinkingSteps([
        "Analisando prompt do usuário...",
        "Planejando resposta e seleção de ferramentas...",
      ]);
      setTasks([]);
      setElapsedMs(0);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 100);

      setMsgs((prev) => [...prev, { role: "user", content: p, timestamp: Date.now() }]);
      const sessaoId = activeSession?.id;
      const podeAutoNomear = Boolean(
        activeSession && !activeSession.nomeManual && ehNomePadrao(activeSession.nome),
      );
      try {
        const toolsLog: { nome: string; result: string }[] = [];
        let r: Response;
        try {
          r = await fetch("/api/vps/agent", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt: p }),
            credentials: "include",
          });
        } catch (netErr: any) {
          throw new Error(`Rede: ${netErr.message || "sem conexão"}`);
        }
        if (!r.ok) {
          let msg = `Erro ${r.status}`;
          try {
            const e = await r.json();
            msg = e.mensagem || e.erro || msg;
          } catch {}
          throw new Error(msg);
        }
        if (!r.body) throw new Error("Resposta vazia do servidor");
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let content = "";

        const processarEvento = (payload: string) => {
          try {
            const d = JSON.parse(payload);
            if (d.type === "text") {
              content += d.content ?? "";
              setStream(content);
            } else if (d.type === "think") {
              setThinkingSteps((prev) => [...prev, d.content || ""]);
            } else if (d.type === "tool-start") {
              const toolName = d.name || "ferramenta";
              setStatus(`🔧 ${toolName}...`);
              setThinkingSteps((prev) => [...prev, `Executando ${toolName}...`]);
              setTasks((prev) => [
                ...prev,
                {
                  id: `${toolName}-${Date.now()}`,
                  name: toolName,
                  target: d.target || toolName,
                  status: "running",
                },
              ]);
            } else if (d.type === "tool-end") {
              const toolName = d.name || "ferramenta";
              toolsLog.push({ nome: toolName, result: d.result || "" });
              setStatus("");
              setThinkingSteps((prev) => [...prev, `Concluído: ${toolName}`]);
              setTasks((prev) =>
                prev.map((t) =>
                  t.status === "running" && t.name === toolName
                    ? { ...t, status: "done", result: d.result }
                    : t,
                ),
              );
            } else if (d.type === "done") {
              const textoFinal = content || d.content || "";
              setMsgs((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: textoFinal,
                  tools: toolsLog,
                  timestamp: Date.now(),
                },
              ]);
              if (sessaoId && podeAutoNomear) {
                const tituloLocal = inferirNomeSessao(p, textoFinal);
                updateSession(sessaoId, (s) =>
                  s.nomeManual ? s : { ...s, nome: tituloLocal },
                );
                void refinarNomeSessaoViaApi(POST, p, textoFinal).then((refinado) => {
                  if (!refinado) return;
                  updateSession(sessaoId, (s) =>
                    s.nomeManual ? s : { ...s, nome: refinado },
                  );
                });
              }
              setStream("");
              setStatus("");
            } else if (d.type === "error") {
              setMsgs((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `❌ ${d.message || "Erro no agente"}`,
                  timestamp: Date.now(),
                },
              ]);
              setStream("");
              setStatus("");
            }
          } catch {
            /* linha SSE inválida */
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
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
      } catch (e: any) {
        setMsgs((prev) => [
          ...prev,
          { role: "assistant", content: `❌ ${e.message}`, timestamp: Date.now() },
        ]);
      } finally {
        if (timerRef.current) clearInterval(timerRef.current);
        setLoading(false);
        setStream("");
        setStatus("");
      }
    },
    [input, loading, setMsgs, activeSession, updateSession, POST],
  );

  const handleSlash = useCallback(
    async (cmdName: string, fullInput?: string) => {
      setShowCmds(false);
      switch (cmdName) {
        case "/clear":
          setMsgs(() => []);
          setStream("");
          setStatus("");
          setTasks([]);
          setThinkingSteps([]);
          break;
        case "/new":
          novaSessao();
          break;
        case "/list":
          setMsgs((prev) => [
            ...prev,
            {
              role: "system",
              content:
                sessions
                  .filter((s) => s.mensagens.length > 0)
                  .map(
                    (s) =>
                      `  ${s.id.slice(-6)}  ${s.nome}  ${s.mensagens.length} msgs  ${new Date(s.criadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
                  )
                  .join("\n") || "  Nenhum chat salvo.",
              timestamp: Date.now(),
            },
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
                  {
                    role: "system",
                    content: `Chat '${target}' não encontrado. Use /list para ver os chats.`,
                    timestamp: Date.now(),
                  },
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
                deletarSessao(found.id);
                setMsgs((prev) => [
                  ...prev,
                  {
                    role: "system",
                    content: `Chat '${found.nome}' deletado.`,
                    timestamp: Date.now(),
                  },
                ]);
              } else
                setMsgs((prev) => [
                  ...prev,
                  {
                    role: "system",
                    content: `Chat '${target}' não encontrado.`,
                    timestamp: Date.now(),
                  },
                ]);
            }
          }
          break;
        case "/rename":
          if (fullInput && activeSession) {
            const novoNome = fullInput.slice("/rename ".length).trim();
            if (novoNome) {
              updateSession(activeSession.id, (s) => ({
                ...s,
                nome: novoNome.slice(0, 30),
                nomeManual: true,
              }));
              setMsgs((prev) => [
                ...prev,
                {
                  role: "system",
                  content: `Chat renomeado para '${novoNome.slice(0, 30)}'.`,
                  timestamp: Date.now(),
                },
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
              {
                role: "system",
                content: "📋 Chat exportado para a área de transferência como Markdown.",
                timestamp: Date.now(),
              },
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
            {
              role: "system",
              content:
                cmdHistory.length > 0
                  ? cmdHistory
                      .slice(0, 20)
                      .map((c, i) => `  ${String(i + 1).padStart(2)}. ${c}`)
                      .join("\n")
                  : "  Nenhum comando no histórico.",
              timestamp: Date.now(),
            },
          ]);
          break;
        case "/context":
          try {
            const d = await POST<{ files: string[] }>("/api/vps/files");
            setFiles(d.files);
            setMsgs((prev) => [
              ...prev,
              {
                role: "system",
                content: `📁 Workspace: ${d.files.length} arquivos/diretórios. Veja a aba Files.`,
                timestamp: Date.now(),
              },
            ]);
            setTab("files");
          } catch (e: any) {
            setMsgs((prev) => [
              ...prev,
              { role: "system", content: `❌ ${e.message}`, timestamp: Date.now() },
            ]);
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
              {
                role: "system",
                content:
                  "Modo agente ativado. Digite seu prompt para usar ferramentas reais (list_dir, read_file, write_file, bash, grep).",
                timestamp: Date.now(),
              },
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
            {
              role: "system",
              content: CMD_SLASH.map((c) => `${c.cmd} — ${c.desc}`).join("\n"),
              timestamp: Date.now(),
            },
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
        setGitOut("Clonando em workspace/repositorios/ ...");
      } else {
        setGitOut("...");
      }
      try {
        const d = await POST<{ output: string; ok?: boolean; repoPath?: string }>("/api/vps/git", {
          action,
          cwd: "repositorios",
          url,
        });
        const saida = d.output?.trim() || "";
        if (action === "clone") {
          const destino = d.repoPath || "repositorios/<nome-do-repo>";
          setGitOut(
            d.ok !== false
              ? `✅ Clonado com sucesso.\n\nDestino: ${destino}\n\n${saida}`
              : `❌ Falha no clone.\n\n${saida}`,
          );
          if (d.ok !== false) {
            await refreshFiles();
            setFilesCwd(d.repoPath || "repositorios");
            setTab("files");
          }
        } else {
          setGitOut(saida || "Concluído.");
        }
      } catch (e: any) {
        setGitOut(e.message || "Erro");
      } finally {
        setCloning(false);
      }
    },
    [POST, refreshFiles],
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
            updateSession(renameId, (s) => ({
              ...s,
              nome: renameVal.trim().slice(0, 30),
              nomeManual: true,
            }));
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
            type="button"
            className="playground__topbarPainelBtn"
            onClick={() => navegar("/painel")}
            title="Voltar ao painel da conta"
          >
            ← Painel
          </button>
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
              thinkingSteps={thinkingSteps}
              tasks={tasks}
              cmdHistory={cmdHistory}
              histIdx={histIdx}
              pendingInput={pendingInput}
              scrollRef={scrollRef}
              textareaRef={inpRef}
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
