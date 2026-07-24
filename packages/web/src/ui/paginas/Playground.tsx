import { useCallback, useEffect, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";

type Aba = "arquivos" | "editor" | "terminal" | "chat";

export function Playground({ usuario }: { usuario: Usuario }) {
  const [aba, setAba] = useState<Aba>("editor");
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState("index.js");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [erro, setErro] = useState("");

  const carregarArquivos = useCallback(async () => {
    try {
      const dados = await api.post<{ files: string[] }>("/api/playground/files", {});
      setFiles(dados.files);
    } catch { /* offline */ }
  }, []);

  const abrirArquivo = useCallback(async (path: string) => {
    setActiveFile(path);
    setAba("editor");
    try {
      const dados = await api.post<{ content: string }>("/api/playground/read", { path });
      setCode(dados.content);
    } catch { setCode("// erro ao carregar"); }
  }, []);

  useEffect(() => { carregarArquivos(); }, [carregarArquivos]);
  useEffect(() => {
    if (files.length > 0 && !code) abrirArquivo(activeFile);
  }, [files, activeFile, code, abrirArquivo]);

  const salvar = useCallback(async () => {
    try {
      await api.post("/api/playground/write", { path: activeFile, content: code });
      setOutput("✓ salvo");
      carregarArquivos();
    } catch (e) { setErro(e instanceof ErroApi ? e.message : "erro"); }
  }, [activeFile, code, carregarArquivos]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); salvar(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [salvar]);

  const executar = useCallback(async () => {
    setAba("terminal");
    setRunning(true);
    setOutput("$ node " + activeFile + "\n");
    try {
      const dados = await api.post<{ stdout: string; stderr: string; code: number }>(
        "/api/playground/run", { path: activeFile });
      setOutput((p) => p + dados.stdout + (dados.stderr ? "\n" + dados.stderr : "") + `\nProcesso finalizado [${dados.code}]`);
    } catch (e) {
      setOutput((p) => p + "Erro: " + (e instanceof ErroApi ? e.message : "falha"));
    } finally { setRunning(false); }
  }, [activeFile]);

  const enviarChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt || loading) return;
    setChatInput("");
    setLoading(true);
    setChatHistory((p) => [...p, { role: "user", content: prompt }]);
    try {
      const dados = await api.post<{ reply: string }>("/api/playground/chat", { prompt });
      setChatHistory((p) => [...p, { role: "assistant", content: dados.reply }]);
    } catch (e) {
      setChatHistory((p) => [...p, { role: "assistant", content: "Erro: " + (e instanceof ErroApi ? e.message : "") }]);
    } finally { setLoading(false); }
  }, [chatInput, loading]);

  const novoArquivo = useCallback(() => {
    const nome = prompt("Nome:", "novo.js");
    if (!nome) return;
    setActiveFile(nome);
    setCode("// " + nome);
    salvar();
  }, [salvar]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", background: "#0c0c0c", color: "#c0c0c0", fontFamily: '"Consolas", "Courier New", monospace' }}>
      {/* Barra superior estilo terminal */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", background: "#1a1a1a", borderBottom: "1px solid #333", fontSize: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ color: "#10b981", fontWeight: 700 }}>codingpro@playground</span>
        <span style={{ color: "#666" }}>:</span>
        <span style={{ color: "#06b6d4" }}>~/{activeFile}</span>
        <span style={{ flex: 1 }} />
        <button onClick={salvar} style={btnStyle}>💾</button>
        <button onClick={executar} disabled={running} style={{ ...btnStyle, color: running ? "#666" : "#10b981" }}>▶</button>
      </div>

      {/* Conteudo principal */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {aba === "arquivos" && (
          <div style={{ padding: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ color: "#f5bf47" }}>$ ls</span>
              <button onClick={novoArquivo} style={{ ...btnStyle, color: "#10b981" }}>+ novo</button>
            </div>
            {files.map((f) => (
              <div key={f} onClick={() => abrirArquivo(f)} style={{ cursor: "pointer", padding: "0.2rem 0.4rem", borderBottom: "1px solid #1a1a1a", fontSize: "0.85rem" }}>
                <span style={{ color: f.endsWith("/") ? "#06b6d4" : "#888" }}>{f.endsWith("/") ? "📁" : "📄"}</span> {f}
              </div>
            ))}
          </div>
        )}

        {aba === "editor" && (
          <textarea
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1, background: "#0c0c0c", border: "none", color: "#e0e0e0",
              fontFamily: '"Consolas", "Courier New", monospace', fontSize: "14px",
              lineHeight: "1.7", outline: "none", padding: "0.75rem", resize: "none",
              width: "100%", minHeight: "300px",
            }}
            value={code}
          />
        )}

        {aba === "terminal" && (
          <div style={{ flex: 1, padding: "0.5rem", overflow: "auto", whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: "1.6" }}>
            <span style={{ color: "#10b981" }}>{output || "$ _"}</span>
          </div>
        )}

        {aba === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0.5rem" }}>
            <div style={{ flex: 1, overflow: "auto", marginBottom: "0.5rem" }}>
              {chatHistory.map((msg, i) => (
                <div key={i} style={{ marginBottom: "0.6rem", fontSize: "0.85rem" }}>
                  <div style={{ color: msg.role === "user" ? "#06b6d4" : "#10b981", fontWeight: 600 }}>
                    {msg.role === "user" ? "> você" : "< codingpro"}:
                  </div>
                  <div style={{ color: msg.role === "user" ? "#ccc" : "#ddd", paddingLeft: "0.5rem" }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && <div style={{ color: "#666", fontSize: "0.8rem" }}>pensando...</div>}
            </div>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <textarea
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarChat(); } }}
                placeholder="$ pergunte algo..."
                rows={2}
                style={{
                  flex: 1, background: "#1a1a1a", border: "1px solid #333", borderRadius: "4px",
                  color: "#e0e0e0", fontFamily: "inherit", fontSize: "0.85rem", padding: "0.4rem", resize: "none",
                }}
                value={chatInput}
              />
              <button onClick={enviarChat} disabled={loading} style={{ ...btnStyle, color: "#10b981", alignSelf: "flex-end" }}>
                ▶
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Barra inferior de abas estilo mobile */}
      <div style={{ display: "flex", background: "#1a1a1a", borderTop: "1px solid #333" }}>
        {(["arquivos", "editor", "terminal", "chat"] as Aba[]).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            style={{
              flex: 1, padding: "0.6rem 0.3rem", background: aba === a ? "#252525" : "transparent",
              border: "none", borderTop: aba === a ? "2px solid #10b981" : "2px solid transparent",
              color: aba === a ? "#10b981" : "#888", fontFamily: "inherit", fontSize: "0.7rem",
              fontWeight: aba === a ? 700 : 400, cursor: "pointer",
            }}
            type="button"
          >
            {a === "arquivos" ? "📁 Files" : a === "editor" ? "✏️ Editor" : a === "terminal" ? "▶️ Run" : "💬 Chat"}
          </button>
        ))}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "transparent", border: "1px solid #333", borderRadius: "4px",
  color: "#aaa", cursor: "pointer", fontFamily: "inherit", fontSize: "0.8rem",
  padding: "0.2rem 0.5rem",
};
