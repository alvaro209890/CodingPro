interface GitPanelProps {
  gitUrl: string;
  gitOut: string;
  onUrlChange: (val: string) => void;
  onClone: () => void;
  onAction: (action: string) => void;
}

export function GitPanel({ gitUrl, gitOut, onUrlChange, onClone, onAction }: GitPanelProps) {
  return (
    <section className="playground__git" aria-label="Operações Git">
      <header className="playground__gitHeader">
        <div className="playground__gitTitle">
          <span>🔀</span>
          <strong>INTEGRAÇÃO GIT</strong>
        </div>
        <div className="playground__gitActions">
          {["status", "pull", "log", "diff"].map((action) => (
            <button
              key={action}
              onClick={() => onAction(action)}
              type="button"
              className="playground__gitActionBtn"
            >
              git {action}
            </button>
          ))}
        </div>
      </header>

      <div className="playground__gitInputCard">
        <label className="playground__gitLabel">Clonar Repositório Remoto:</label>
        <div className="playground__gitInputRow">
          <input
            value={gitUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://github.com/usuario/repositorio.git"
            aria-label="URL do repositório Git"
            className="playground__gitInputField"
          />
          <button onClick={onClone} type="button" className="playground__gitCloneBtn">
            Clonar Repositório
          </button>
        </div>
      </div>

      <div className="playground__gitOutputConsole">
        <div className="playground__gitConsoleHeader">Output do Git:</div>
        <pre className="playground__gitOutput">{gitOut || "Nenhuma operação executada ainda. Use os botões acima."}</pre>
      </div>
    </section>
  );
}