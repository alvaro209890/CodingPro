import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";

type Aba = "arquivos" | "editor" | "terminal" | "git" | "chat" | "memoria";

export function Playground({ usuario }: { usuario: Usuario }) {
  const [aba, setAba] = useState<Aba>("arquivos");
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("$ pronto\n");
  const [cwd, setCwd] = useState(".");
  const [cmdInput, setCmdInput] = useState("");
  const [gitOutput, setGitOutput] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [memoryFiles, setMemoryFiles] = useState<string[]>([]);
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryName, setMemoryName] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const termRef = useRef<HTMLDivElement>(null);

  // ── Files ──
  const carregarArquivos = useCallback(async () => {
    try {
      const d = await api.post<{ files: string[] }>("/api/vps/files", {});
      setFiles(d.files);
    } catch { /* offline */ }
  }, []);

  const abrirArquivo = useCallback(async (path: string) => {
    setActiveFile(path);
    setAba("editor");
    try {
      const d = await api.post<{ content: string }>("/api/vps/read", { path });
      setCode(d.content);
    } catch { setCode("// erro"); }
  }, []);

  useEffect(() => { carregarArquivos(); }, [carregarArquivos]);

  const salvar = useCallback(async () => {
    if (!activeFile) return;
    try {
      await api.post("/api/vps/write", { path: activeFile, content: code });
      setOutput((p) => p + `✓ ${activeFile} salvo\n`);
      carregarArquivos();
    } catch (e: any) { setErro(e.message); }
  }, [activeFile, code, carregarArquivos]);

  const deletarArquivo = useCallback(async (path: string) => {
    try {
      await api.post("/api/vps/delete", { path });
      carregarArquivos();
      if (activeFile === path) { setActiveFile(""); setCode(""); }
    } catch (e: any) { setErro(e.message); }
  }, [activeFile, carregarArquivos]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); salvar(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [salvar]);

  // ── Terminal ──
  const executarComando = useCallback(async (cmd?: string) => {
    const comando = cmd ?? cmdInput;
    if (!comando.trim()) return;
    setAba("terminal");
    setOutput((p) => p + `$ ${comando}\n`);
    setCmdInput("");
    setLoading(true);
    try {
      const d = await api.post<{ stdout: string; stderr: string; code?: number; cwd: string }>(
        "/api/vps/terminal", { command: comando, cwd });
      setOutput((p) => p + (d.stdout || "") + (d.stderr || ""));
      if (d.code !== undefined) setOutput((p) => p + `\n[exit ${d.code}]`);
      setCwd(d.cwd);
      carregarArquivos();
    } catch (e: any) { setOutput((p) => p + `Erro: ${e.message}\n`); }
    finally { setLoading(false); }
    setTimeout(() => termRef.current?.scrollTo(0, termRef.current.scrollHeight), 100);
  }, [cmdInput, cwd, carregarArquivos]);

  // ── Git ──
  const gitAction = useCallback(async (action: string, url?: string) => {
    setGitOutput("Executando...");
    try {
      const d = await api.post<{ ok: boolean; output: string }>("/api/vps/git", { action, cwd: "Projects", url });
      setGitOutput(d.output);
      carregarArquivos();
    } catch (e: any) { setGitOutput(e.message); }
  }, [cwd, carregarArquivos]);

  // ── Chat ──
  const enviarChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt || loading) return;
    setChatInput("");
    setLoading(true);
    setChatHistory((p) => [...p, { role: "user", content: prompt }]);
    try {
      const ctx = files.slice(0, 50).join("\n");
      const d = await api.post<{ reply: string }>("/api/vps/chat", { prompt, contexto: ctx });
      setChatHistory((p) => [...p, { role: "assistant", content: d.reply }]);
    } catch (e: any) {
      setChatHistory((p) => [...p, { role: "assistant", content: "Erro: " + (e instanceof ErroApi ? e.message : "") }]);
    } finally { setLoading(false); }
  }, [chatInput, loading, files]);

  // ── Memória ──
  const carregarMemorias = useCallback(async () => {
    try {
      const d = await api.post<{ files: string[] }>("/api/vps/memory", { action: "list" });
      setMemoryFiles(d.files);
    } catch { /* offline */ }
  }, []);

  const salvarMemoria = useCallback(async () => {
    if (!memoryName) return;
    try {
      await api.post("/api/vps/memory", { action: "save", name: memoryName, content: memoryContent });
      carregarMemorias();
      setOutput((p) => p + `✓ memória "${memoryName}" salva\n`);
    } catch (e: any) { setErro(e.message); }
  }, [memoryName, memoryContent, carregarMemorias]);

  const carregarMemoria = useCallback(async (nome: string) => {
    try {
      const d = await api.post<{ content: string }>("/api/vps/memory", { action: "load", name: nome.replace(".md", "") });
      setMemoryName(nome.replace(".md", ""));
      setMemoryContent(d.content);
      setAba("memoria");
    } catch { /* skip */ }
  }, []);

  useEffect(() => { carregarMemorias(); }, [carregarMemorias]);

  // ── UI ──
  const cs: React.CSSProperties = {
    background: "#0c0c0c", color: "#c0c0c0",
    fontFamily: '"Consolas", "Courier New", monospace',
  };

  const btn = (cor = "#aaa"): React.CSSProperties => ({
    background: "transparent", border: "1px solid #333", borderRadius: "4px",
    color: cor, cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem",
    padding: "0.25rem 0.5rem",
  });

  const TabBar = () => (
    <div style={{ display: "flex", background: "#1a1a1a", borderTop: "1px solid #333" }}>
      {([
        ["arquivos", "📁 Files"],
        ["editor", "✏️ Editor"],
        ["terminal", ">_ Terminal"],
        ["git", "🔀 Git"],
        ["chat", "💬 AI"],
        ["memoria", "🧠 Mem"],
      ] as [Aba, string][]).map(([a, label]) => (
        <button key={a} onClick={() => setAba(a)}
          style={{
            flex: 1, padding: "0.5rem 0.2rem", background: aba === a ? "#252525" : "transparent",
            border: "none", borderTop: aba === a ? "2px solid #10b981" : "2px solid transparent",
            color: aba === a ? "#10b981" : "#888", fontFamily: "inherit", fontSize: "0.65rem",
            fontWeight: aba === a ? 700 : 400, cursor: "pointer",
          }} type="button">{label}</button>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", ...cs }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", background: "#1a1a1a", borderBottom: "1px solid #333", fontSize: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ color: "#10b981", fontWeight: 700 }}>codingpro@vps</span>
        <span style={{ color: "#666" }}>:</span>
        <span style={{ color: "#06b6d4" }}>~/{activeFile || cwd}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: "#666", fontSize: "0.65rem" }}>{usuario.email}</span>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Files */}
        {aba === "arquivos" && (
          <div style={{ padding: "0.5rem" }}>
            <div style={{ color: "#f5bf47", marginBottom: "0.5rem", fontSize: "0.8rem" }}>$ ls -la</div>
            {["Documents/", "Downloads/", "Projects/", ".memory/", ...files.filter(f => !f.startsWith("Documents") && !f.startsWith("Downloads") && !f.startsWith("Projects") && !f.startsWith(".memory"))].map((f) => (
              <div key={f} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", padding: "0.15rem 0.3rem", borderBottom: "1px solid #1a1a1a", fontSize: "0.8rem" }}
                onClick={() => f.endsWith("/") ? setCwd(f) : abrirArquivo(f)}>
                <span>
                  <span style={{ color: f.endsWith("/") ? "#06b6d4" : "#888" }}>{f.endsWith("/") ? "📁" : "📄"}</span> {f}
                </span>
                {!f.endsWith("/") && (
                  <button onClick={(e) => { e.stopPropagation(); deletarArquivo(f); }} style={{ ...btn("#f55"), fontSize: "0.6rem", padding: "0 0.3rem" }}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Editor */}
        {aba === "editor" && (
          <textarea onChange={(e) => setCode(e.target.value)} spellCheck={false}
            style={{ flex: 1, background: "#0c0c0c", border: "none", color: "#e0e0e0", fontFamily: "inherit", fontSize: "13px", lineHeight: "1.7", outline: "none", padding: "0.75rem", resize: "none", width: "100%" }}
            value={code} />
        )}

        {/* Terminal */}
        {aba === "terminal" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div ref={termRef} style={{ flex: 1, overflow: "auto", padding: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.82rem", lineHeight: "1.6" }}>
              <span style={{ color: "#10b981" }}>{output}</span>
              {loading && <span style={{ color: "#666" }}>...</span>}
            </div>
            <div style={{ display: "flex", padding: "0.3rem", borderTop: "1px solid #333" }}>
              <span style={{ color: "#10b981", padding: "0.3rem" }}>$</span>
              <input value={cmdInput} onChange={(e) => setCmdInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") executarComando(); }}
                placeholder="comando..." autoFocus
                style={{ flex: 1, background: "transparent", border: "none", color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.82rem", outline: "none" }} />
            </div>
          </div>
        )}

        {/* Git */}
        {aba === "git" && (
          <div style={{ padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
              <input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/user/repo.git"
                style={{ flex: 1, background: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.8rem", padding: "0.3rem", minWidth: "150px" }} />
              <button onClick={() => gitAction("clone", gitUrl)} style={btn("#10b981")}>Clone</button>
            </div>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <button onClick={() => gitAction("status")} style={btn("#06b6d4")}>Status</button>
              <button onClick={() => gitAction("pull")} style={btn("#f5bf47")}>Pull</button>
              <button onClick={() => gitAction("log")} style={btn("#888")}>Log</button>
            </div>
            <pre style={{ flex: 1, overflow: "auto", whiteSpace: "pre-wrap", fontSize: "0.8rem", color: "#aaa", background: "#0f0f0f", padding: "0.5rem", borderRadius: "4px", margin: 0 }}>
              {gitOutput || "output do git..."}
            </pre>
          </div>
        )}

        {/* Chat */}
        {aba === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0.5rem" }}>
            <div style={{ flex: 1, overflow: "auto", marginBottom: "0.5rem" }}>
              {chatHistory.map((msg, i) => (
                <div key={i} style={{ marginBottom: "0.6rem", fontSize: "0.82rem" }}>
                  <div style={{ color: msg.role === "user" ? "#06b6d4" : "#10b981", fontWeight: 600 }}>
                    {msg.role === "user" ? "▸ você" : "◂ codingpro"}:
                  </div>
                  <div style={{ color: "#ddd", paddingLeft: "0.5rem", whiteSpace: "pre-wrap" }}>{msg.content}</div>
                </div>
              ))}
              {loading && <div style={{ color: "#666", fontSize: "0.75rem" }}>pensando...</div>}
            </div>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <textarea onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarChat(); } }}
                placeholder="Pergunte algo sobre seu código..." rows={2}
                style={{ flex: 1, background: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.82rem", padding: "0.4rem", resize: "none" }}
                value={chatInput} />
              <button onClick={enviarChat} disabled={loading} style={{ ...btn("#10b981"), alignSelf: "flex-end" }}>▶</button>
            </div>
          </div>
        )}

        {/* Memória */}
        {aba === "memoria" && (
          <div style={{ flex: 1, display: "flex", padding: "0.5rem", gap: "0.5rem" }}>
            <div style={{ width: "150px", borderRight: "1px solid #333", paddingRight: "0.5rem", overflow: "auto" }}>
              <div style={{ color: "#f5bf47", marginBottom: "0.3rem", fontSize: "0.75rem" }}>.memory/</div>
              {memoryFiles.map((f) => (
                <div key={f} onClick={() => carregarMemoria(f)}
                  style={{ cursor: "pointer", padding: "0.15rem 0", fontSize: "0.75rem", color: "#888" }}>
                  📝 {f}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <input value={memoryName} onChange={(e) => setMemoryName(e.target.value)} placeholder="nome"
                  style={{ width: "120px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.8rem", padding: "0.2rem" }} />
                <button onClick={salvarMemoria} style={btn("#10b981")}>Salvar</button>
              </div>
              <textarea onChange={(e) => setMemoryContent(e.target.value)} placeholder="Anotações persistentes..."
                style={{ flex: 1, background: "#0f0f0f", border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.82rem", padding: "0.5rem", resize: "none" }}
                value={memoryContent} />
            </div>
          </div>
        )}
      </div>

      <TabBar />
      {erro && <div style={{ padding: "0.3rem", background: "#300", color: "#f55", fontSize: "0.7rem" }}>{erro}</div>}
    </div>
  );
}
