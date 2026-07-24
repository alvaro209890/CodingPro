import { useCallback, useEffect, useRef, useState } from "react";

type Tab = "cli" | "chat" | "files" | "editor" | "terminal" | "git" | "memory";

interface Mensagem { role: string; content: string; tools?: { nome: string; result: string }[] }

const CMD = [
  { cmd: "/clear", desc: "Limpar tela" },
  { cmd: "/files", desc: "Listar arquivos" },
  { cmd: "/memory", desc: "Salvar contexto" },
  { cmd: "/help", desc: "Ajuda" },
];

const C = {
  bg: "#0a0a0a", bg2: "#111", border: "#222",
  green: "#00ff41", blue: "#00d4ff", yellow: "#ffd700", red: "#ff4444",
  text: "#cccccc", muted: "#666666", white: "#ffffff",
};

const S = (x?: React.CSSProperties): React.CSSProperties => ({
  background: C.bg, color: C.text, fontFamily: '"JetBrains Mono","Fira Code","Consolas",monospace', ...x,
});

export function Playground({ usuario }: { usuario: Usuario }) {
  const [tab, setTab] = useState<Tab>("cli");
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [stream, setStream] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCmds, setShowCmds] = useState(false);
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
  const [status, setStatus] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inpRef = useRef<HTMLTextAreaElement>(null);

  const POST = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const r = await fetch(`https://codingpro-api.cursar.space${path}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : "{}", credentials: "include",
    });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as any).mensagem || "Erro");
    return r.json() as T;
  }, []);

  const scrollDown = () => setTimeout(() => ref.current?.scrollTo(0, ref.current.scrollHeight), 50);

  // ─── CLI / Chat Agent ───
  const enviar = useCallback(async (prompt?: string) => {
    const p = (prompt ?? input).trim();
    if (!p || loading) return;
    setInput(""); setLoading(true); setStream(""); setStatus("Pensando...");
    setMsgs((prev) => [...prev, { role: "user", content: p }]);
    scrollDown();
    try {
      const toolsLog: { nome: string; result: string }[] = [];
      let r: Response;
      try {
        r = await fetch("https://codingpro-api.cursar.space/api/vps/agent", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: p }), credentials: "include",
        });
      } catch (netErr: any) {
        throw new Error(`Rede: ${netErr.message || "sem conexão"}`);
      }
      if (!r.ok) {
        let msg = `Erro ${r.status}`;
        try { const e = await r.json(); msg = e.mensagem || e.erro || msg; } catch {}
        throw new Error(msg);
      }
      if (!r.body) throw new Error("Resposta vazia do servidor");
      const reader = r.body.getReader();
      const dec = new TextDecoder(); let buf = ""; let content = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const line of buf.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === "text") { content += d.content ?? ""; setStream(content); scrollDown(); }
            else if (d.type === "tool-start") setStatus(`🔧 ${d.name || ""}...`);
            else if (d.type === "tool-end") { toolsLog.push({ nome: d.name || "", result: d.result || "" }); setStatus(""); }
            else if (d.type === "done") {
              setMsgs((prev) => [...prev, { role: "assistant", content: content || d.content || "", tools: toolsLog }]);
              setStream(""); setStatus("");
            }
          } catch {}
        }
        buf = buf.includes("\n") ? buf.slice(buf.lastIndexOf("\n") + 1) : buf;
      }
    } catch (e: any) {
      setMsgs((prev) => [...prev, { role: "assistant", content: `❌ ${e.message}` }]);
    } finally { setLoading(false); setStream(""); setStatus(""); scrollDown(); }
  }, [input, loading]);

  const handleSlash = useCallback(async (cmd: string) => {
    setShowCmds(false);
    if (cmd === "/clear") { setMsgs([]); setStream(""); setStatus(""); }
    else if (cmd === "/files") { try { const d = await POST<{ files: string[] }>("/api/vps/files"); setFiles(d.files); setTab("files"); } catch {} }
    else if (cmd === "/memory") { try { const d = await POST<{ files: string[] }>("/api/vps/memory", { action: "list" }); setMemFiles(d.files); setTab("memory"); } catch {} }
    else if (cmd === "/help") { setMsgs((p) => [...p, { role: "system", content: CMD.map((c) => `${c.cmd} — ${c.desc}`).join("\n") }]); }
  }, [POST]);

  // ─── Files ───
  useEffect(() => { POST<{ files: string[] }>("/api/vps/files").then((d) => setFiles(d.files)).catch(() => {}); }, [POST]);
  const openFile = useCallback(async (path: string) => {
    setActiveFile(path); setTab("editor");
    try { const d = await POST<{ content: string }>("/api/vps/read", { path }); setCode(d.content); } catch {}
  }, [POST]);

  // ─── Terminal ───
  const runCmd = useCallback(async (c?: string) => {
    const cc = c ?? cmd; if (!cc.trim()) return;
    setCmd(""); setTab("terminal"); setOut((p) => p + `\n$ ${cc}\n`);
    try { const d = await POST<{ stdout: string; stderr: string }>("/api/vps/terminal", { command: cc, cwd: "." }); setOut((p) => p + (d.stdout || "") + (d.stderr || "")); } catch (e: any) { setOut((p) => p + `Erro: ${e.message}`); }
  }, [cmd, POST]);

  // ─── Git ───
  const git = useCallback(async (action: string, url?: string) => {
    setTab("git"); setGitOut("...");
    try { const d = await POST<{ output: string }>("/api/vps/git", { action, cwd: "Projects", url }); setGitOut(d.output); } catch (e: any) { setGitOut(e.message); }
  }, [POST]);

  // ─── Memory ───
  useEffect(() => { POST<{ files: string[] }>("/api/vps/memory", { action: "list" }).then((d) => setMemFiles(d.files)).catch(() => {}); }, [POST]);
  const saveMem = useCallback(async () => {
    if (!memName) return;
    try { await POST("/api/vps/memory", { action: "save", name: memName, content: memContent }); } catch {}
  }, [memName, memContent, POST]);

  // ─── Keyboard shortcut ───
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setShowCmds(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const tabs: { id: Tab; ico: string; lbl: string }[] = [
    { id: "cli", ico: "⚡", lbl: "CLI" },
    { id: "chat", ico: "💬", lbl: "Chat" },
    { id: "files", ico: "📁", lbl: "Files" },
    { id: "editor", ico: "✏️", lbl: "Editor" },
    { id: "terminal", ico: ">_", lbl: "Term" },
    { id: "git", ico: "🔀", lbl: "Git" },
    { id: "memory", ico: "🧠", lbl: "Mem" },
  ];

  const isCli = tab === "cli" || tab === "chat";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 52px)", ...S() }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0.6rem", background: C.bg2, borderBottom: `1px solid ${C.border}`, fontSize: "0.7rem", flexWrap: "wrap" }}>
        <span style={{ color: C.green, fontWeight: 700, fontSize: "0.85rem" }}>⚡ CodingPro</span>
        <span style={{ color: C.muted }}>vps</span>
        <span style={{ flex: 1 }} />
        {status && <span style={{ color: C.yellow, fontSize: "0.65rem" }}>{status}</span>}
        <span style={{ color: C.muted, fontSize: "0.6rem" }}>{usuario.email}</span>
        <button onClick={() => { setMsgs([]); setStream(""); setStatus(""); }} style={{ ...S(), border: `1px solid ${C.border}`, borderRadius: "4px", padding: "0.1rem 0.35rem", cursor: "pointer", fontSize: "0.65rem", color: C.muted }}>+</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* CLI + Chat */}
        {isCli && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div ref={ref} style={{ flex: 1, overflow: "auto", padding: "0.5rem 0.75rem" }}>
              {msgs.length === 0 && !stream && (
                <div style={{ padding: "1.5rem 0", textAlign: "center" }}>
                  <pre style={{ color: C.green, fontSize: "0.55rem", lineHeight: "1.3", margin: "0 0 0.75rem", whiteSpace: "pre" }}>{`
 ╔══════════════════════════════════════╗
 ║   ___      _ _    _   ___           ║
 ║  / __|___ |_| |__| |_| _ \\_ _ ___   ║
 ║ | (__/ _ \\| | / _\` | ||  _/ '_/ _ \\  ║
 ║  \\___\\___// |_\\__,_|\\__|_| |_| \\___/  ║
 ║          |__/                        ║
 ║  CLI local · DeepSeek V4 Pro/Flash   ║
 ╚══════════════════════════════════════╝`.slice(1)}</pre>
                  <div style={{ color: C.green, fontSize: "0.8rem", marginBottom: "0.3rem" }}>Bem-vindo ao CodingPro CLI</div>
                  <div style={{ color: C.muted, fontSize: "0.7rem" }}>Digite <span style={{ color: C.green }}>/</span> para comandos · Enter para enviar</div>
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i} style={{ marginBottom: "0.6rem" }}>
                  <div style={{
                    color: m.role === "user" ? C.blue : m.role === "system" ? C.yellow : C.green,
                    fontWeight: 600, fontSize: "0.72rem", marginBottom: "0.15rem",
                  }}>
                    {m.role === "user" ? "▸ você" : m.role === "system" ? "⚙ sistema" : "◂ codingpro"}
                  </div>
                  <div style={{ color: C.text, whiteSpace: "pre-wrap", fontSize: "0.78rem", lineHeight: "1.55", paddingLeft: "0.3rem" }}>
                    {m.content}
                  </div>
                  {m.tools?.map((t, j) => (
                    <div key={j} style={{ marginTop: "0.2rem", paddingLeft: "0.5rem", fontSize: "0.65rem", color: C.muted }}>
                      <span style={{ color: C.yellow }}>🔧 {t.nome}</span> — {t.result?.slice(0, 150)}
                    </div>
                  ))}
                </div>
              ))}

              {stream && (
                <div style={{ marginBottom: "0.6rem" }}>
                  <div style={{ color: C.green, fontWeight: 600, fontSize: "0.72rem", marginBottom: "0.15rem" }}>◂ codingpro</div>
                  <div style={{ color: C.text, whiteSpace: "pre-wrap", fontSize: "0.78rem", lineHeight: "1.55", paddingLeft: "0.3rem" }}>
                    {stream}<span className="blink" style={{ color: C.green }}>▌</span>
                  </div>
                </div>
              )}

              {loading && !stream && <div style={{ color: C.muted, fontSize: "0.7rem" }}>...</div>}
            </div>

            {/* Slash dropdown */}
            {showCmds && input.startsWith("/") && (
              <div style={{ margin: "0 0.75rem", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "0.3rem", position: "absolute", bottom: "100px", left: "10px", zIndex: 10, minWidth: "180px" }}>
                {CMD.filter((c) => c.cmd.startsWith(input)).map((c) => (
                  <div key={c.cmd} onClick={() => { handleSlash(c.cmd); setInput(""); }}
                    style={{ padding: "0.2rem 0.5rem", cursor: "pointer", fontSize: "0.75rem", borderRadius: "3px" }}>
                    <span style={{ color: C.green }}>{c.cmd}</span> <span style={{ color: C.muted }}>{c.desc}</span>
                  </div>
                ))}
              </div>
            )}

            {/* CLI Input */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "0.3rem", padding: "0.4rem 0.6rem", borderTop: `1px solid ${C.border}`, background: C.bg2 }}>
              <span style={{ color: C.green, fontWeight: 700, fontSize: "0.85rem", paddingBottom: "0.3rem" }}>▸</span>
              <textarea
                ref={inpRef as any}
                value={input}
                onChange={(e) => { setInput(e.target.value); setShowCmds(e.target.value.startsWith("/") && e.target.value.length <= 8); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.startsWith("/")) handleSlash(input.split(" ")[0] ?? "");
                    else enviar();
                  }
                }}
                placeholder="O que você quer criar, corrigir ou analisar?"
                rows={1}
                style={{
                  flex: 1, ...S({ background: C.bg2 }), border: `1px solid ${C.border}`, borderRadius: "6px",
                  color: C.text, fontSize: "0.82rem", padding: "0.4rem 0.5rem", resize: "none", outline: "none",
                  lineHeight: "1.4", maxHeight: "120px",
                }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 120) + "px";
                }}
              />
              <button onClick={() => enviar()} disabled={loading}
                style={{ ...S(), background: C.green, color: "#000", border: "none", borderRadius: "6px", padding: "0.4rem 0.7rem", cursor: loading ? "default" : "pointer", fontWeight: 700, fontSize: "0.8rem", opacity: loading ? 0.5 : 1 }}>
                ▶
              </button>
            </div>
          </div>
        )}

        {/* Files */}
        {tab === "files" && (
          <div style={{ padding: "0.5rem", overflow: "auto", flex: 1 }}>
            {files.map((f) => (
              <div key={f} onClick={() => f.endsWith("/") ? null : openFile(f)}
                style={{ display: "flex", padding: "0.2rem 0.3rem", cursor: f.endsWith("/") ? "default" : "pointer", borderBottom: `1px solid ${C.border}`, fontSize: "0.82rem" }}>
                <span style={{ color: f.endsWith("/") ? C.blue : C.muted }}>{f.endsWith("/") ? "📁" : "📄"}</span> <span style={{ marginLeft: "0.3rem" }}>{f}</span>
              </div>
            ))}
          </div>
        )}

        {/* Editor */}
        {tab === "editor" && (
          <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false}
            style={{ flex: 1, ...S(), border: "none", color: C.text, fontSize: "13px", lineHeight: "1.7", padding: "0.75rem", resize: "none", outline: "none" }} />
        )}

        {/* Terminal */}
        {tab === "terminal" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflow: "auto", padding: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.82rem", color: C.green }}>{out || "▸ _"}</div>
            <div style={{ display: "flex", padding: "0.3rem", borderTop: `1px solid ${C.border}` }}>
              <span style={{ color: C.green, padding: "0.3rem" }}>$</span>
              <input value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runCmd(); }}
                placeholder="comando..." autoFocus style={{ flex: 1, ...S(), border: "none", color: C.green, fontSize: "0.82rem", outline: "none" }} />
            </div>
          </div>
        )}

        {/* Git */}
        {tab === "git" && (
          <div style={{ padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem", overflow: "auto", flex: 1 }}>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/user/repo.git"
                style={{ flex: 1, ...S(), background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px", color: C.text, fontSize: "0.82rem", padding: "0.35rem" }} />
              <button onClick={() => git("clone", gitUrl)} style={{ ...S(), background: C.green, color: "#000", border: "none", borderRadius: "6px", padding: "0.3rem 0.6rem", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}>Clone</button>
            </div>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              {["status","pull","log"].map((a) => (
                <button key={a} onClick={() => git(a)} style={{ ...S(), border: `1px solid ${C.border}`, borderRadius: "6px", padding: "0.25rem 0.5rem", cursor: "pointer", color: C.muted, fontSize: "0.75rem" }}>{a}</button>
              ))}
            </div>
            <pre style={{ color: C.muted, whiteSpace: "pre-wrap", fontSize: "0.8rem", background: C.bg2, padding: "0.5rem", borderRadius: "6px", flex: 1 }}>{gitOut || "output do git..."}</pre>
          </div>
        )}

        {/* Memory */}
        {tab === "memory" && (
          <div style={{ flex: 1, display: "flex", padding: "0.5rem", gap: "0.5rem" }}>
            <div style={{ width: "120px", borderRight: `1px solid ${C.border}`, paddingRight: "0.5rem" }}>
              <div style={{ color: C.yellow, fontSize: "0.75rem", marginBottom: "0.3rem" }}>.memory/</div>
              {memFiles.map((f) => (
                <div key={f} onClick={async () => { try { const d = await POST<{ content: string }>("/api/vps/memory", { action: "load", name: f.replace(".md", "") }); setMemName(f.replace(".md", "")); setMemContent(d.content); setTab("memory"); } catch {} }}
                  style={{ cursor: "pointer", padding: "0.1rem 0", fontSize: "0.75rem", color: C.muted }}>📝 {f}</div>
              ))}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <input value={memName} onChange={(e) => setMemName(e.target.value)} placeholder="nome"
                  style={{ width: "100px", ...S(), background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "4px", color: C.text, fontSize: "0.8rem", padding: "0.2rem" }} />
                <button onClick={saveMem} style={{ ...S(), background: C.green, color: "#000", border: "none", borderRadius: "4px", padding: "0.2rem 0.5rem", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}>Salvar</button>
              </div>
              <textarea value={memContent} onChange={(e) => setMemContent(e.target.value)} placeholder="Anotações..."
                style={{ flex: 1, ...S(), background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "6px", color: C.text, fontSize: "0.82rem", padding: "0.5rem", resize: "none" }} />
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: C.bg2, borderTop: `1px solid ${C.border}` }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "0.4rem 0.2rem", background: tab === t.id ? C.bg : "transparent",
            border: "none", borderTop: tab === t.id ? `2px solid ${C.green}` : "2px solid transparent",
            color: tab === t.id ? C.green : C.muted, fontFamily: "inherit", fontSize: "0.6rem",
            fontWeight: tab === t.id ? 700 : 400, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.1rem",
          }} type="button">
            <span style={{ fontSize: "0.85rem" }}>{t.ico}</span> {t.lbl}
          </button>
        ))}
      </div>

      <style>{`.blink{animation:blink 1s infinite}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}
