import type React from "react";
import { useState } from "react";

export interface ToolItem {
  id: string;
  name: string;
  target?: string;
  status?: "success" | "failed" | "running";
  diffAdd?: number;
  diffDel?: number;
  output?: string;
}

interface ToolSummaryBlockProps {
  items: ToolItem[];
  summaryText: string;
  totalAdd?: number | undefined;
  totalDel?: number | undefined;
}

function labelFor(item: ToolItem): string {
  if (item.name === "read_file") return `Ler ${item.target ?? "arquivo"}`;
  if (item.name === "edit_file") return `Editado ${item.target ?? "arquivo"}`;
  if (item.name === "write_file") return `Criado ${item.target ?? "arquivo"}`;
  if (item.name === "grep") return `Pesquisado ${item.target ?? "padrão"}`;
  if (item.name === "bash") return `Executado ${item.target ?? "comando"}`;
  if (item.name === "list_dir") return `Listado ${item.target ?? "diretório"}`;
  if (item.name === "repo_map") return `Mapa do repositório`;
  if (item.name === "task") return `Subagentes em paralelo`;
  return `${item.name} (${item.target ?? ""})`;
}

export const ToolSummaryBlock: React.FC<ToolSummaryBlockProps> = ({
  items,
  summaryText,
  totalAdd,
  totalDel,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [selectedOutput, setSelectedOutput] = useState<{ label: string; output: string } | null>(null);

  return (
    <div className="tool-summary-card">
      <button type="button" className="tool-summary-header" onClick={() => setExpanded(!expanded)}>
        <div className="tool-summary-title">
          <span>{summaryText || "Execução de ferramentas"}</span>
          {totalAdd !== undefined && totalAdd > 0 && (
            <span className="diff-badge-add">+{totalAdd}</span>
          )}
          {totalDel !== undefined && totalDel > 0 && (
            <span className="diff-badge-del">-{totalDel}</span>
          )}
        </div>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="tool-action-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tool-action-item ${item.status === "failed" ? "failed" : ""} ${item.output ? "has-output" : ""}`}
              onClick={() => item.output ? setSelectedOutput({ label: labelFor(item), output: item.output! }) : undefined}
              title={item.output ? "Clique para ver a saída" : undefined}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                <span>
                  {item.status === "running" ? "… " : item.status === "failed" ? "✗ " : "✓ "}
                  {labelFor(item)}
                </span>
                {item.diffAdd !== undefined && (
                  <span className="diff-badge-add">+{item.diffAdd}</span>
                )}
                {item.diffDel !== undefined && (
                  <span className="diff-badge-del">-{item.diffDel}</span>
                )}
              </div>
              {item.output && <span className="tool-output-hint">▸</span>}
            </button>
          ))}
        </div>
      )}

      {/* Modal de saída de tool */}
      {selectedOutput && (
        <div className="tool-output-overlay" onClick={() => setSelectedOutput(null)}>
          <div className="tool-output-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tool-output-header">
              <span className="tool-output-title">{selectedOutput.label}</span>
              <button type="button" className="tool-output-close" onClick={() => setSelectedOutput(null)}>✕</button>
            </div>
            <pre className="tool-output-body">{selectedOutput.output}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
