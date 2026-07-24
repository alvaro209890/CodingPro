import type { RefObject } from "react";
import { useState } from "react";

interface TerminalPanelProps {
  output: string;
  cmd: string;
  onCmdChange: (val: string) => void;
  onRun: () => void;
  onClear: () => void;
  cmdRef: RefObject<HTMLInputElement | null>;
}

const ATALHOS = ["pwd", "ls -la", "git status"];

export function TerminalPanel({
  output,
  cmd,
  onCmdChange,
  onRun,
  onClear,
  cmdRef,
}: TerminalPanelProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const executar = () => {
    const comando = cmd.trim();
    if (!comando) return;
    setHistory((prev) => [comando, ...prev.filter((item) => item !== comando)].slice(0, 30));
    setHistoryIndex(-1);
    onRun();
  };

  return (
    <section className="playground__terminal" aria-label="Terminal do workspace">
      <header className="playground__terminalHeader">
        <div>
          <span className="playground__terminalDot" /> terminal <small>workspace isolado</small>
        </div>
        <div className="playground__terminalActions">
          {ATALHOS.map((atalho) => (
            <button type="button" key={atalho} onClick={() => onCmdChange(atalho)}>
              {atalho}
            </button>
          ))}
          <button type="button" onClick={onClear}>
            Limpar
          </button>
        </div>
      </header>
      <div className="playground__terminalOutput" aria-live="polite">
        {output || "Pronto para comandos. Use ls -la para explorar seu workspace."}
      </div>
      <div className="playground__terminalInput">
        <span className="playground__terminalPrompt">›</span>
        <input
          ref={cmdRef}
          value={cmd}
          onChange={(e) => onCmdChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") executar();
            if (e.key === "ArrowUp") {
              e.preventDefault();
              const next = Math.min(historyIndex + 1, history.length - 1);
              if (next >= 0) {
                setHistoryIndex(next);
                onCmdChange(history[next] ?? "");
              }
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = historyIndex - 1;
              setHistoryIndex(next);
              onCmdChange(next >= 0 ? (history[next] ?? "") : "");
            }
          }}
          placeholder="Digite um comando e pressione Enter"
          className="playground__terminalInputField"
          aria-label="Comando do terminal"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </section>
  );
}
