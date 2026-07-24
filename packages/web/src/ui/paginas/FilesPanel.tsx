import { useMemo, useRef, useState } from "react";

type Entrada = { nome: string; path: string; diretorio: boolean; filhos?: number };

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

function contarFilhos(files: string[], pasta: string): number {
  const prefixo = pasta ? `${pasta}/` : "";
  const vistos = new Set<string>();
  for (const arquivo of files) {
    if (!arquivo.startsWith(prefixo)) continue;
    const restante = arquivo.slice(prefixo.length);
    if (!restante) continue;
    const [primeiro] = restante.split("/");
    if (primeiro) vistos.add(primeiro);
  }
  return vistos.size;
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
  const lista = [...unicas.values()].sort(
    (a, b) => Number(b.diretorio) - Number(a.diretorio) || a.nome.localeCompare(b.nome),
  );
  return lista.map((e) => (e.diretorio ? { ...e, filhos: contarFilhos(files, e.path) } : e));
}

function getFileIcon(filename: string, isDir: boolean): string {
  if (isDir) {
    if (filename === "repositorios") return "⑂";
    if (filename === "Projects") return "◆";
    if (filename === "Documents") return "▤";
    if (filename === "Downloads") return "↓";
    return "▸";
  }
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "TS";
    case "js":
    case "jsx":
      return "JS";
    case "json":
      return "{}";
    case "md":
      return "MD";
    case "css":
      return "CSS";
    case "html":
      return "<>";
    case "py":
      return "PY";
    case "sh":
      return "$";
    default:
      return "·";
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
  const [dropzoneAberta, setDropzoneAberta] = useState(false);
  const entries = useMemo(() => entradasDaPasta(files, cwd), [files, cwd]);
  const crumbs = cwd ? cwd.split("/") : [];
  const temRepositorios = files.some((f) => f.startsWith("repositorios/") || f === "repositorios/");

  const receber = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onUpload(e.target.files);
    e.target.value = "";
  };

  return (
    <section className="playground__files" aria-label="Arquivos do workspace">
      <header className="playground__filesHeader">
        <div className="playground__filesHeaderMain">
          <div className="playground__breadcrumbs">
            <button
              type="button"
              className="playground__breadcrumbBtn"
              onClick={() => onNavigate("")}
              title="Raiz do workspace"
            >
              workspace
            </button>
            {crumbs.map((crumb, index) => {
              const path = crumbs.slice(0, index + 1).join("/");
              return (
                <span key={path} className="playground__breadcrumbSep">
                  <span className="playground__breadcrumbSlash">/</span>
                  <button
                    type="button"
                    className="playground__breadcrumbBtn"
                    onClick={() => onNavigate(path)}
                  >
                    {crumb}
                  </button>
                </span>
              );
            })}
          </div>
          <span className="playground__filesMeta">
            {files.length} itens · {entries.length} nesta pasta
          </span>
        </div>
        <div className="playground__filesActions">
          {temRepositorios && cwd !== "repositorios" && !cwd.startsWith("repositorios/") && (
            <button
              type="button"
              className="playground__filesActionBtn playground__filesActionBtnGit"
              onClick={() => onNavigate("repositorios")}
              title="Abrir pasta de repositórios Git"
            >
              ⑂ Repos
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            title="Atualizar lista de arquivos"
            className="playground__filesActionBtn"
          >
            ↻
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="playground__filesActionBtn"
          >
            Enviar
          </button>
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            className="playground__filesActionBtn playground__filesActionBtnPrimary"
          >
            + Pasta
          </button>
          <input ref={fileInput} type="file" multiple hidden onChange={receber} />
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

      <button
        type="button"
        className="playground__dropzoneToggle"
        onClick={() => setDropzoneAberta((v) => !v)}
      >
        {dropzoneAberta ? "▾ Ocultar envio" : "▸ Enviar arquivos por arrastar"}
      </button>

      {dropzoneAberta && (
        // biome-ignore lint/a11y/noStaticElementInteractions: zona de drag-and-drop de arquivos
        <div
          className={`playground__dropzone ${dragging ? "playground__dropzone-active" : ""}`}
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
          <strong>{uploading ? "Enviando..." : "Arraste arquivos ou pastas aqui"}</strong>
          <span>
            Destino: <code>{cwd || "raiz"}</code> · até 512 MB por arquivo
          </span>
        </div>
      )}

      <div className="playground__fileList">
        {cwd && (
          <button
            className="playground__fileRow playground__fileUp"
            type="button"
            onClick={() => onNavigate(crumbs.slice(0, -1).join("/"))}
          >
            <span className="playground__fileIcon playground__fileIcon--muted">..</span>
            <span className="playground__fileName">Voltar</span>
          </button>
        )}
        {entries.map((entry) => (
          <div className="playground__fileRow" key={entry.path}>
            <button
              className="playground__fileOpen"
              type="button"
              onClick={() => (entry.diretorio ? onNavigate(entry.path) : onOpenFile(entry.path))}
            >
              <span
                className={`playground__fileIcon ${entry.diretorio ? "playground__fileIcon--dir" : ""}`}
              >
                {getFileIcon(entry.nome, entry.diretorio)}
              </span>
              <span className="playground__fileName">{entry.nome}</span>
              {entry.diretorio && entry.filhos !== undefined && (
                <span className="playground__fileBadge">{entry.filhos}</span>
              )}
              {entry.nome === "repositorios" && entry.diretorio && (
                <span className="playground__fileTag">git</span>
              )}
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
        {entries.length === 0 && (
          <div className="playground__filesEmpty">
            <p>Esta pasta está vazia.</p>
            <span>
              {cwd === "repositorios"
                ? "Clone um repositório na aba Git — ele aparecerá aqui."
                : "Envie arquivos ou use a IA para criar algo no workspace."}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
