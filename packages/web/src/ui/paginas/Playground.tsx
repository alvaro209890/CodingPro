import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";
import { Cartao } from "../componentes.js";

type Aba = "arquivos" | "editor" | "terminal" | "git" | "chat" | "memoria";

type AgenteEvento = {
  type: "thinking" | "text" | "reasoning" | "tool-start" | "tool-end" | "done" | "error" | "status";
  content?: string;
  name?: string;
  args?: string;
  result?: string;
  id?: string;
  timestamp?: number;
  message?: string;
};

type ToolLog = {
  id: string;
  nome: string;
  args: string;
  resultado: string;
  inicio: number;
  fim?: number;
  ativo: boolean;
};

type Subagente = {
  id: string;
  goal: string;
  status: "running" | "done";
  inicio: number;
};

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
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [reasoningContent, setReasoningContent] = useState("");
  const [tools, setTools] = useState<ToolLog[]>([]);
  const [subagentes, setSubagentes] = useState<Subagente[]>([]);
  const [agenteStatus, setAgenteStatus] = useState("");
  const [memoryFiles, setMemoryFiles] = useState<string[]>([]);
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryName, setMemoryName] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Files ──
  const carregarArquivos = useCallback(async () => {
    try { const d = await api.post<{ files: string[] }>("/api/vps/files", {}); setFiles(d.files); } catch { /* offline */ }
  }, []);
  const abrirArquivo = useCallback(async (path: string) => {
    setActiveFile(path); setAba("editor");
    try { const d = await api.post<{ content: string }>("/api/vps/read", { path }); setCode(d.content); } catch { setCode("// erro"); }
  }, []);
  useEffect(() => { carregarArquivos(); }, [carregarArquivos]);
  const salvar = useCallback(async () => {
    if (!activeFile) return;
    try { await api.post("/api/vps/write", { path: activeFile, content: code }); setOutput((p) => p + `✓ ${activeFile} salvo\n`); carregarArquivos(); } catch (e: any) { setErro(e.message); }
  }, [activeFile, code, carregarArquivos]);
  const deletarArquivo = useCallback(async (path: string) => {
    try { await api.post("/api/vps/delete", { path }); carregarArquivos(); if (activeFile === path) { setActiveFile(""); setCode(""); } } catch (e: any) { setErro(e.message); }
  }, [activeFile, carregarArquivos]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); salvar(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [salvar]);

  // ── Agente (SSE streaming) ──
  const enviarAgente = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt || loading) return;
    setChatInput("");
    setLoading(true);
    setStreamingContent("");
    setReasoningContent("");
    setTools([]);
    setSubagentes([]);
    setAgenteStatus("pensando...");
    setChatHistory((p) => [...p, { role: "user", content: prompt }]);
    setAba("chat");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("https://codingpro-api.cursar.space/api/vps/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
        credentials: "include",
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Erro no agente");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes("\n")) {
          const nl = buffer.indexOf("\n");
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);

          if (line.startsWith("event: ")) continue;
          if (!line.startsWith("data: ")) continue;
          try {
            const evt: AgenteEvento = JSON.parse(line.slice(6));

            if (evt.type === "text") {
              setStreamingContent((p) => p + (evt.content ?? ""));
            } else if (evt.type === "reasoning") {
              setReasoningContent((p) => p + (evt.content ?? ""));
            } else if (evt.type === "tool-start") {
              setTools((p) => [...p, {
                id: evt.id ?? crypto.randomUUID(),
                nome: evt.name ?? "?",
                args: "",
                resultado: "",
                inicio: Date.now(),
                ativo: true,
              }]);
              setAgenteStatus(`🔧 ${evt.name}...`);
            } else if (evt.type === "tool-end") {
              setTools((p) => p.map((t) =>
                t.nome === evt.name && t.ativo
                  ? { ...t, args: evt.args ?? "", resultado: evt.result ?? "", fim: Date.now(), ativo: false }
                  : t
              ));
              if (evt.name === "task") {
                setSubagentes((p) => [...p, {
                  id: crypto.randomUUID(),
                  goal: evt.args ?? "subagente",
                  status: "running",
                  inicio: Date.now(),
                }]);
                setTimeout(() => {
                  setSubagentes((prev) => prev.map((s, i) =>
                    i === prev.length - 1 ? { ...s, status: "done" as const } : s
                  ));
                }, 2000);
              }
              setAgenteStatus("");
            } else if (evt.type === "done") {
              const finalContent = streamingContent || evt.content || "(sem resposta)";
              setChatHistory((p) => [...p, { role: "assistant", content: finalContent }]);
              setStreamingContent("");
              setReasoningContent("");
              setAgenteStatus("");
            } else if (evt.type === "error") {
              setChatHistory((p) => [...p, { role: "assistant", content: "❌ " + (evt.message || "Erro") }]);
              setAgenteStatus("");
            } else if (evt.type === "status") {
              setAgenteStatus(evt.message ?? "");
            }
          } catch { /* chunk parcial */ }
        }
        chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setChatHistory((p) => [...p, { role: "assistant", content: "❌ " + (e.message || "Erro") }]);
      }
    } finally {
      setLoading(false);
      setStreamingContent("");
      setAgenteStatus("");
      abortRef.current = null;
    }
  }, [chatInput, loading, streamingContent]);

  // ── Terminal ──
  const executarComando = useCallback(async (cmd?: string) => {
    const comando = cmd ?? cmdInput;
    if (!comando.trim()) return;
    setAba("terminal"); setOutput((p) => p + `$ ${comando}\n`); setCmdInput(""); setLoading(true);
    try {
      const d = await api.post<{ stdout: string; stderr: string; code?: number; cwd: string }>("/api/vps/terminal", { command: comando, cwd });
      setOutput((p) => p + (d.stdout || "") + (d.stderr || ""));
      if (d.code !== undefined) setOutput((p) => p + `\n[exit ${d.code}]`);
      setCwd(d.cwd); carregarArquivos();
    } catch (e: any) { setOutput((p) => p + `Erro: ${e.message}\n`); }
    finally { setLoading(false); }
    setTimeout(() => termRef.current?.scrollTo(0, termRef.current.scrollHeight), 100);
  }, [cmdInput, cwd, carregarArquivos]);

  // ── Git ──
  const gitAction = useCallback(async (action: string, url?: string) => {
    setGitOutput("Executando...");
    try { const d = await api.post<{ ok: boolean; output: string }>("/api/vps/git", { action, cwd: "Projects", url }); setGitOutput(d.output); carregarArquivos(); } catch (e: any) { setGitOutput(e.message); }
  }, [carregarArquivos]);

  // ── Memória ──
  const carregarMemorias = useCallback(async () => { try { const d = await api.post<{ files: string[] }>("/api/vps/memory", { action: "list" }); setMemoryFiles(d.files); } catch { /* offline */ } }, []);
  const salvarMemoria = useCallback(async () => { if (!memoryName) return; try { await api.post("/api/vps/memory", { action: "save", name: memoryName, content: memoryContent }); carregarMemorias(); setOutput((p) => p + `✓ memória "${memoryName}" salva\n`); } catch (e: any) { setErro(e.message); } }, [memoryName, memoryContent, carregarMemorias]);
  const carregarMemoria = useCallback(async (nome: string) => { try { const d = await api.post<{ content: string }>("/api/vps/memory", { action: "load", name: nome.replace(".md", "") }); setMemoryName(nome.replace(".md", "")); setMemoryContent(d.content); setAba("memoria"); } catch { /* skip */ } }, []);
  useEffect(() => { carregarMemorias(); }, [carregarMemorias]);

  // ── Animações CSS ──
  const cs: React.CSSProperties = { background: "#0c0c0c", color: "#c0c0c0", fontFamily: '"Consolas", "Courier New", monospace' };
  const btn = (cor = "#aaa"): React.CSSProperties => ({ background: "transparent", border: "1px solid #333", borderRadius: "4px", color: cor, cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem", padding: "0.25rem 0.5rem" });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", ...cs }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", background: "#1a1a1a", borderBottom: "1px solid #333", fontSize: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ color: "#10b981", fontWeight: 700 }}>codingpro@vps</span>
        <span style={{ color: "#666" }}>:</span>
        <span style={{ color: "#06b6d4" }}>~/{activeFile || cwd}</span>
        <span style={{ flex: 1 }} />
        {agenteStatus && <span style={{ color: "#f5bf47", fontSize: "0.7rem", animation: "pulse 1s infinite" }}>{agenteStatus}</span>}
        {tools.filter(t => t.ativo).map(t => (
          <span key={t.id} style={{ color: "#10b981", fontSize: "0.65rem", display: "flex", alignItems: "center", gap: "0.2rem" }}>
            <span className="spinner" /> {t.nome}
          </span>
        ))}
        {subagentes.filter(s => s.status === "running").map(s => (
          <span key={s.id} style={{ color: "#06b6d4", fontSize: "0.65rem" }}>🤖 subagente</span>
        ))}
        <span style={{ color: "#666", fontSize: "0.65rem" }}>{usuario.email}</span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Files tab */}
        {aba === "arquivos" && (
          <div style={{ padding: "0.5rem" }}>
            <div style={{ color: "#f5bf47", marginBottom: "0.5rem", fontSize: "0.8rem" }}>$ ls -la</div>
            {["Documents/", "Downloads/", "Projects/", ".memory/", ...files.filter(f => !f.startsWith("Documents") && !f.startsWith("Downloads") && !f.startsWith("Projects") && !f.startsWith(".memory"))].map((f) => (
              <div key={f} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", padding: "0.15rem 0.3rem", borderBottom: "1px solid #1a1a1a", fontSize: "0.8rem" }}
                onClick={() => f.endsWith("/") ? setCwd(f) : abrirArquivo(f)}>
                <span><span style={{ color: f.endsWith("/") ? "#06b6d4" : "#888" }}>{f.endsWith("/") ? "📁" : "📄"}</span> {f}</span>
                {!f.endsWith("/") && <button onClick={(e) => { e.stopPropagation(); deletarArquivo(f); }} style={{ ...btn("#f55"), fontSize: "0.6rem", padding: "0 0.3rem" }}>✕</button>}
              </div>
            ))}
          </div>
        )}

        {/* Editor */}
        {aba === "editor" && (
          <textarea onChange={(e) => setCode(e.target.value)} spellCheck={false}
            style={{ flex: 1, background: "#0c0c0c", border: "none", color: "#e0e0e0", fontFamily: "inherit", fontSize: "13px", lineHeight: "1.7", outline: "none", padding: "0.75rem", resize: "none", width: "100%" }} value={code} />
        )}

        {/* Terminal */}
        {aba === "terminal" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div ref={termRef} style={{ flex: 1, overflow: "auto", padding: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.82rem", lineHeight: "1.6" }}>
              <span style={{ color: "#10b981" }}>{output}</span>
            </div>
            <div style={{ display: "flex", padding: "0.3rem", borderTop: "1px solid #333" }}>
              <span style={{ color: "#10b981", padding: "0.3rem" }}>$</span>
              <input value={cmdInput} onChange={(e) => setCmdInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") executarComando(); }}
                placeholder="comando..." autoFocus style={{ flex: 1, background: "transparent", border: "none", color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.82rem", outline: "none" }} />
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
            <pre style={{ flex: 1, overflow: "auto", whiteSpace: "pre-wrap", fontSize: "0.8rem", color: "#aaa", background: "#0f0f0f", padding: "0.5rem", borderRadius: "4px", margin: 0 }}>{gitOutput || "output do git..."}</pre>
          </div>
        )}

        {/* Chat com streaming + tools */}
        {aba === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div ref={chatRef} style={{ flex: 1, overflow: "auto", padding: "0.5rem" }}>
              {chatHistory.map((msg, i) => (
                <div key={i} style={{ marginBottom: "0.6rem", fontSize: "0.82rem" }}>
                  <div style={{ color: msg.role === "user" ? "#06b6d4" : "#10b981", fontWeight: 600 }}>
                    {msg.role === "user" ? "▸ você" : "◂ codingpro"}:
                  </div>
                  <div style={{ color: "#ddd", paddingLeft: "0.5rem", whiteSpace: "pre-wrap" }}>{msg.content}</div>
                </div>
              ))}

              {/* Tools log */}
              {tools.map((t) => (
                <div key={t.id} style={{
                  margin: "0.3rem 0", padding: "0.3rem 0.5rem", background: "#0f1a0f", border: "1px solid #1a3a1a",
                  borderRadius: "4px", fontSize: "0.75rem", opacity: t.ativo ? 1 : 0.7,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    {t.ativo ? <span className="spinner" /> : <span>✓</span>}
                    <span style={{ color: "#10b981", fontWeight: 600 }}>{t.nome}</span>
                    <span style={{ color: "#666", fontSize: "0.65rem" }}>{t.ativo ? "executando..." : `${((t.fim! - t.inicio) / 1000).toFixed(1)}s`}</span>
                  </div>
                  {t.args && <div style={{ color: "#888", fontSize: "0.7rem", marginTop: "0.15rem" }}>{t.args.slice(0, 200)}</div>}
                  {t.resultado && !t.ativo && <div style={{ color: "#aaa", fontSize: "0.7rem", marginTop: "0.15rem" }}>{t.resultado.slice(0, 300)}</div>}
                </div>
              ))}

              {/* Subagentes */}
              {subagentes.map((s) => (
                <div key={s.id} style={{
                  margin: "0.3rem 0", padding: "0.3rem 0.5rem", background: "#0f1a1a", border: "1px solid #1a3a3a",
                  borderRadius: "4px", fontSize: "0.75rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    {s.status === "running" ? <span className="spinner" /> : <span>✓</span>}
                    <span style={{ color: "#06b6d4", fontWeight: 600 }}>🤖 Subagente</span>
                    <span style={{ color: "#666", fontSize: "0.65rem" }}>{s.status === "running" ? "trabalhando..." : "concluído"}</span>
                  </div>
                  <div style={{ color: "#888", fontSize: "0.7rem", marginTop: "0.15rem" }}>{s.goal.slice(0, 200)}</div>
                </div>
              ))}

              {/* Streaming + reasoning */}
              {reasoningContent && (
                <div style={{ margin: "0.3rem 0", padding: "0.3rem 0.5rem", background: "#1a1a0f", border: "1px solid #3a3a1a", borderRadius: "4px", fontSize: "0.7rem" }}>
                  <div style={{ color: "#f5bf47", fontWeight: 600, marginBottom: "0.15rem" }}>🧠 Raciocínio:</div>
                  <div style={{ color: "#aaa", whiteSpace: "pre-wrap" }}>{reasoningContent.slice(-500)}</div>
                </div>
              )}
              {streamingContent && (
                <div style={{ margin: "0.3rem 0", fontSize: "0.82rem" }}>
                  <div style={{ color: "#10b981", fontWeight: 600 }}>◂ codingpro:</div>
                  <div style={{ color: "#ddd", paddingLeft: "0.5rem", whiteSpace: "pre-wrap" }}>
                    {streamingContent}
                    <span className="cursor-blink">▌</span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.25rem", padding: "0.4rem", borderTop: "1px solid #333" }}>
              <textarea onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarAgente(); } }}
                placeholder="Peça qualquer coisa... (ex: crie um app React)" rows={2}
                style={{ flex: 1, background: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.82rem", padding: "0.4rem", resize: "none" }}
                value={chatInput} />
              <button onClick={enviarAgente} disabled={loading} style={{ ...btn("#10b981"), alignSelf: "flex-end" }}>▶</button>
              {loading && <button onClick={() => abortRef.current?.abort()} style={{ ...btn("#f55"), alignSelf: "flex-end" }}>■</button>}
            </div>
          </div>
        )}

        {/* Memória */}
        {aba === "memoria" && (
          <div style={{ flex: 1, display: "flex", padding: "0.5rem", gap: "0.5rem" }}>
            <div style={{ width: "150px", borderRight: "1px solid #333", paddingRight: "0.5rem", overflow: "auto" }}>
              <div style={{ color: "#f5bf47", marginBottom: "0.3rem", fontSize: "0.75rem" }}>.memory/</div>
              {memoryFiles.map((f) => (
                <div key={f} onClick={() => carregarMemoria(f)} style={{ cursor: "pointer", padding: "0.15rem 0", fontSize: "0.75rem", color: "#888" }}>📝 {f}</div>
              ))}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <input value={memoryName} onChange={(e) => setMemoryName(e.target.value)} placeholder="nome" style={{ width: "120px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.8rem", padding: "0.2rem" }} />
                <button onClick={salvarMemoria} style={btn("#10b981")}>Salvar</button>
              </div>
              <textarea onChange={(e) => setMemoryContent(e.target.value)} placeholder="Anotações..." style={{ flex: 1, background: "#0f0f0f", border: "1px solid #333", borderRadius: "4px", color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.82rem", padding: "0.5rem", resize: "none" }} value={memoryContent} />
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: "#1a1a1a", borderTop: "1px solid #333" }}>
        {(["arquivos", "editor", "terminal", "git", "chat", "memoria"] as Aba[]).map((a) => {
          const labels: Record<Aba, string> = { arquivos: "📁 Files", editor: "✏️ Editor", terminal: ">_ Terminal", git: "🔀 Git", chat: "💬 AI", memoria: "🧠 Mem" };
          return (
            <button key={a} onClick={() => setAba(a)} style={{
              flex: 1, padding: "0.5rem 0.2rem", background: aba === a ? "#252525" : "transparent",
              border: "none", borderTop: aba === a ? "2px solid #10b981" : "2px solid transparent",
              color: aba === a ? "#10b981" : "#888", fontFamily: "inherit", fontSize: "0.65rem",
              fontWeight: aba === a ? 700 : 400, cursor: "pointer",
            }} type="button">{labels[a]}</button>
          );
        })}
      </div>

      {/* Animations injected via style tag */}
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .spinner {
          display: inline-block; width: 10px; height: 10px;
          border: 2px solid #10b981; border-top-color: transparent;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        .cursor-blink { animation: blink 1s step-end infinite; color: #10b981; }
      `}</style>

      {erro && <div style={{ padding: "0.3rem", background: "#300", color: "#f55", fontSize: "0.7rem" }}>{erro}</div>}
    </div>
  );
}
