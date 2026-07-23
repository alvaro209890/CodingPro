import React, { useState } from "react";

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

export const ToolSummaryBlock: React.FC<ToolSummaryBlockProps> = ({
  items,
  summaryText,
  totalAdd = 14,
  totalDel = 2,
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="tool-summary-card">
      <div className="tool-summary-header" onClick={() => setExpanded(!expanded)}>
        <div className="tool-summary-title">
          <span>{summaryText || "Execução de ferramentas"}</span>
          {totalAdd > 0 && <span className="diff-badge-add">+{totalAdd}</span>}
          {totalDel > 0 && <span className="diff-badge-del">-{totalDel}</span>}
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && (
        <div className="tool-action-list">
          {items.map((item) => (
            <div key={item.id} className={`tool-action-item ${item.status === "failed" ? "failed" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>
                  {item.name === "read_file" && `Ler ${item.target ?? "arquivo"}`}
                  {item.name === "edit_file" && `Editado ${item.target ?? "arquivo"}`}
                  {item.name === "write_file" && `Criado ${item.target ?? "arquivo"}`}
                  {item.name === "grep" && `Pesquisado ${item.target ?? "padrão"}`}
                  {item.name === "bash" && `Executado ${item.target ?? "comando"}`}
                  {!["read_file", "edit_file", "write_file", "grep", "bash"].includes(item.name) &&
                    `${item.name} (${item.target ?? ""})`}
                </span>
                {item.diffAdd !== undefined && <span className="diff-badge-add">+{item.diffAdd}</span>}
                {item.diffDel !== undefined && <span className="diff-badge-del">-{item.diffDel}</span>}
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
