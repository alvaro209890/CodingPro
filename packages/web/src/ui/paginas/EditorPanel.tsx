interface EditorPanelProps {
  code: string;
  fileName: string;
  onChange: (val: string) => void;
  onSave: () => void;
}

export function EditorPanel({ code, fileName, onChange, onSave }: EditorPanelProps) {
  return (
    <section className="playground__editorShell">
      <header className="playground__editorHeader">
        <span>{fileName || "Selecione um arquivo na aba Files"}</span>
        <button type="button" onClick={onSave} disabled={!fileName}>
          Salvar <kbd>Ctrl S</kbd>
        </button>
      </header>
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
        placeholder="Abra um arquivo pelo explorador para editar."
      />
    </section>
  );
}
