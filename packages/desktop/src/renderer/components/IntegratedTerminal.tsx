import type React from "react";
import { useState } from "react";

interface IntegratedTerminalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntegratedTerminal: React.FC<IntegratedTerminalProps> = ({ isOpen, onClose }) => {
  const [terminalInput, setTerminalInput] = useState("");
  const [logs, setLogs] = useState<string[]>([
    "CodingPro Terminal",
    `Diretório: ${window.codingproAPI ? "(carregando...)" : "(API não conectada)"}`,
  ]);
  const [isExecuting, setIsExecuting] = useState(false);

  if (!isOpen) return null;

  const handleRunCommand = async () => {
    if (!terminalInput.trim() || isExecuting) return;
    const cmd = terminalInput;
    setTerminalInput("");
    setIsExecuting(true);
    setLogs((prev) => [...prev, `$ ${cmd}`]);

    if (window.codingproAPI) {
      const res = await window.codingproAPI.runTerminalCommand(cmd);
      setIsExecuting(false);
      if (res.stdout) {
        setLogs((prev) => [...prev, res.stdout.trim()]);
      }
      if (res.stderr) {
        setLogs((prev) => [...prev, `[stderr]\n${res.stderr.trim()}`]);
      }
      setLogs((prev) => [...prev, `[código ${res.exitCode}]`]);
    } else {
      setIsExecuting(false);
      setLogs((prev) => [...prev, "[erro] API desktop não conectada"]);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 300,
        background: "#090d16",
        borderTop: "1px solid var(--border-strong)",
        display: "flex",
        flexDirection: "column",
        zIndex: 90,
      }}
    >
      {/* Header do Terminal */}
      <div
        style={{
          height: 36,
          background: "var(--bg-header)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          fontSize: 12,
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--accent-blue)" }}>&gt;_ Terminal Integrado</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Logs do Terminal */}
      <div
        style={{
          flex: 1,
          padding: 12,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          overflowY: "auto",
          color: "var(--text-primary)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {logs.map((log, i) => (
          <div key={i} style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
            {log}
          </div>
        ))}
      </div>

      {/* Input de Comando */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border-subtle)",
          gap: 8,
        }}
      >
        <span style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>$</span>
        <input
          type="text"
          placeholder="Digite um comando (ex: pnpm test, git status)..."
          value={terminalInput}
          onChange={(e) => setTerminalInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRunCommand()}
          disabled={isExecuting}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        />
      </div>
    </div>
  );
};
