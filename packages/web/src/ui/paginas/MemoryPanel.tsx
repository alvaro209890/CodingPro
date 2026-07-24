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
    <section className="playground__memory" aria-label="Memória do Workspace">
      <div className="playground__memorySidebar">
        <div className="playground__memorySidebarHeader">
          <span>🧠</span>
          <span className="playground__memorySidebarTitle">.memory/</span>
        </div>
        <div className="playground__memoryFileList">
          {memFiles.length === 0 ? (
            <div className="playground__memoryEmpty">Nenhum arquivo de memória salvo.</div>
          ) : (
            memFiles.map((f) => (
              <button
                key={f}
                className={`playground__memoryFile ${memName === f.replace(".md", "") ? "playground__memoryFile-active" : ""}`}
                onClick={() => onFileClick(f)}
                type="button"
              >
                📝 {f}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="playground__memoryMain">
        <div className="playground__memoryForm">
          <input
            value={memName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Nome do arquivo (ex: notas_projeto)"
            aria-label="Nome da memória"
            className="playground__memoryNameInput"
          />
          <button onClick={onSave} type="button" className="playground__memorySaveBtn">
            💾 Salvar Memória
          </button>
        </div>
        <textarea
          className="playground__memoryTextarea"
          value={memContent}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="Escreva anotações de contexto, regras de negócio ou instruções persistentes para a IA..."
          aria-label="Conteúdo da memória"
        />
      </div>
    </section>
  );
}