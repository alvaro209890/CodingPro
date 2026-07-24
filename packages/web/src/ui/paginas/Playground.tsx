import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";

type Aba = "files" | "editor" | "terminal" | "git" | "chat" | "memory" | "cli";

const COMANDOS = [
  { cmd: "/clear", desc: "Limpar conversa" },
  { cmd: "/files", desc: "Listar arquivos" },
  { cmd: "/memory", desc: "Salvar na memória" },
  { cmd: "/help", desc: "Ajuda" },
];

const CLR = {
  bg: "#0d1117",
  bg2: "#161b22",
  border: "#30363d",
  green: "#3fb950",
  blue: "#58a6ff",
  yellow: "#d29922",
  red: "#f85149",
  text: "#c9d1d9",
  muted: "#8b949e",
  white: "#f0f6fc",
};

const css = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: CLR.bg, color: CLR.text, fontFamily: 'SF Mono,Consolas,monospace', ...extra,
});

export function Playground({ usuario }: { usuario: Usuario }) {
  const [aba, setAba] = useState<Aba>("chat");
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [cmdInput, setCmdInput] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [gitOutput, setGitOutput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [streaming, setStreaming] = useState("");
  const [thinking, setThinking] = useState(false);
  const [memoryFiles, setMemoryFiles] = useState<string[]>([]);
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryName, setMemoryName] = useState("");
  const [cliOut, setCliOut] = useState("");
  const [cliRunning, setCliRunning] = useState(false);
  const [showCmds, setShowCmds] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);

  const post = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const r = await fetch(`https://codingpro-api.cursar.space${path}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : "{}", credentials: "include",
    });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as any).mensagem || "Erro");
    return r.json() as T;
  }, []);

  // Files
  const loadFiles = useCallback(async () => {
    try { const d = await post<{ files: string[] }>("/api/vps/files"); setFiles(d.files); } catch {}
  }, [post]);
  useEffect(() => { loadFiles(); }, [loadFiles]);

  const openFile = useCallback(async (path: string) => {
    setActiveFile(path); setAba("editor");
    try { const d = await post<{ content: string }>("/api/vps/read", { path }); setCode(d.content); } catch {}
  }, [post]);

  const saveFile = useCallback(async () => {
    if (!activeFile) return;
    try { await post("/api/vps/write", { path: activeFile, content: code }); loadFiles(); } catch {}
  }, [activeFile, code, post, loadFiles]);

  // Agent chat
  const sendChat = useCallback(async (prompt: string) => {
    if (!prompt.trim() || thinking) return;
    setChatInput(""); setThinking(true); setStreaming("");
    setMessages((p) => [...p, { role: "user", content: prompt }]);
    try {
      const r = await fetch("https://codingpro-api.cursar.space/api/vps/agent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }), credentials: "include",
      });
      const reader = r.body!.getReader();
      const dec = new TextDecoder(); let buf = ""; let content = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const line of buf.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === "text") { content += d.content ?? ""; setStreaming(content); }
            else if (d.type === "done") { setMessages((p) => [...p, { role: "assistant", content: content || d.content || "" }]); setStreaming(""); }
          } catch {}
        }
      }
    } catch (e: any) {
      setMessages((p) => [...p, { role: "assistant", content: "❌ " + e.message }]);
    } finally { setThinking(false); setStreaming(""); }
  }, [thinking]);

  // Terminal
  const runCmd = useCallback(async (cmd?: string) => {
    const c = cmd ?? cmdInput; if (!c.trim()) return;
    setCmdInput(""); setAba("terminal"); setOutput((p) => p + `$ ${c}\n`); setThinking(true);
    try {
      const d = await post<{ stdout: string; stderr: string; code?: number }>("/api/vps/terminal", { command: c, cwd: "." });
      setOutput((p) => p + (d.stdout || "") + (d.stderr || ""));
    } catch (e: any) { setOutput((p) => p + `Erro: ${e.message}\n`); }
    finally { setThinking(false); }
  }, [cmdInput, post]);

  // Git
  const git = useCallback(async (action: string, url?: string) => {
    setGitOutput("..."); setAba("git");
    try { const d = await post<{ output: string }>("/api/vps/git", { action, cwd: "Projects", url }); setGitOutput(d.output); loadFiles(); } catch (e: any) { setGitOutput(e.message); }
  }, [post, loadFiles]);

  // Memory
  const loadMems = useCallback(async () => {
    try { const d = await post<{ files: string[] }>("/api/vps/memory", { action: "list" }); setMemoryFiles(d.files); } catch {}
  }, [post]);
  useEffect(() => { loadMems(); }, [loadMems]);
  const saveMem = useCallback(async () => {
    if (!memoryName) return;
    try { await post("/api/vps/memory", { action: "save", name: memoryName, content: memoryContent }); loadMems(); } catch {}
  }, [memoryName, memoryContent, post, loadMems]);

  // CLI
  const runCli = useCallback(async (prompt: string) => {
    if (!prompt.trim() || cliRunning) return;
    setCliRunning(true); setCliOut((p) => p + `\n▸ ${prompt}\n`); setAba("cli");
    try {
      const r = await fetch("https://codingpro-api.cursar.space/api/vps/cli/exec", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }), credentials: "include",
      });
      const reader = r.body!.getReader();
      const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const line of buf.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try { const d = JSON.parse(line.slice(6)); if (typeof d === "string") setCliOut((p) => p + d); } catch {}
        }
      }
    } catch (e: any) { setCliOut((p) => p + `\n[${e.message}]`); }
    finally { setCliRunning(false); }
  }, [cliRunning]);

  // Slash
  const handleSlash = useCallback((cmd: string) => {
    setShowCmds(false);
    if (cmd === "/clear") { setMessages([]); setStreaming(""); }
    else if (cmd === "/files") { setAba("files"); loadFiles(); }
    else if (cmd === "/memory") { setAba("memory"); }
    else if (cmd === "/help") { setMessages((p) => [...p, { role: "system", content: COMANDOS.map((c) => `${c.cmd} — ${c.desc}`).join("\n") }]); }
  }, [loadFiles]);

  const tabs: { id: Aba; label: string; icon: string }[] = [
    { id: "chat", label: "Chat", icon: "💬" },
    { id: "cli", label: "CLI", icon: "⚡" },
    { id: "files", label: "Files", icon: "📁" },
    { id: "editor", label: "Editor", icon: "✏️" },
    { id: "terminal", label: "Terminal", icon: ">_" },
    { id: "git", label: "Git", icon: "🔀" },
    { id: "memory", label: "Memory", icon: "🧠" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", ...css() }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0.75rem", background: CLR.bg2, borderBottom: `1px solid ${CLR.border}`, fontSize: "0.75rem" }}>
        <span style={{ color: CLR.green, fontWeight: 700 }}>⚡ CodingPro</span>
        <span style={{ color: CLR.muted }}>VPS</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: CLR.muted, fontSize: "0.65rem" }}>{usuario.email}</span>
        <button onClick={() => { setMessages([]); setStreaming(""); }} style={{ ...css(), border: `1px solid ${CLR.border}`, borderRadius: "4px", padding: "0.15rem 0.4rem", cursor: "pointer", fontSize: "0.7rem", color: CLR.muted }}>+ Novo</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Chat */}
        {aba === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div ref={chatRef} style={{ flex: 1, overflow: "auto", padding: "0.75rem" }}>
              {messages.length === 0 && !streaming && (
                <div style={{ textAlign: "center", padding: "2rem", color: CLR.muted, fontSize: "0.85rem" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚡</div>
                  <div>CodingPro VPS — IA no seu workspace</div>
                  <div style={{ fontSize: "0.7rem", marginTop: "0.5rem" }}>Digite / para comandos</div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ marginBottom: "0.75rem" }}>
                  <div style={{ color: m.role === "user" ? CLR.blue : CLR.green, fontWeight: 600, fontSize: "0.8rem", marginBottom: "0.2rem" }}>
                    {m.role === "user" ? "▸ Você" : "◂ CodingPro"}
                  </div>
                  <div style={{ color: CLR.text, whiteSpace: "pre-wrap", fontSize: "0.82rem", lineHeight: "1.6" }}>{m.content}</div>
                </div>
              ))}
              {streaming && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div style={{ color: CLR.green, fontWeight: 600, fontSize: "0.8rem", marginBottom: "0.2rem" }}>◂ CodingPro</div>
                  <div style={{ color: CLR.text, whiteSpace: "pre-wrap", fontSize: "0.82rem", lineHeight: "1.6" }}>{streaming}<span className="blink">▌</span></div>
                </div>
              )}
              {thinking && !streaming && <div style={{ color: CLR.muted, fontSize: "0.8rem" }}>Pensando...</div>}
            </div>

            {/* Slash dropdown */}
            {showCmds && chatInput.startsWith("/") && (
              <div style={{ margin: "0 0.75rem", background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: "6px", padding: "0.3rem" }}>
                {COMANDOS.filter((c) => c.cmd.startsWith(chatInput)).map((c) => (
                  <div key={c.cmd} onClick={() => { setChatInput(c.cmd + " "); setShowCmds(false); }}
                    style={{ padding: "0.25rem 0.5rem", cursor: "pointer", fontSize: "0.8rem", borderRadius: "3px" }}>
                    <span style={{ color: CLR.green }}>{c.cmd}</span> <span style={{ color: CLR.muted }}>— {c.desc}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{ display: "flex", gap: "0.3rem", padding: "0.5rem 0.75rem", borderTop: `1px solid ${CLR.border}` }}>
              <textarea
                value={chatInput}
                onChange={(e) => { setChatInput(e.target.value); setShowCmds(e.target.value.startsWith("/")); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (chatInput.startsWith("/")) handleSlash(chatInput.split(" ")[0]);
                    else sendChat(chatInput);
                  }
                }}
                placeholder="Mensagem (Enter envia, / para comandos)..."
                rows={2}
                style={{ flex: 1, ...css(), background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: "6px", color: CLR.text, fontSize: "0.82rem", padding: "0.4rem 0.5rem", resize: "none", outline: "none" }}
              />
              <button onClick={() => { if (chatInput.startsWith("/")) handleSlash(chatInput.split(" ")[0]); else sendChat(chatInput); }}
                disabled={thinking} style={{ ...css(), background: CLR.green, color: "#000", border: "none", borderRadius: "6px", padding: "0.3rem 0.6rem", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem", alignSelf: "flex-end" }}>
                ▶
              </button>
            </div>
          </div>
        )}

        {/* CLI */}
        {aba === "cli" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflow: "auto", padding: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.8rem", color: CLR.green }}>
              {cliOut || "CodingPro CLI — digite um prompt e veja a resposta em tempo real."}
              {cliRunning && <span className="blink">▌</span>}
            </div>
            <div style={{ display: "flex", gap: "0.3rem", padding: "0.5rem", borderTop: `1px solid ${CLR.border}` }}>
              <input id="cli-in" onKeyDown={(e) => { if (e.key === "Enter") { runCli((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }}
                placeholder="codingpro -p seu prompt..." disabled={cliRunning}
                style={{ flex: 1, ...css(), background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: "6px", color: CLR.green, fontSize: "0.82rem", padding: "0.4rem", outline: "none" }} />
            </div>
          </div>
        )}

        {/* Files */}
        {aba === "files" && (
          <div style={{ padding: "0.5rem", overflow: "auto" }}>
            {files.length === 0 && <div style={{ color: CLR.muted }}>Carregando...</div>}
            {files.map((f) => (
              <div key={f} onClick={() => f.endsWith("/") ? null : openFile(f)}
                style={{ display: "flex", justifyContent: "space-between", cursor: f.endsWith("/") ? "default" : "pointer", padding: "0.25rem 0.4rem", borderBottom: `1px solid ${CLR.border}`, fontSize: "0.82rem" }}>
                <span><span style={{ color: f.endsWith("/") ? CLR.blue : CLR.muted }}>{f.endsWith("/") ? "📁" : "📄"}</span> {f}</span>
              </div>
            ))}
          </div>
        )}

        {/* Editor */}
        {aba === "editor" && (
          <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false}
            style={{ flex: 1, ...css(), border: "none", color: CLR.text, fontSize: "13px", lineHeight: "1.7", padding: "0.75rem", resize: "none", outline: "none" }} />
        )}

        {/* Terminal */}
        {aba === "terminal" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflow: "auto", padding: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.82rem", color: CLR.green }}>{output || "$ _"}</div>
            <div style={{ display: "flex", padding: "0.4rem", borderTop: `1px solid ${CLR.border}` }}>
              <span style={{ color: CLR.green, padding: "0.3rem" }}>$</span>
              <input value={cmdInput} onChange={(e) => setCmdInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runCmd(); }}
                placeholder="comando..." style={{ flex: 1, ...css(), border: "none", color: CLR.green, fontSize: "0.82rem", outline: "none" }} />
            </div>
          </div>
        )}

        {/* Git */}
        {aba === "git" && (
          <div style={{ padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem", overflow: "auto" }}>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/user/repo.git"
                style={{ flex: 1, ...css(), background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: "6px", color: CLR.text, fontSize: "0.82rem", padding: "0.35rem" }} />
              <button onClick={() => git("clone", gitUrl)} style={{ ...css(), background: CLR.green, color: "#000", border: "none", borderRadius: "6px", padding: "0.3rem 0.6rem", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}>Clone</button>
            </div>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <button onClick={() => git("status")} style={btn2(CLR.blue)}>Status</button>
              <button onClick={() => git("pull")} style={btn2(CLR.yellow)}>Pull</button>
              <button onClick={() => git("log")} style={btn2(CLR.muted)}>Log</button>
            </div>
            <pre style={{ color: CLR.muted, whiteSpace: "pre-wrap", fontSize: "0.8rem", background: CLR.bg2, padding: "0.5rem", borderRadius: "6px" }}>{gitOutput || "Output do git..."}</pre>
          </div>
        )}

        {/* Memory */}
        {aba === "memory" && (
          <div style={{ flex: 1, display: "flex", padding: "0.5rem", gap: "0.5rem", overflow: "auto" }}>
            <div style={{ width: "120px", borderRight: `1px solid ${CLR.border}`, paddingRight: "0.5rem" }}>
              <div style={{ color: CLR.yellow, fontSize: "0.75rem", marginBottom: "0.3rem" }}>.memory/</div>
              {memoryFiles.map((f) => (
                <div key={f} onClick={async () => { try { const d = await post<{ content: string }>("/api/vps/memory", { action: "load", name: f.replace(".md", "") }); setMemoryName(f.replace(".md", "")); setMemoryContent(d.content); setAba("memory"); } catch {} }}
                  style={{ cursor: "pointer", padding: "0.1rem 0", fontSize: "0.75rem", color: CLR.muted }}>📝 {f}</div>
              ))}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <input value={memoryName} onChange={(e) => setMemoryName(e.target.value)} placeholder="nome"
                  style={{ width: "100px", ...css(), background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: "4px", color: CLR.text, fontSize: "0.8rem", padding: "0.2rem" }} />
                <button onClick={saveMem} style={btn2(CLR.green)}>Salvar</button>
              </div>
              <textarea value={memoryContent} onChange={(e) => setMemoryContent(e.target.value)} placeholder="Anotações..."
                style={{ flex: 1, ...css(), background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: "6px", color: CLR.text, fontSize: "0.82rem", padding: "0.5rem", resize: "none" }} />
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: CLR.bg2, borderTop: `1px solid ${CLR.border}` }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setAba(t.id)} style={{
            flex: 1, padding: "0.45rem 0.2rem", background: aba === t.id ? CLR.bg : "transparent",
            border: "none", borderTop: aba === t.id ? `2px solid ${CLR.green}` : "2px solid transparent",
            color: aba === t.id ? CLR.green : CLR.muted, fontFamily: "inherit", fontSize: "0.65rem",
            fontWeight: aba === t.id ? 700 : 400, cursor: "pointer",
          }} type="button">
            <span style={{ fontSize: "0.8rem" }}>{t.icon}</span> <span style={{ display: "block", fontSize: "0.55rem" }}>{t.label}</span>
          </button>
        ))}
      </div>

      <style>{`.blink{animation:blink 1s infinite}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}

function btn2(color: string): React.CSSProperties {
  return { background: "transparent", border: `1px solid ${color}`, borderRadius: "6px", color, cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem", padding: "0.25rem 0.5rem" };
}
