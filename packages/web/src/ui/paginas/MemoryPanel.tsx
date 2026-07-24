interface MemoryPanelProps {
  memFiles: string[];
  memName: string;
  memContent: string;
  onNameChange: (val: string) => void;
  onContentChange: (val: string) => void;
  onSave: () => void;
  onFileClick: (f: string) => void;
}

export function MemoryPanel({
  memFiles,
  memName,
  memContent,
  onNameChange,
  onContentChange,
  onSave,
  onFileClick,
}: MemoryPanelProps) {
  return (
    <div className="playground__memory">
      <div className="playground__memorySidebar">
        <div className="playground__memorySidebarTitle">.memory/</div>
        {memFiles.map((f) => (
          <button
            key={f}
            className="playground__memoryFile"
            onClick={() => onFileClick(f)}
            type="button"
          >
            📝 {f}
          </button>
        ))}
      </div>
      <div className="playground__memoryMain">
        <div className="playground__memoryForm">
          <input
            value={memName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="nome"
            aria-label="Memory name"
          />
          <button onClick={onSave} type="button">Salvar</button>
        </div>
        <textarea
          className="playground__memoryTextarea"
          value={memContent}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="Anotações..."
          aria-label="Memory content"
        />
      </div>
    </div>
  );
}