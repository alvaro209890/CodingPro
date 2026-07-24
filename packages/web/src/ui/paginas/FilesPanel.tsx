interface FilesPanelProps {
  files: string[];
  onOpenFile: (path: string) => void;
}

export function FilesPanel({ files, onOpenFile }: FilesPanelProps) {
  return (
    <div style={{ padding: "0.5rem", overflow: "auto", flex: 1 }}>
      {files.map((f) => (
        <button
          key={f}
          className={`playground__fileItem${f.endsWith("/") ? " playground__fileItemDiretorio" : ""}`}
          onClick={() => { if (!f.endsWith("/")) onOpenFile(f); }}
          type="button"
        >
          <span className="playground__fileIcon">{f.endsWith("/") ? "📁" : "📄"}</span>
          <span>{f}</span>
        </button>
      ))}
      {files.length === 0 && (
        <div style={{ color: "var(--texto-fraco)", fontSize: "0.82rem", padding: "0.5rem" }}>
          Nenhum arquivo encontrado.
        </div>
      )}
    </div>
  );
}