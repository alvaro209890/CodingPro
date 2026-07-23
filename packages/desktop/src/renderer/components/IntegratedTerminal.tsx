import type React from "react";
import { useEffect, useRef, useState } from "react";

interface IntegratedTerminalProps {
  isOpen: boolean;
  onClose: () => void;
  cwd?: string;
}

export const IntegratedTerminal: React.FC<IntegratedTerminalProps> = ({ isOpen, onClose, cwd }) => {
  const [terminalInput, setTerminalInput] = useState("");
  const [logs, setLogs] = useState<string[]>(["CodingPro Terminal"]);
  const [isExecuting, setIsExecuting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (cwd) {
      setLogs((prev) => {
        const next = [...prev];
        // atualiza linha de diretório sem poluir
        if (next.length === 1 || next[1]?.startsWith("Diretório:")) {
          return [next[0] ?? "CodingPro Terminal", `Diretório: ${cwd}`];
        }
        return [...next, `Diretório: ${cwd}`];
      });
    }
  }, [cwd]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rolar ao mudar logs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, isExecuting]);

  if (!isOpen) return null;

  const handleRunCommand = async () => {
    if (!terminalInput.trim() || isExecuting) return;
    const cmd = terminalInput;
    setTerminalInput("");
    setIsExecuting(true);
    setLogs((prev) => [...prev, `$ ${cmd}`]);

    try {
      if (!window.codingproAPI) {
        setLogs((prev) => [...prev, "[erro] API desktop não conectada"]);
        return;
      }
      const res = await window.codingproAPI.runTerminalCommand(cmd);
      if (res.stdout) {
        setLogs((prev) => [...prev, res.stdout.trim()]);
      }
      if (res.stderr) {
        setLogs((prev) => [...prev, `[stderr]\n${res.stderr.trim()}`]);
      }
      setLogs((prev) => [...prev, `[código ${res.exitCode}]`]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [...prev, `[erro] ${msg}`]);
    } finally {
      setIsExecuting(false);
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
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

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
        {logs.map((log) => (
          <div
            key={`${log.slice(0, 24)}-${log.length}`}
            style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}
          >
            {log}
          </div>
        ))}
        {isExecuting && <div style={{ opacity: 0.6 }}>…</div>}
        <div ref={bottomRef} />
      </div>

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
          placeholder="Digite um comando (ex: pnpm test, git status)…"
          value={terminalInput}
          onChange={(e) => setTerminalInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRunCommand();
          }}
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
