interface GitPanelProps {
  gitUrl: string;
  gitOut: string;
  cloning: boolean;
  onUrlChange: (val: string) => void;
  onClone: () => void;
  onAction: (action: string) => void;
}

export function GitPanel({
  gitUrl,
  gitOut,
  cloning,
  onUrlChange,
  onClone,
  onAction,
}: GitPanelProps) {
  return (
    <section className="playground__git" aria-label="Operações Git">
      <header className="playground__gitHeader">
        <div className="playground__gitTitle">
          <span>⑂</span>
          <strong>Git</strong>
        </div>
        <div className="playground__gitActions">
          {["status", "pull", "log"].map((action) => (
            <button
              key={action}
              onClick={() => onAction(action)}
              type="button"
              className="playground__gitActionBtn"
              disabled={cloning}
            >
              git {action}
            </button>
          ))}
        </div>
      </header>

      <div className="playground__gitInputCard">
        <label className="playground__gitLabel" htmlFor="git-clone-url">
          Clonar repositório → pasta <code>repositorios/</code> do workspace
        </label>
        <div className="playground__gitInputRow">
          <input
            id="git-clone-url"
            value={gitUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://github.com/usuario/repo.git"
            aria-label="URL do repositório Git"
            className="playground__gitInputField"
            disabled={cloning}
            onKeyDown={(e) => {
              if (e.key === "Enter" && gitUrl.trim() && !cloning) onClone();
            }}
          />
          <button
            onClick={onClone}
            type="button"
            className="playground__gitCloneBtn"
            disabled={cloning || !gitUrl.trim()}
          >
            {cloning ? "Clonando..." : "Clonar"}
          </button>
        </div>
        {cloning && (
          <div className="playground__gitProgress">
            <div className="playground__gitProgressBar" />
            <span>Clonando repositório...</span>
          </div>
        )}
      </div>

      <div className="playground__gitOutputConsole">
        <div className="playground__gitConsoleHeader">Output:</div>
        <pre className="playground__gitOutput">{gitOut || "Nenhuma operação ainda."}</pre>
      </div>
    </section>
  );
}
