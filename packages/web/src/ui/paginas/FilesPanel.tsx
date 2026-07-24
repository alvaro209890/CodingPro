import { useMemo, useRef, useState } from "react";

type Entrada = { nome: string; path: string; diretorio: boolean };

interface FilesPanelProps {
  files: string[];
  cwd: string;
  uploading: boolean;
  onNavigate: (path: string) => void;
  onOpenFile: (path: string) => void;
  onUpload: (files: FileList | File[]) => void;
  onRefresh: () => void;
  onDelete: (path: string) => void;
}

function entradasDaPasta(files: string[], cwd: string): Entrada[] {
  const prefixo = cwd ? `${cwd}/` : "";
  const unicas = new Map<string, Entrada>();
  for (const arquivo of files) {
    if (!arquivo.startsWith(prefixo)) continue;
    const restante = arquivo.slice(prefixo.length);
    if (!restante) continue;
    const [primeiro, ...outros] = restante.split("/");
    if (!primeiro) continue;
    const diretorio = arquivo.endsWith("/") || outros.length > 0;
    const path = `${prefixo}${primeiro}`;
    unicas.set(path, { nome: primeiro, path, diretorio });
  }
  return [...unicas.values()].sort(
    (a, b) => Number(b.diretorio) - Number(a.diretorio) || a.nome.localeCompare(b.nome),
  );
}

function getFileIcon(filename: string, isDir: boolean): string {
  if (isDir) return "📁";
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "🟦";
    case "js":
    case "jsx":
      return "🟨";
    case "json":
      return "⚙️";
    case "md":
      return "📝";
    case "css":
    case "html":
      return "🎨";
    case "py":
      return "🐍";
    case "sh":
      return "⚡";
    default:
      return "📄";
  }
}

export function FilesPanel({
  files,
  cwd,
  uploading,
  onNavigate,
  onOpenFile,
  onUpload,
  onRefresh,
  onDelete,
}: FilesPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const entries = useMemo(() => entradasDaPasta(files, cwd), [files, cwd]);
  const crumbs = cwd ? cwd.split("/") : [];

  const receber = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onUpload(e.target.files);
    e.target.value = "";
  };

  return (
    <section className="playground__files" aria-label="Arquivos do workspace">
      <header className="playground__filesHeader">
        <div className="playground__breadcrumbs">
          <button
            type="button"
            className="playground__breadcrumbBtn"
            onClick={() => onNavigate("")}
          >
            <span className="playground__breadcrumbIcon">🏠</span> workspace
          </button>
          {crumbs.map((crumb, index) => {
            const path = crumbs.slice(0, index + 1).join("/");
            return (
              <button
                key={path}
                type="button"
                className="playground__breadcrumbBtn"
                onClick={() => onNavigate(path)}
              >
                / {crumb}
              </button>
            );
          })}
        </div>
        <div className="playground__filesActions">
          <button
            type="button"
            onClick={onRefresh}
            title="Atualizar lista de arquivos"
            className="playground__filesActionBtn"
          >
            ↻ Atualizar
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="playground__filesActionBtn"
          >
            ⬆ Enviar arquivo
          </button>
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            className="playground__filesActionBtn playground__filesActionBtnPrimary"
          >
            📁 Enviar pasta
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={receber}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            hidden
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={receber}
          />
        </div>
      </header>

      <div
        className={`playground__dropzone ${dragging ? "playground__dropzone-active" : ""} playground__card-rotating-border`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onUpload(e.dataTransfer.files);
        }}
      >
        <div className="playground__dropzoneIcon">📥</div>
        <strong>
          {uploading ? "Enviando arquivos..." : "Arraste arquivos ou uma pasta inteira aqui"}
        </strong>
        <span>Upload instantâneo para o workspace. Limite: 512 MB por arquivo.</span>
      </div>

      <div className="playground__fileList">
        {cwd && (
          <button
            className="playground__fileRow playground__fileUp"
            type="button"
            onClick={() => onNavigate(crumbs.slice(0, -1).join("/"))}
          >
            <span className="playground__fileIcon">↩</span>
            <span>.. (Voltar para pasta anterior)</span>
          </button>
        )}
        {entries.map((entry) => (
          <div className="playground__fileRow" key={entry.path}>
            <button
              className="playground__fileOpen"
              type="button"
              onClick={() => (entry.diretorio ? onNavigate(entry.path) : onOpenFile(entry.path))}
            >
              <span className="playground__fileIcon">{getFileIcon(entry.nome, entry.diretorio)}</span>
              <span className="playground__fileName">{entry.nome}</span>
            </button>
            <button
              className="playground__fileDelete"
              type="button"
              title={`Excluir ${entry.nome}`}
              onClick={() => onDelete(entry.path)}
            >
              ✕
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="playground__filesEmpty">
            <span>📭</span>
            <p>Esta pasta está vazia.</p>
          </div>
        )}
      </div>
    </section>
  );
}
