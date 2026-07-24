import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";
import { Aviso, Cartao } from "../componentes.js";

type Arquivo = string;

export function Playground({ usuario }: { usuario: Usuario }) {
  const [files, setFiles] = useState<Arquivo[]>([]);
  const [activeFile, setActiveFile] = useState<string>("index.js");
  const [code, setCode] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [erro, setErro] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Carregar arquivos
  const carregarArquivos = useCallback(async () => {
    try {
      const dados = await api.post<{ files: string[] }>("/api/playground/files", {});
      setFiles(dados.files);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Erro ao carregar.");
    }
  }, []);

  // Abrir arquivo
  const abrirArquivo = useCallback(async (path: string) => {
    setActiveFile(path);
    try {
      const dados = await api.post<{ content: string }>("/api/playground/read", { path });
      setCode(dados.content);
    } catch {
      setCode("// Erro ao carregar arquivo");
    }
  }, []);

  useEffect(() => { carregarArquivos(); }, [carregarArquivos]);
  useEffect(() => {
    if (files.length > 0 && !code) abrirArquivo(activeFile);
  }, [files, activeFile, code, abrirArquivo]);

  // Salvar
  const salvar = useCallback(async () => {
    setErro("");
    try {
      await api.post("/api/playground/write", { path: activeFile, content: code });
      setOutput("Arquivo salvo ✓");
      carregarArquivos();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Erro ao salvar.");
    }
  }, [activeFile, code, carregarArquivos]);

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        salvar();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [salvar]);

  // Executar
  const executar = useCallback(async () => {
    setRunning(true);
    setOutput("Executando...");
    try {
      const dados = await api.post<{ stdout: string; stderr: string; code: number }>(
        "/api/playground/run",
        { path: activeFile },
      );
      setOutput(
        (dados.stdout ? dados.stdout + "\n" : "") +
        (dados.stderr ? "[stderr]\n" + dados.stderr + "\n" : "") +
        `Processo finalizado com código ${dados.code}`,
      );
    } catch (e) {
      setOutput("Erro: " + (e instanceof ErroApi ? e.message : "falha"));
    } finally {
      setRunning(false);
    }
  }, [activeFile]);

  // Chat IA
  const enviarChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt || loading) return;
    setChatInput("");
    setLoading(true);
    setChatHistory((prev) => [...prev, { role: "user", content: prompt }]);
    try {
      const dados = await api.post<{ reply: string }>("/api/playground/chat", { prompt });
      setChatHistory((prev) => [...prev, { role: "assistant", content: dados.reply }]);
    } catch (e) {
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: "Erro: " + (e instanceof ErroApi ? e.message : "falha") },
      ]);
    } finally {
      setLoading(false);
    }
  }, [chatInput, loading]);

  // Novo arquivo
  const novoArquivo = useCallback(() => {
    const nome = prompt("Nome do arquivo:", "novo.js");
    if (!nome) return;
    setActiveFile(nome);
    setCode("// " + nome);
    salvar();
  }, [salvar]);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 100px)", gap: "0.5rem" }}>
      {/* Sidebar: arquivos */}
      <div style={{ width: "200px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Cartao style={{ flex: 1, overflow: "auto", padding: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <strong>Arquivos</strong>
            <button className="pequeno" onClick={novoArquivo} type="button" title="Novo arquivo">+</button>
          </div>
          {files.map((f) => (
            <div
              key={f}
              onClick={() => abrirArquivo(f)}
              style={{
                cursor: "pointer",
                padding: "0.2rem 0.4rem",
                borderRadius: "4px",
                background: f === activeFile ? "var(--borda)" : "transparent",
                fontSize: "0.85rem",
                fontFamily: "monospace",
              }}
            >
              {f.endsWith("/") ? "📁 " : "📄 "}{f}
            </div>
          ))}
        </Cartao>
      </div>

      {/* Editor + Output */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Cartao style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0" }}>
          <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem", borderBottom: "1px solid var(--borda)" }}>
            <span className="mono" style={{ fontSize: "0.8rem" }}>{activeFile}</span>
            <span style={{ flex: 1 }} />
            <button className="pequeno" onClick={salvar} type="button">Salvar</button>
            <button className="pequeno primario" disabled={running} onClick={executar} type="button">
              {running ? "Rodando..." : "▶ Executar"}
            </button>
          </div>
          <textarea
            ref={editorRef}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              background: "var(--fundo)",
              border: "none",
              color: "var(--texto)",
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: "13px",
              lineHeight: "1.6",
              outline: "none",
              padding: "0.75rem",
              resize: "none",
              tabSize: 2,
            }}
            value={code}
          />
        </Cartao>
        <Cartao style={{ maxHeight: "180px", overflow: "auto", padding: "0.5rem" }}>
          <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
            {output || "Saída do terminal aparecerá aqui..."}
          </pre>
        </Cartao>
      </div>

      {/* Chat IA */}
      <div style={{ width: "320px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Cartao style={{ flex: 1, overflow: "auto", padding: "0.5rem" }}>
          <strong style={{ marginBottom: "0.5rem", display: "block" }}>💬 Chat IA</strong>
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: "0.5rem",
                padding: "0.4rem 0.5rem",
                borderRadius: "8px",
                background: msg.role === "user" ? "var(--borda)" : "var(--fundo-cartao)",
                fontSize: "0.82rem",
              }}
            >
              <strong style={{ color: msg.role === "user" ? "var(--secundario, #06b6d4)" : "var(--esmeralda)" }}>
                {msg.role === "user" ? "Você" : "IA"}:{" "}
              </strong>
              {msg.content}
            </div>
          ))}
          {loading && <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>Pensando...</div>}
        </Cartao>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <textarea
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviarChat();
              }
            }}
            placeholder="Pergunte sobre o código..."
            rows={2}
            style={{
              flex: 1,
              background: "var(--fundo)",
              border: "1px solid var(--borda)",
              borderRadius: "8px",
              color: "var(--texto)",
              fontFamily: "inherit",
              fontSize: "0.82rem",
              padding: "0.4rem",
              resize: "none",
            }}
            value={chatInput}
          />
          <button className="primario pequeno" disabled={loading} onClick={enviarChat} type="button" style={{ alignSelf: "flex-end" }}>
            ▶
          </button>
        </div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </div>
  );
}
