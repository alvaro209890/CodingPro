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

const ATALHOS = ["pwd", "ls -la", "git status", "node -v", "npm status"];

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
  const [crtEnabled, setCrtEnabled] = useState(true);

  const executar = () => {
    const comando = cmd.trim();
    if (!comando) return;
    setHistory((prev) => [comando, ...prev.filter((item) => item !== comando)].slice(0, 30));
    setHistoryIndex(-1);
    onRun();
  };

  return (
    <section
      className={`playground__terminal ${crtEnabled ? "playground__terminal--crt" : ""}`}
      aria-label="Terminal do workspace"
    >
      {/* CRT Scanline Overlay Effect */}
      {crtEnabled && <div className="playground__terminalCrtOverlay" aria-hidden="true" />}

      <header className="playground__terminalHeader">
        <div className="playground__terminalTitleGroup">
          <span className="playground__terminalDot" />
          <span className="playground__terminalTitle">&gt;_ TERMINAL</span>
          <small className="playground__terminalBadge">sandbox isolado</small>
        </div>

        <div className="playground__terminalActions">
          {ATALHOS.map((atalho) => (
            <button
              type="button"
              key={atalho}
              onClick={() => onCmdChange(atalho)}
              className="playground__terminalQuickBtn"
            >
              {atalho}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCrtEnabled((prev) => !prev)}
            className="playground__terminalToggleCrt"
            title="Alternar efeito CRT retro"
          >
            {crtEnabled ? "📺 CRT: On" : "📺 CRT: Off"}
          </button>
          <button type="button" onClick={onClear} className="playground__terminalClearBtn">
            Limpar
          </button>
        </div>
      </header>

      <div className="playground__terminalOutput" aria-live="polite">
        {output ? (
          <pre className="playground__terminalPre">{output}</pre>
        ) : (
          <div className="playground__terminalWelcome">
            <span className="playground__terminalGlitchText">⚡ CodingPro Terminal v2.0</span>
            <p>Digite comandos Bash/Linux para interagir com o seu workspace isolado.</p>
            <p className="playground__terminalWelcomeHint">Exemplos: <code>ls -la</code>, <code>pwd</code>, <code>git status</code>, <code>cat package.json</code></p>
          </div>
        )}
      </div>

      <div className="playground__terminalInput">
        <span className="playground__terminalPrompt">▸_</span>
        <div className="playground__terminalInputWrapper">
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
            placeholder="Digite um comando e pressione Enter..."
            className="playground__terminalInputField"
            aria-label="Comando do terminal"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="playground__terminalCursor" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={executar}
          className="playground__terminalRunBtn"
          disabled={!cmd.trim()}
        >
          Executar
        </button>
      </div>
    </section>
  );
}
