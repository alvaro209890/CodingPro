interface EditorPanelProps {
  code: string;
  fileName: string;
  onChange: (val: string) => void;
  onSave: () => void;
}

export function EditorPanel({ code, fileName, onChange, onSave }: EditorPanelProps) {
  const lineCount = code ? code.split("\n").length : 1;

  return (
    <section className="playground__editorShell" aria-label="Editor de código">
      <header className="playground__editorHeader">
        <div className="playground__editorFileInfo">
          <span className="playground__editorDot" />
          <span className="playground__editorFileName">
            {fileName ? `✏️ ${fileName}` : "Nenhum arquivo selecionado"}
          </span>
          {fileName && <span className="playground__editorLineBadge">{lineCount} linhas</span>}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!fileName}
          className="playground__editorSaveBtn"
        >
          <span>Salvar</span> <kbd>Ctrl + S</kbd>
        </button>
      </header>

      <div className="playground__editorBody">
        {!fileName ? (
          <div className="playground__editorPlaceholder">
            <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>✏️</span>
            <p>Selecione um arquivo na aba <strong>Files</strong> para abrir e editar aqui.</p>
          </div>
        ) : (
          <textarea
            className="playground__editor"
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                onSave();
              }
            }}
            spellCheck={false}
            aria-label="Editor de código"
            placeholder="Digite o código aqui..."
          />
        )}
      </div>
    </section>
  );
}
