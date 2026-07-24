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

  const receber = (lista: FileList | null) => {
    if (lista?.length) onUpload(lista);
  };

  return (
    <section className="playground__files" aria-label="Arquivos do workspace">
      <header className="playground__filesHeader">
        <div className="playground__breadcrumbs">
          <button type="button" onClick={() => onNavigate("")}>
            workspace
          </button>
          {crumbs.map((crumb, index) => {
            const path = crumbs.slice(0, index + 1).join("/");
            return (
              <button key={path} type="button" onClick={() => onNavigate(path)}>
                / {crumb}
              </button>
            );
          })}
        </div>
        <div className="playground__filesActions">
          <button type="button" onClick={onRefresh} title="Atualizar arquivos">
            ↻
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Enviar arquivos
          </button>
          <button type="button" onClick={() => folderInput.current?.click()}>
            Enviar pasta
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => receber(e.target.files)}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            hidden
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={(e) => receber(e.target.files)}
          />
        </div>
      </header>

      <div
        className={`playground__dropzone${dragging ? " playground__dropzone-active" : ""}`}
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
          receber(e.dataTransfer.files);
        }}
      >
        <strong>
          {uploading ? "Enviando para seu espaço..." : "Arraste arquivos, ZIPs ou uma pasta aqui"}
        </strong>
        <span>Os arquivos ficam no seu workspace isolado. Limite: 512 MB por arquivo.</span>
      </div>

      <div className="playground__fileList">
        {cwd && (
          <button
            className="playground__fileRow playground__fileUp"
            type="button"
            onClick={() => onNavigate(crumbs.slice(0, -1).join("/"))}
          >
            ↩ ..
          </button>
        )}
        {entries.map((entry) => (
          <div className="playground__fileRow" key={entry.path}>
            <button
              className="playground__fileOpen"
              type="button"
              onClick={() => (entry.diretorio ? onNavigate(entry.path) : onOpenFile(entry.path))}
            >
              <span>{entry.diretorio ? "📁" : "📄"}</span>
              <span>{entry.nome}</span>
            </button>
            <button
              className="playground__fileDelete"
              type="button"
              title={`Excluir ${entry.nome}`}
              onClick={() => onDelete(entry.path)}
            >
              ×
            </button>
          </div>
        ))}
        {entries.length === 0 && <p className="playground__filesEmpty">Esta pasta está vazia.</p>}
      </div>
    </section>
  );
}
