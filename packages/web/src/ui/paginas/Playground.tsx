import { useCallback, useEffect, useRef, useState } from "react";
import type { Usuario } from "../api.js";

type Tab = "cli" | "chat" | "files" | "editor" | "terminal" | "git" | "memory";

interface Mensagem {
  role: string;
  content: string;
  tools?: { nome: string; result: string }[];
}

interface Session {
  id: string;
  nome: string;
  mensagens: Mensagem[];
  criadaEm: number;
}

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

const C = {
  bg: "#0a0a0a",
  bg2: "#111",
  border: "#222",
  green: "#00ff41",
  blue: "#00d4ff",
  yellow: "#ffd700",
  red: "#ff4444",
  text: "#cccccc",
  muted: "#666666",
  white: "#ffffff",
};

const S = (x?: React.CSSProperties): React.CSSProperties => ({
  background: C.bg,
  color: C.text,
  fontFamily: '"JetBrains Mono","Fira Code","Consolas",monospace',
  ...x,
});

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
  // ─── Sessions ───
  const [sessions, setSessions] = useState<Session[]>(() => carregarSessions());
  const [activeId, setActiveId] = useState<string>(() => carregarActiveId());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const autoSaveRef = useRef(0);

  // Garantir sempre uma sessao ativa
  const activeIdx = sessions.findIndex((s) => s.id === activeId);
  const activeSession = activeIdx >= 0 ? sessions[activeIdx] : (sessions[0] ?? null);

  // Se nao tem nenhuma sessao, cria
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
  }, [sessions, activeSession]);

  const msgs = activeSession?.mensagens ?? [];

  // Persistencia
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
      updateSession(activeSession.id, (s) => {
        const novas = fn(s.mensagens);
        autoSaveRef.current += 1;
        return { ...s, mensagens: novas };
      });
    },
    [activeSession, updateSession],
  );

  // ─── Tab / UI state ───
  const [tab, setTab] = useState<Tab>("cli");
  const [stream, setStream] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCmds, setShowCmds] = useState(false);
  const [status, setStatus] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [pendingInput, setPendingInput] = useState(""); // guarda input atual ao navegar historico

  // Files / Editor / Terminal / Git / Memory
  const [files, setFiles] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [activeFile, setActiveFile] = useState("");
  const [out, setOut] = useState("");
  const [cmd, setCmd] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [gitOut, setGitOut] = useState("");
  const [memFiles, setMemFiles] = useState<string[]>([]);
  const [memName, setMemName] = useState("");
  const [memContent, setMemContent] = useState("");

  const ref = useRef<HTMLDivElement>(null);
  const inpRef = useRef<HTMLTextAreaElement>(null);

  // ─── Helpers ───
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

  const scrollDown = () => setTimeout(() => ref.current?.scrollTo(0, ref.current.scrollHeight), 50);

  // ─── Session management ───
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
        setSessions((prev) => {
          const first = prev[0];
          if (first) setActiveId(first.id);
          return prev;
        });
      }
    },
    [activeId],
  );

  const confirmarRename = useCallback(
    (id: string) => {
      if (renameVal.trim()) {
        updateSession(id, (s) => ({ ...s, nome: renameVal.trim().slice(0, 30) }));
      }
      setRenameId(null);
      setRenameVal("");
    },
    [renameVal, updateSession],
  );

  // ─── Enviar / Streaming ───
  const enviar = useCallback(
    async (prompt?: string) => {
      const p = (prompt ?? input).trim();
      if (!p || loading) return;
      // Add to history
      setCmdHistory((prev) => [p, ...prev.slice(0, 49)]);
      setHistIdx(-1);
      setInput("");
      setLoading(true);
      setStream("");
      setStatus("Pensando...");
      setMsgs((prev) => [...prev, { role: "user", content: p }]);
      scrollDown();
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
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          for (const line of buf.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const d = JSON.parse(line.slice(6));
              if (d.type === "text") {
                content += d.content ?? "";
                setStream(content);
                scrollDown();
              } else if (d.type === "tool-start") setStatus(`🔧 ${d.name || ""}...`);
              else if (d.type === "tool-end") {
                toolsLog.push({ nome: d.name || "", result: d.result || "" });
                setStatus("");
              } else if (d.type === "done") {
                setMsgs((prev) => [
                  ...prev,
                  { role: "assistant", content: content || d.content || "", tools: toolsLog },
                ]);
                setStream("");
                setStatus("");
              }
            } catch {}
          }
          buf = buf.includes("\n") ? buf.slice(buf.lastIndexOf("\n") + 1) : buf;
        }
      } catch (e: any) {
        setMsgs((prev) => [...prev, { role: "assistant", content: `❌ ${e.message}` }]);
      } finally {
        setLoading(false);
        setStream("");
        setStatus("");
        scrollDown();
      }
    },
    [input, loading, setMsgs],
  );

  // ─── Slash commands ───
  const handleSlash = useCallback(
    async (cmdName: string, fullInput?: string) => {
      setShowCmds(false);
      switch (cmdName) {
        case "/clear":
          setMsgs(() => []);
          setStream("");
          setStatus("");
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
                    (s, i) =>
                      `  ${s.id.slice(-6)}  ${s.nome}  ${s.mensagens.length} msgs  ${new Date(s.criadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
                  )
                  .join("\n") || "  Nenhum chat salvo.",
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
                  { role: "system", content: `Chat '${found.nome}' deletado.` },
                ]);
              } else {
                setMsgs((prev) => [
                  ...prev,
                  { role: "system", content: `Chat '${target}' não encontrado.` },
                ]);
              }
            }
          }
          break;
        case "/rename":
          if (fullInput) {
            const novoNome = fullInput.slice("/rename ".length).trim();
            if (novoNome && activeSession) {
              updateSession(activeSession.id, (s) => ({ ...s, nome: novoNome.slice(0, 30) }));
              setMsgs((prev) => [
                ...prev,
                { role: "system", content: `Chat renomeado para '${novoNome.slice(0, 30)}'.` },
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
            ...activeSession.mensagens.map((m) => {
              const who =
                m.role === "user"
                  ? "**Você**"
                  : m.role === "system"
                    ? "**Sistema**"
                    : "**CodingPro**";
              let txt = `${who}:\n${m.content}`;
              if (m.tools?.length) txt += `\n\n> Tools: ${m.tools.map((t) => t.nome).join(", ")}`;
              return txt;
            }),
          ].join("\n\n");
          // Copy to clipboard
          try {
            await navigator.clipboard.writeText(md);
            setMsgs((prev) => [
              ...prev,
              {
                role: "system",
                content: "📋 Chat exportado para a área de transferência como Markdown.",
              },
            ]);
          } catch {
            // Fallback: download
            const blob = new Blob([md], { type: "text/markdown" });
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
              },
            ]);
            setTab("files");
          } catch (e: any) {
            setMsgs((prev) => [...prev, { role: "system", content: `❌ ${e.message}` }]);
          }
          break;
        case "/agent":
          if (fullInput) {
            const promptAgente = fullInput.slice("/agent ".length).trim();
            if (promptAgente) {
              setTab("chat");
              // Força modo agente: o endpoint /api/vps/agent ja e o agente
              enviar(promptAgente);
            }
          } else {
            setTab("chat");
            setMsgs((prev) => [
              ...prev,
              {
                role: "system",
                content:
                  "Modo agente ativado. Digite seu prompt para usar tools reais (list_dir, read_file, write_file, bash, grep).",
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
            { role: "system", content: CMD_SLASH.map((c) => `${c.cmd} — ${c.desc}`).join("\n") },
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
      setFiles,
      setMemFiles,
      setTab,
    ],
  );

  // ─── Keyboard shortcuts ───
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

  // ─── Files ───
  useEffect(() => {
    POST<{ files: string[] }>("/api/vps/files")
      .then((d) => setFiles(d.files))
      .catch(() => {});
  }, [POST]);
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

  // ─── Terminal ───
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

  // ─── Git ───
  const git = useCallback(
    async (action: string, url?: string) => {
      setTab("git");
      setGitOut("...");
      try {
        const d = await POST<{ output: string }>("/api/vps/git", { action, cwd: "Projects", url });
        setGitOut(d.output);
      } catch (e: any) {
        setGitOut(e.message);
      }
    },
    [POST],
  );

  // ─── Memory ───
  useEffect(() => {
    POST<{ files: string[] }>("/api/vps/memory", { action: "list" })
      .then((d) => setMemFiles(d.files))
      .catch(() => {});
  }, [POST]);
  const saveMem = useCallback(async () => {
    if (!memName) return;
    try {
      await POST("/api/vps/memory", { action: "save", name: memName, content: memContent });
    } catch {}
  }, [memName, memContent, POST]);

  // ─── Tab config ───
  const tabs: { id: Tab; ico: string; lbl: string }[] = [
    { id: "cli", ico: "⚡", lbl: "CLI" },
    { id: "chat", ico: "💬", lbl: "Chat" },
    { id: "files", ico: "📁", lbl: "Files" },
    { id: "editor", ico: "✏️", lbl: "Editor" },
    { id: "terminal", ico: ">_", lbl: "Term" },
    { id: "git", ico: "🔀", lbl: "Git" },
    { id: "memory", ico: "🧠", lbl: "Mem" },
  ];

  const isCliChat = tab === "cli" || tab === "chat";

  // ─── Sidebar ───
  const sidebar = (
    <div
      style={
        {
          display: sidebarOpen ? "flex" : "none",
          flexDirection: "column",
          width: "100%",
          maxWidth: "280px",
          height: "100%",
          background: C.bg2,
          borderRight: `1px solid ${C.border}`,
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 20,
          "@media (minWidth: 768px)": { display: "flex", position: "static" },
        } as React.CSSProperties
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0.5rem",
          borderBottom: `1px solid ${C.border}`,
          gap: "0.3rem",
        }}
      >
        <span style={{ color: C.green, fontWeight: 700, fontSize: "0.75rem", flex: 1 }}>
          💬 Chats
        </span>
        <button
          onClick={novaSessao}
          style={{
            ...S(),
            background: C.green,
            color: "#000",
            border: "none",
            borderRadius: "4px",
            padding: "0.15rem 0.4rem",
            cursor: "pointer",
            fontSize: "0.7rem",
            fontWeight: 700,
          }}
          type="button"
        >
          + Novo
        </button>
        <button
          onClick={() => setSidebarOpen(false)}
          style={{
            ...S(),
            border: "none",
            color: C.muted,
            cursor: "pointer",
            fontSize: "0.85rem",
            padding: "0 0.2rem",
          }}
          type="button"
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {sessions
          .filter((s) => s.mensagens.length > 0)
          .map((s) => (
            <div
              key={s.id}
              onClick={() => trocarSessao(s.id)}
              style={{
                padding: "0.4rem 0.5rem",
                cursor: "pointer",
                borderBottom: `1px solid ${C.border}`,
                background: s.id === activeId ? C.bg : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {renameId === s.id ? (
                  <input
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => confirmarRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmarRename(s.id);
                      if (e.key === "Escape") setRenameId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      ...S(),
                      background: C.bg,
                      border: `1px solid ${C.green}`,
                      borderRadius: "3px",
                      color: C.green,
                      fontSize: "0.7rem",
                      padding: "0.1rem 0.2rem",
                      width: "100%",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      color: s.id === activeId ? C.green : C.text,
                      fontSize: "0.75rem",
                      fontWeight: s.id === activeId ? 700 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.nome}
                  </div>
                )}
                <div style={{ color: C.muted, fontSize: "0.6rem" }}>
                  {s.mensagens.length} msgs ·{" "}
                  {new Date(s.criadaEm).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                  })}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameId(s.id);
                  setRenameVal(s.nome);
                }}
                style={{
                  ...S(),
                  border: "none",
                  color: C.muted,
                  cursor: "pointer",
                  fontSize: "0.7rem",
                  padding: "0.1rem 0.2rem",
                  background: "transparent",
                }}
                title="Renomear"
                type="button"
              >
                ✎
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Deletar '${s.nome}'?`)) deletarSessao(s.id);
                }}
                style={{
                  ...S(),
                  border: "none",
                  color: C.red,
                  cursor: "pointer",
                  fontSize: "0.7rem",
                  padding: "0.1rem 0.2rem",
                  background: "transparent",
                }}
                title="Deletar"
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
        {sessions.filter((s) => s.mensagens.length > 0).length === 0 && (
          <div style={{ padding: "1rem", color: C.muted, fontSize: "0.7rem", textAlign: "center" }}>
            Nenhum chat ainda. Use o botão "+ Novo" para criar.
          </div>
        )}
      </div>
      <div
        style={{
          padding: "0.4rem 0.5rem",
          borderTop: `1px solid ${C.border}`,
          fontSize: "0.6rem",
          color: C.muted,
        }}
      >
        {usuario.email}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "calc(100dvh - 52px)", ...S(), position: "relative" }}>
      {/* Sidebar overlay para mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "absolute", inset: 0, zIndex: 19, background: "rgba(0,0,0,0.5)" }}
        />
      )}
      {sidebar}

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.3rem 0.6rem",
            background: C.bg2,
            borderBottom: `1px solid ${C.border}`,
            fontSize: "0.7rem",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              ...S(),
              border: "none",
              color: C.green,
              fontSize: "0.85rem",
              cursor: "pointer",
              padding: "0 0.2rem",
              display: sidebarOpen ? "none" : "block",
            }}
            type="button"
          >
            ☰
          </button>
          <span style={{ color: C.green, fontWeight: 700, fontSize: "0.85rem" }}>⚡ CodingPro</span>
          {activeSession && (
            <span style={{ color: C.muted, fontSize: "0.65rem" }}>· {activeSession.nome}</span>
          )}
          <span style={{ flex: 1 }} />
          {status && <span style={{ color: C.yellow, fontSize: "0.65rem" }}>{status}</span>}
          <span style={{ color: C.muted, fontSize: "0.6rem" }}>{usuario.email}</span>
          <button
            onClick={novaSessao}
            style={{
              ...S(),
              border: `1px solid ${C.border}`,
              borderRadius: "4px",
              padding: "0.1rem 0.35rem",
              cursor: "pointer",
              fontSize: "0.65rem",
              color: C.muted,
            }}
            type="button"
          >
            +
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* CLI + Chat */}
          {isCliChat && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div ref={ref} style={{ flex: 1, overflow: "auto", padding: "0.5rem 0.75rem" }}>
                {msgs.length === 0 && !stream && (
                  <div style={{ padding: "1.5rem 0", textAlign: "center" }}>
                    <pre
                      style={{
                        color: C.green,
                        fontSize: "0.55rem",
                        lineHeight: "1.3",
                        margin: "0 0 0.75rem",
                        whiteSpace: "pre",
                      }}
                    >
                      {`
 ╔══════════════════════════════════════╗
 ║   ___      _ _    _   ___           ║
 ║  / __|___ |_| |__| |_| _ \\\\_ _ ___   ║
 ║ | (__/ _ \\\\| | / _\` | ||  _/ '_/ _\\\\  ║
 ║  \\\\___\\\\___// |_\\\\__,_|\\\\__|_| |_| \\\\___/  ║
 ║          |__/                        ║
 ║  CLI local · DeepSeek V4 Pro/Flash   ║
 ╚══════════════════════════════════════╝`.slice(1)}
                    </pre>
                    <div style={{ color: C.green, fontSize: "0.8rem", marginBottom: "0.3rem" }}>
                      Bem-vindo ao CodingPro CLI
                    </div>
                    <div style={{ color: C.muted, fontSize: "0.7rem" }}>
                      Digite <span style={{ color: C.green }}>/</span> para comandos ·{" "}
                      <span style={{ color: C.green }}>Ctrl+N</span> novo chat ·{" "}
                      <span style={{ color: C.green }}>Ctrl+K</span> chats
                    </div>
                  </div>
                )}

                {msgs.map((m, i) => (
                  <div key={i} style={{ marginBottom: "0.6rem" }}>
                    <div
                      style={{
                        color:
                          m.role === "user" ? C.blue : m.role === "system" ? C.yellow : C.green,
                        fontWeight: 600,
                        fontSize: "0.72rem",
                        marginBottom: "0.15rem",
                      }}
                    >
                      {m.role === "user"
                        ? "▸ você"
                        : m.role === "system"
                          ? "⚙ sistema"
                          : "◂ codingpro"}
                    </div>
                    <div
                      style={{
                        color: C.text,
                        whiteSpace: "pre-wrap",
                        fontSize: "0.78rem",
                        lineHeight: "1.55",
                        paddingLeft: "0.3rem",
                      }}
                    >
                      {m.content}
                    </div>
                    {m.tools?.map((t, j) => (
                      <div
                        key={j}
                        style={{
                          marginTop: "0.2rem",
                          paddingLeft: "0.5rem",
                          fontSize: "0.65rem",
                          color: C.muted,
                        }}
                      >
                        <span style={{ color: C.yellow }}>🔧 {t.nome}</span> —{" "}
                        {t.result?.slice(0, 150)}
                      </div>
                    ))}
                  </div>
                ))}

                {stream && (
                  <div style={{ marginBottom: "0.6rem" }}>
                    <div
                      style={{
                        color: C.green,
                        fontWeight: 600,
                        fontSize: "0.72rem",
                        marginBottom: "0.15rem",
                      }}
                    >
                      ◂ codingpro
                    </div>
                    <div
                      style={{
                        color: C.text,
                        whiteSpace: "pre-wrap",
                        fontSize: "0.78rem",
                        lineHeight: "1.55",
                        paddingLeft: "0.3rem",
                      }}
                    >
                      {stream}
                      <span className="blink" style={{ color: C.green }}>
                        ▌
                      </span>
                    </div>
                  </div>
                )}

                {loading && !stream && (
                  <div style={{ color: C.muted, fontSize: "0.7rem" }}>...</div>
                )}
              </div>

              {/* Slash dropdown */}
              {showCmds && input.startsWith("/") && (
                <div
                  style={{
                    margin: "0 0.75rem",
                    background: C.bg2,
                    border: `1px solid ${C.border}`,
                    borderRadius: "6px",
                    padding: "0.3rem",
                    position: "absolute",
                    bottom: "100px",
                    left: "10px",
                    zIndex: 10,
                    minWidth: "200px",
                    maxHeight: "200px",
                    overflow: "auto",
                  }}
                >
                  {CMD_SLASH.filter((c) => c.cmd.startsWith(input.split(" ")[0] ?? "")).map((c) => (
                    <div
                      key={c.cmd}
                      onClick={() => {
                        handleSlash(c.cmd.split(" ")[0] ?? "", input);
                        setInput("");
                      }}
                      style={{
                        padding: "0.2rem 0.5rem",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        borderRadius: "3px",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: C.green, fontWeight: 600 }}>{c.cmd}</span>
                      <span style={{ color: C.muted }}>{c.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* CLI Input */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "0.3rem",
                  padding: "0.4rem 0.6rem",
                  borderTop: `1px solid ${C.border}`,
                  background: C.bg2,
                }}
              >
                <span
                  style={{
                    color: C.green,
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    paddingBottom: "0.3rem",
                  }}
                >
                  ▸
                </span>
                <textarea
                  ref={inpRef as any}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setShowCmds(e.target.value.startsWith("/") && e.target.value.length <= 12);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (input.startsWith("/")) {
                        const parts = input.split(" ");
                        handleSlash(parts[0] ?? "", input);
                      } else enviar();
                    }
                    // Command history
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
                  }}
                  placeholder="O que você quer criar, corrigir ou analisar?"
                  rows={1}
                  style={{
                    flex: 1,
                    ...S({ background: C.bg2 }),
                    border: `1px solid ${C.border}`,
                    borderRadius: "6px",
                    color: C.text,
                    fontSize: "0.82rem",
                    padding: "0.4rem 0.5rem",
                    resize: "none",
                    outline: "none",
                    lineHeight: "1.4",
                    maxHeight: "120px",
                  }}
                  onInput={(e) => {
                    const t = e.target as HTMLTextAreaElement;
                    t.style.height = "auto";
                    t.style.height = Math.min(t.scrollHeight, 120) + "px";
                  }}
                />
                <button
                  onClick={() => enviar()}
                  disabled={loading}
                  style={{
                    ...S(),
                    background: C.green,
                    color: "#000",
                    border: "none",
                    borderRadius: "6px",
                    padding: "0.4rem 0.7rem",
                    cursor: loading ? "default" : "pointer",
                    fontWeight: 700,
                    fontSize: "0.8rem",
                    opacity: loading ? 0.5 : 1,
                  }}
                  type="button"
                >
                  ▶
                </button>
              </div>
            </div>
          )}

          {/* Files */}
          {tab === "files" && (
            <div style={{ padding: "0.5rem", overflow: "auto", flex: 1 }}>
              {files.map((f) => (
                <div
                  key={f}
                  onClick={() => (f.endsWith("/") ? null : openFile(f))}
                  style={{
                    display: "flex",
                    padding: "0.2rem 0.3rem",
                    cursor: f.endsWith("/") ? "default" : "pointer",
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: "0.82rem",
                  }}
                >
                  <span style={{ color: f.endsWith("/") ? C.blue : C.muted }}>
                    {f.endsWith("/") ? "📁" : "📄"}
                  </span>
                  <span style={{ marginLeft: "0.3rem" }}>{f}</span>
                </div>
              ))}
            </div>
          )}

          {/* Editor */}
          {tab === "editor" && (
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                ...S(),
                border: "none",
                color: C.text,
                fontSize: "13px",
                lineHeight: "1.7",
                padding: "0.75rem",
                resize: "none",
                outline: "none",
              }}
            />
          )}

          {/* Terminal */}
          {tab === "terminal" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "0.5rem",
                  whiteSpace: "pre-wrap",
                  fontSize: "0.82rem",
                  color: C.green,
                }}
              >
                {out || "▸ _"}
              </div>
              <div
                style={{ display: "flex", padding: "0.3rem", borderTop: `1px solid ${C.border}` }}
              >
                <span style={{ color: C.green, padding: "0.3rem" }}>$</span>
                <input
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runCmd();
                  }}
                  placeholder="comando..."
                  autoFocus
                  style={{
                    flex: 1,
                    ...S(),
                    border: "none",
                    color: C.green,
                    fontSize: "0.82rem",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          )}

          {/* Git */}
          {tab === "git" && (
            <div
              style={{
                padding: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                overflow: "auto",
                flex: 1,
              }}
            >
              <div style={{ display: "flex", gap: "0.3rem" }}>
                <input
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  style={{
                    flex: 1,
                    ...S(),
                    background: C.bg2,
                    border: `1px solid ${C.border}`,
                    borderRadius: "6px",
                    color: C.text,
                    fontSize: "0.82rem",
                    padding: "0.35rem",
                  }}
                />
                <button
                  onClick={() => git("clone", gitUrl)}
                  style={{
                    ...S(),
                    background: C.green,
                    color: "#000",
                    border: "none",
                    borderRadius: "6px",
                    padding: "0.3rem 0.6rem",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                  }}
                  type="button"
                >
                  Clone
                </button>
              </div>
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {["status", "pull", "log"].map((a) => (
                  <button
                    key={a}
                    onClick={() => git(a)}
                    style={{
                      ...S(),
                      border: `1px solid ${C.border}`,
                      borderRadius: "6px",
                      padding: "0.25rem 0.5rem",
                      cursor: "pointer",
                      color: C.muted,
                      fontSize: "0.75rem",
                    }}
                    type="button"
                  >
                    {a}
                  </button>
                ))}
              </div>
              <pre
                style={{
                  color: C.muted,
                  whiteSpace: "pre-wrap",
                  fontSize: "0.8rem",
                  background: C.bg2,
                  padding: "0.5rem",
                  borderRadius: "6px",
                  flex: 1,
                }}
              >
                {gitOut || "output do git..."}
              </pre>
            </div>
          )}

          {/* Memory */}
          {tab === "memory" && (
            <div style={{ flex: 1, display: "flex", padding: "0.5rem", gap: "0.5rem" }}>
              <div
                style={{
                  width: "120px",
                  borderRight: `1px solid ${C.border}`,
                  paddingRight: "0.5rem",
                }}
              >
                <div style={{ color: C.yellow, fontSize: "0.75rem", marginBottom: "0.3rem" }}>
                  .memory/
                </div>
                {memFiles.map((f) => (
                  <div
                    key={f}
                    onClick={async () => {
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
                    style={{
                      cursor: "pointer",
                      padding: "0.1rem 0",
                      fontSize: "0.75rem",
                      color: C.muted,
                    }}
                  >
                    📝 {f}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  <input
                    value={memName}
                    onChange={(e) => setMemName(e.target.value)}
                    placeholder="nome"
                    style={{
                      width: "100px",
                      ...S(),
                      background: C.bg2,
                      border: `1px solid ${C.border}`,
                      borderRadius: "4px",
                      color: C.text,
                      fontSize: "0.8rem",
                      padding: "0.2rem",
                    }}
                  />
                  <button
                    onClick={saveMem}
                    style={{
                      ...S(),
                      background: C.green,
                      color: "#000",
                      border: "none",
                      borderRadius: "4px",
                      padding: "0.2rem 0.5rem",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}
                    type="button"
                  >
                    Salvar
                  </button>
                </div>
                <textarea
                  value={memContent}
                  onChange={(e) => setMemContent(e.target.value)}
                  placeholder="Anotações..."
                  style={{
                    flex: 1,
                    ...S(),
                    background: C.bg2,
                    border: `1px solid ${C.border}`,
                    borderRadius: "6px",
                    color: C.text,
                    fontSize: "0.82rem",
                    padding: "0.5rem",
                    resize: "none",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", background: C.bg2, borderTop: `1px solid ${C.border}` }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "0.4rem 0.2rem",
                background: tab === t.id ? C.bg : "transparent",
                border: "none",
                borderTop: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent",
                color: tab === t.id ? C.green : C.muted,
                fontFamily: "inherit",
                fontSize: "0.6rem",
                fontWeight: tab === t.id ? 700 : 400,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.1rem",
              }}
              type="button"
            >
              <span style={{ fontSize: "0.85rem" }}>{t.ico}</span> {t.lbl}
            </button>
          ))}
        </div>
      </div>

      <style>{`.blink{animation:blink 1s infinite}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}
