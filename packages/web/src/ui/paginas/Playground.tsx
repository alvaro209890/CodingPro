import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";

type Aba = "arquivos" | "editor" | "terminal" | "git" | "chat" | "memoria";

type ToolLog = { id: string; nome: string; args: string; resultado: string; inicio: number; fim?: number; ativo: boolean };
type Subagente = { id: string; goal: string; status: "running" | "done"; inicio: number };
type ChatMsg = { role: string; content: string };

const COMANDOS = [
  { cmd: "/clear", desc: "Limpar conversa" },
  { cmd: "/files", desc: "Listar arquivos do workspace" },
  { cmd: "/memory", desc: "Salvar conversa na memória" },
  { cmd: "/load", desc: "Carregar memória salva" },
  { cmd: "/help", desc: "Mostrar comandos" },
];

export function Playground({ usuario }: { usuario: Usuario }) {
  const [aba, setAba] = useState<Aba>("chat");
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("$ pronto\n");
  const [cwd, setCwd] = useState(".");
  const [cmdInput, setCmdInput] = useState("");
  const [gitOutput, setGitOutput] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [tools, setTools] = useState<ToolLog[]>([]);
  const [subagentes, setSubagentes] = useState<Subagente[]>([]);
  const [status, setStatus] = useState("");
  const [memoryFiles, setMemoryFiles] = useState<string[]>([]);
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryName, setMemoryName] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [showCmds, setShowCmds] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── API helpers ───
  const call = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`https://codingpro-api.cursar.space${path}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : "{}", credentials: "include",
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})) as any; throw new Error(e.mensagem || "Erro"); }
    return res.json() as T;
  }, []);

  // ─── Files ───
  const loadFiles = useCallback(async () => {
    try { const d = await call<{ files: string[] }>("/api/vps/files"); setFiles(d.files); } catch { /* offline */ }
  }, [call]);
  const openFile = useCallback(async (path: string) => {
    setActiveFile(path); setAba("editor");
    try { const d = await call<{ content: string }>("/api/vps/read", { path }); setCode(d.content); } catch { setCode("// erro"); }
  }, [call]);
  useEffect(() => { loadFiles(); }, [loadFiles]);
  const saveFile = useCallback(async () => {
    if (!activeFile) return;
    try { await call("/api/vps/write", { path: activeFile, content: code }); setOutput((p) => p + `✓ salvo\n`); loadFiles(); } catch (e: any) { setErro(e.message); }
  }, [activeFile, code, call, loadFiles]);
  const deleteFile = useCallback(async (path: string) => {
    try { await call("/api/vps/delete", { path }); loadFiles(); if (activeFile === path) { setActiveFile(""); setCode(""); } } catch (e: any) { setErro(e.message); }
  }, [activeFile, call, loadFiles]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveFile(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [saveFile]);

  // ─── Agent SSE ───
  const sendAgent = useCallback(async (prompt: string) => {
    setLoading(true); setStreamingContent(""); setTools([]); setSubagentes([]); setStatus("pensando...");
    setChatHistory((p) => [...p, { role: "user", content: prompt }]);
    const ctrl = new AbortController(); abortRef.current = ctrl;
    try {
      const res = await fetch("https://codingpro-api.cursar.space/api/vps/agent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }), credentials: "include", signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("Erro no agente");
      const reader = res.body!.getReader();
      const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const line of buf.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "text") setStreamingContent((p) => p + (evt.content ?? ""));
            else if (evt.type === "tool-start") setTools((p) => [...p, { id: evt.id ?? "", nome: evt.name ?? "", args: "", resultado: "", inicio: Date.now(), ativo: true }]);
            else if (evt.type === "tool-end") setTools((p) => p.map((t) => t.id === evt.id ? { ...t, args: evt.args ?? "", resultado: evt.result ?? "", fim: Date.now(), ativo: false } : t));
            else if (evt.type === "done") {
              const final = streamingContent || evt.content || "";
              setChatHistory((p) => [...p, { role: "assistant", content: final }]);
              setStreamingContent(""); setStatus("");
            } else if (evt.type === "status") setStatus(evt.message ?? "");
          } catch { /* partial */ }
        }
        buf = buf.includes("\n") ? buf.slice(buf.lastIndexOf("\n") + 1) : buf;
      }
    } catch (e: any) { if (e.name !== "AbortError") setChatHistory((p) => [...p, { role: "assistant", content: "❌ " + e.message }]); }
    finally { setLoading(false); setStreamingContent(""); setStatus(""); abortRef.current = null; }
  }, [loading, streamingContent]);

  // ─── Slash commands ───
  const handleSlash = useCallback(async (cmd: string) => {
    setShowCmds(false);
    if (cmd === "/clear") { setChatHistory([]); setTools([]); setSubagentes([]); setOutput("$ chat limpo\n"); }
    else if (cmd === "/files") { setAba("arquivos"); loadFiles(); setOutput("$ arquivos carregados\n"); }
    else if (cmd === "/memory") { saveMemory("chat-" + Date.now(), JSON.stringify(chatHistory.slice(-20))); setOutput("$ memória salva\n"); }
    else if (cmd === "/load") { setAba("memoria"); }
    else if (cmd === "/help") {
      setChatHistory((p) => [...p, { role: "system", content: COMANDOS.map((c) => `${c.cmd} — ${c.desc}`).join("\n") }]);
    }
  }, [chatHistory, loadFiles]);

  const handleInput = useCallback((val: string) => {
    setChatInput(val);
    setShowCmds(val.startsWith("/") && val.length <= 8);
  }, []);

  const handleSubmit = useCallback(() => {
    const val = chatInput.trim();
    if (!val || loading) return;
    if (val.startsWith("/")) { handleSlash(val.split(" ")[0] ?? ""); setChatInput(""); return; }
    setChatInput("");
    sendAgent(val);
  }, [chatInput, loading, handleSlash, sendAgent]);

  // ─── Terminal ───
  const runCmd = useCallback(async (cmd?: string) => {
    const c = cmd ?? cmdInput; if (!c.trim()) return;
    setAba("terminal"); setOutput((p) => p + `$ ${c}\n`); setCmdInput(""); setLoading(true);
    try {
      const d = await call<{ stdout: string; stderr: string; code?: number }>("/api/vps/terminal", { command: c, cwd });
      setOutput((p) => p + (d.stdout || "") + (d.stderr || "") + (d.code !== undefined ? `\n[exit ${d.code}]` : ""));
    } catch (e: any) { setOutput((p) => p + `Erro: ${e.message}\n`); }
    finally { setLoading(false); }
  }, [cmdInput, cwd, call]);

  // ─── Git ───
  const gitAction = useCallback(async (action: string, url?: string) => {
    setGitOutput("...");
    try { const d = await call<{ ok: boolean; output: string }>("/api/vps/git", { action, cwd: "Projects", url }); setGitOutput(d.output); loadFiles(); } catch (e: any) { setGitOutput(e.message); }
  }, [call, loadFiles]);

  // ─── Memory ───
  const loadMemories = useCallback(async () => {
    try { const d = await call<{ files: string[] }>("/api/vps/memory", { action: "list" }); setMemoryFiles(d.files); } catch { /* */ }
  }, [call]);
  const saveMemory = useCallback(async (name: string, content: string) => {
    try { await call("/api/vps/memory", { action: "save", name, content }); loadMemories(); } catch { /* */ }
  }, [call, loadMemories]);
  const loadMemory = useCallback(async (name: string) => {
    try { const d = await call<{ content: string }>("/api/vps/memory", { action: "load", name: name.replace(".md", "") }); setMemoryName(name.replace(".md", "")); setMemoryContent(d.content); setAba("memoria"); } catch { /* */ }
  }, [call]);
  useEffect(() => { loadMemories(); }, [loadMemories]);

  // ─── Auto memory consolidation ───
  useEffect(() => {
    if (chatHistory.length > 10) {
      const interval = setInterval(() => {
        saveMemory("auto-" + new Date().toISOString().slice(0, 10), JSON.stringify(chatHistory.slice(-30)));
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [chatHistory.length, saveMemory]);

  // ─── Styles ───
  const cs = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "#0c0c0c", color: "#c0c0c0", fontFamily: '"Consolas","Courier New",monospace', ...extra,
  });
  const btn = (cor = "#aaa"): React.CSSProperties => ({
    background: "transparent", border: "1px solid #333", borderRadius: "4px", color: cor,
    cursor: "pointer", fontFamily: "inherit", fontSize: "0.7rem", padding: "0.2rem 0.5rem",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", ...cs() }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.35rem 0.5rem", background: "#1a1a1a", borderBottom: "1px solid #333", fontSize: "0.7rem", flexWrap: "wrap" }}>
        <span style={{ color: "#10b981", fontWeight: 700 }}>codingpro@vps</span>
        <span style={{ color: "#666" }}>:</span>
        <span style={{ color: "#06b6d4" }}>~/{activeFile || cwd}</span>
        <span style={{ flex: 1 }} />
        {status && <span style={{ color: "#f5bf47", fontSize: "0.65rem" }}>{status}</span>}
        {tools.filter((t) => t.ativo).map((t) => (
          <span key={t.id} style={{ color: "#10b981", fontSize: "0.6rem" }}>⏳ {t.nome}</span>
        ))}
        <span style={{ color: "#555", fontSize: "0.6rem" }}>{usuario.email}</span>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Files */}
        {aba === "arquivos" && (
          <div style={{ padding: "0.5rem" }}>
            <div style={{ color: "#f5bf47", marginBottom: "0.3rem", fontSize: "0.75rem" }}>$ ls</div>
            {files.length === 0 && <div style={{ color: "#666", fontSize: "0.8rem" }}>Carregando...</div>}
            {files.map((f) => (
              <div key={f} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", padding: "0.12rem 0.3rem", borderBottom: "1px solid #1a1a1a", fontSize: "0.78rem" }}
                onClick={() => f.endsWith("/") ? setCwd(f) : openFile(f)}>
                <span><span style={{ color: f.endsWith("/") ? "#06b6d4" : "#888" }}>{f.endsWith("/") ? "📁" : "📄"}</span> {f}</span>
                {!f.endsWith("/") && <button onClick={(e) => { e.stopPropagation(); deleteFile(f); }} style={{ ...btn("#f55"), fontSize: "0.55rem", padding: "0 0.25rem" }}>✕</button>}
              </div>
            ))}
          </div>
        )}

        {/* Editor */}
        {aba === "editor" && (
          <textarea onChange={(e) => setCode(e.target.value)} spellCheck={false}
            style={{ flex: 1, ...cs(), border: "none", color: "#e0e0e0", fontSize: "13px", lineHeight: "1.7", outline: "none", padding: "0.75rem", resize: "none", width: "100%" }} value={code} />
        )}

        {/* Terminal */}
        {aba === "terminal" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflow: "auto", padding: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.8rem", lineHeight: "1.6" }}>
              <span style={{ color: "#10b981" }}>{output}</span>
            </div>
            <div style={{ display: "flex", padding: "0.3rem", borderTop: "1px solid #333" }}>
              <span style={{ color: "#10b981", padding: "0.3rem" }}>$</span>
              <input value={cmdInput} onChange={(e) => setCmdInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runCmd(); }}
                placeholder="comando..." style={{ flex: 1, ...cs(), border: "none", color: "#e0e0e0", fontSize: "0.8rem", outline: "none" }} />
            </div>
          </div>
        )}

        {/* Git */}
        {aba === "git" && (
          <div style={{ padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
              <input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/user/repo.git"
                style={{ flex: 1, ...cs(), border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontSize: "0.8rem", padding: "0.3rem", minWidth: "150px" }} />
              <button onClick={() => gitAction("clone", gitUrl)} style={btn("#10b981")}>Clone</button>
            </div>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <button onClick={() => gitAction("status")} style={btn("#06b6d4")}>Status</button>
              <button onClick={() => gitAction("pull")} style={btn("#f5bf47")}>Pull</button>
              <button onClick={() => gitAction("log")} style={btn("#888")}>Log</button>
            </div>
            <pre style={{ flex: 1, overflow: "auto", whiteSpace: "pre-wrap", fontSize: "0.8rem", color: "#aaa", background: "#0f0f0f", padding: "0.5rem", borderRadius: "4px", margin: 0 }}>{gitOutput || "output do git..."}</pre>
          </div>
        )}

        {/* Chat with slash commands */}
        {aba === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div ref={chatRef} style={{ flex: 1, overflow: "auto", padding: "0.5rem" }}>
              {chatHistory.length === 0 && !streamingContent && (
                <div style={{ color: "#555", fontSize: "0.8rem", textAlign: "center", padding: "2rem" }}>
                  💬 Digite / para ver comandos<br />
                  <span style={{ fontSize: "0.65rem" }}>/clear /files /memory /load /help</span>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>
                  <div style={{ color: msg.role === "user" ? "#06b6d4" : "#10b981", fontWeight: 600 }}>
                    {msg.role === "user" ? "▸ você" : "◂ codingpro"}:
                  </div>
                  <div style={{ color: "#ddd", paddingLeft: "0.5rem", whiteSpace: "pre-wrap" }}>{msg.content}</div>
                </div>
              ))}
              {/* Tools */}
              {tools.map((t) => (
                <div key={t.id} style={{ margin: "0.2rem 0", padding: "0.25rem 0.4rem", background: "#0f1a0f", border: "1px solid #1a3a1a", borderRadius: "4px", fontSize: "0.7rem", opacity: t.ativo ? 1 : 0.6 }}>
                  <span style={{ color: t.ativo ? "#10b981" : "#666" }}>{t.ativo ? "⏳" : "✓"}</span> <span style={{ color: "#10b981", fontWeight: 600 }}>{t.nome}</span>
                  {t.resultado && !t.ativo && <div style={{ color: "#888", fontSize: "0.65rem", marginTop: "0.1rem" }}>{t.resultado.slice(0, 200)}</div>}
                </div>
              ))}
              {/* Streaming */}
              {streamingContent && (
                <div style={{ margin: "0.2rem 0", fontSize: "0.8rem" }}>
                  <div style={{ color: "#10b981", fontWeight: 600 }}>◂ codingpro:</div>
                  <div style={{ color: "#ddd", paddingLeft: "0.5rem", whiteSpace: "pre-wrap" }}>{streamingContent}<span className="blink">▌</span></div>
                </div>
              )}
            </div>

            {/* Slash command dropdown */}
            {showCmds && (
              <div style={{ position: "absolute", bottom: "120px", left: "10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "6px", padding: "0.3rem", zIndex: 10, minWidth: "200px" }}>
                {COMANDOS.filter((c) => c.cmd.startsWith(chatInput)).map((c) => (
                  <div key={c.cmd} onClick={() => { setChatInput(c.cmd + " "); setShowCmds(false); }}
                    style={{ padding: "0.2rem 0.4rem", cursor: "pointer", fontSize: "0.75rem", borderRadius: "3px" }}>
                    <span style={{ color: "#10b981" }}>{c.cmd}</span> <span style={{ color: "#888" }}>{c.desc}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input + buttons */}
            <div style={{ display: "flex", gap: "0.2rem", padding: "0.3rem", borderTop: "1px solid #333" }}>
              <button onClick={() => { setChatHistory([]); setTools([]); setOutput("$ novo chat\n"); }} title="Novo chat" style={btn("#888")}>+</button>
              <textarea onChange={(e) => handleInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder="Digite / para comandos..." rows={2}
                style={{ flex: 1, ...cs(), border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontSize: "0.8rem", padding: "0.3rem", resize: "none" }}
                value={chatInput} />
              <button onClick={handleSubmit} disabled={loading} style={{ ...btn("#10b981"), alignSelf: "flex-end" }}>▶</button>
              {loading && <button onClick={() => abortRef.current?.abort()} style={{ ...btn("#f55"), alignSelf: "flex-end" }}>■</button>}
            </div>
          </div>
        )}

        {/* Memory */}
        {aba === "memoria" && (
          <div style={{ flex: 1, display: "flex", padding: "0.5rem", gap: "0.5rem" }}>
            <div style={{ width: "140px", borderRight: "1px solid #333", paddingRight: "0.5rem", overflow: "auto" }}>
              <div style={{ color: "#f5bf47", fontSize: "0.7rem", marginBottom: "0.3rem" }}>.memory/</div>
              {memoryFiles.map((f) => (
                <div key={f} onClick={() => loadMemory(f)} style={{ cursor: "pointer", padding: "0.1rem 0", fontSize: "0.7rem", color: "#888" }}>📝 {f}</div>
              ))}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <input value={memoryName} onChange={(e) => setMemoryName(e.target.value)} placeholder="nome" style={{ width: "100px", ...cs(), border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontSize: "0.75rem", padding: "0.2rem" }} />
                <button onClick={() => saveMemory(memoryName, memoryContent)} style={btn("#10b981")}>Salvar</button>
              </div>
              <textarea onChange={(e) => setMemoryContent(e.target.value)} placeholder="Anotações..."
                style={{ flex: 1, ...cs(), border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontSize: "0.8rem", padding: "0.5rem", resize: "none" }} value={memoryContent} />
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: "#1a1a1a", borderTop: "1px solid #333" }}>
        {(["arquivos", "editor", "terminal", "git", "chat", "memoria"] as Aba[]).map((a) => {
          const labels: Record<Aba, string> = { arquivos: "📁", editor: "✏️", terminal: ">_", git: "🔀", chat: "💬", memoria: "🧠" };
          return <button key={a} onClick={() => setAba(a)} style={{
            flex: 1, padding: "0.4rem 0", background: aba === a ? "#252525" : "transparent",
            border: "none", borderTop: aba === a ? "2px solid #10b981" : "2px solid transparent",
            color: aba === a ? "#10b981" : "#666", fontFamily: "inherit", fontSize: "0.7rem", cursor: "pointer",
          }} type="button">{labels[a]}</button>;
        })}
      </div>

      <style>{`.blink{animation:blink 1s infinite}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
      {erro && <div style={{ padding: "0.2rem 0.4rem", background: "#300", color: "#f55", fontSize: "0.65rem" }}>{erro}</div>}
    </div>
  );
}
