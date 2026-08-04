import type React from "react";
import { useEffect, useState } from "react";

export interface SubagentView {
  id: string;
  type: string;
  objective: string;
  action: string;
  status: "running" | "done" | "failed" | "cancelled" | "timeout";
  startedAt: string;
  durationMs?: number;
  steps: number;
  tools: string[];
  report?: string;
  /** Relatório completo antes do resumo enviado ao contexto do agente principal (D3). */
  reportCompleto?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Modelo usado pelo subagente, quando conhecido (D2). */
  modelName?: string;
  /** Esforço/papel (fast/high/max), quando conhecido (D2). */
  effort?: string;
}

interface SubagentPanelProps {
  agents: SubagentView[];
}

function statusLabel(status: SubagentView["status"]): string {
  if (status === "running") return "Em andamento";
  if (status === "done") return "Concluído";
  if (status === "timeout") return "Tempo esgotado";
  if (status === "cancelled") return "Cancelado";
  return "Falhou";
}

function durationLabel(agent: SubagentView, now: number): string {
  const start = Date.parse(agent.startedAt);
  const duration = agent.durationMs ?? Math.max(0, now - start);
  if (duration < 60_000) return `${Math.max(1, Math.round(duration / 1_000))}s`;
  return `${Math.floor(duration / 60_000)}m ${Math.round((duration % 60_000) / 1_000)}s`;
}

function resumoCurto(texto: string, max = 280): string {
  const limpo = texto.trim();
  if (limpo.length <= max) return limpo;
  return `${limpo.slice(0, max).trimEnd()}…`;
}

export const SubagentPanel: React.FC<SubagentPanelProps> = ({ agents }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [relatorioAberto, setRelatorioAberto] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(Date.now());
  const running = agents.filter((agent) => agent.status === "running").length;

  useEffect(() => {
    if (running === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);

  if (agents.length === 0) return null;

  return (
    <aside className="subagent-panel" aria-label="Atividade dos subagentes">
      <button
        type="button"
        className="subagent-toggle"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className={`subagent-orbit ${running > 0 ? "running" : ""}`} aria-hidden="true" />
        <span>
          <strong>Subagentes</strong>
          <small>{running > 0 ? `${running} ativos` : `${agents.length} finalizados`}</small>
        </span>
        <span className="subagent-chevron">{collapsed ? "›" : "⌄"}</span>
      </button>

      {!collapsed && (
        <div className="subagent-list">
          {agents.map((agent) => {
            const open = expanded.has(agent.id);
            const relatorioExpandido = relatorioAberto.has(agent.id);
            const relatorio = agent.reportCompleto ?? agent.report;
            return (
              <article className={`subagent-card ${agent.status}`} key={agent.id}>
                <button
                  type="button"
                  className="subagent-card-summary"
                  aria-expanded={open}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(agent.id)) next.delete(agent.id);
                      else next.add(agent.id);
                      return next;
                    })
                  }
                >
                  <span className="subagent-card-state" aria-hidden="true" />
                  <span className="subagent-card-copy">
                    <span className="subagent-card-head">
                      <strong>{agent.type}</strong>
                      <span>{statusLabel(agent.status)}</span>
                    </span>
                    <span className="subagent-objective">{agent.objective}</span>
                    <span className="subagent-action">{agent.action}</span>
                  </span>
                  <span className="subagent-card-meta">
                    {durationLabel(agent, now)} · {agent.steps} passos · US${" "}
                    {agent.costUsd.toFixed(4)}
                  </span>
                </button>
                {open && (
                  <div className="subagent-card-detail">
                    <dl>
                      <div>
                        <dt>Modelo / esforço</dt>
                        <dd>
                          {agent.modelName ?? "DeepSeek V4 Flash"} · {agent.effort ?? "herdado"}
                        </dd>
                      </div>
                      <div>
                        <dt>Ferramentas</dt>
                        <dd>{agent.tools.length ? agent.tools.join(", ") : "Nenhuma"}</dd>
                      </div>
                      <div>
                        <dt>Tokens</dt>
                        <dd>
                          {agent.inputTokens.toLocaleString("pt-BR")} in ·{" "}
                          {agent.outputTokens.toLocaleString("pt-BR")} out
                        </dd>
                      </div>
                      <div>
                        <dt>Custo</dt>
                        <dd>US$ {agent.costUsd.toFixed(6)}</dd>
                      </div>
                    </dl>
                    {relatorio && (
                      <div className="subagent-report">
                        <strong>
                          {relatorioExpandido ? "Relatório completo" : "Resumo ao contexto"}
                        </strong>
                        <p>{relatorioExpandido ? relatorio : resumoCurto(relatorio)}</p>
                        {relatorio.length > 280 && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 12, marginTop: 6 }}
                            onClick={() =>
                              setRelatorioAberto((current) => {
                                const next = new Set(current);
                                if (next.has(agent.id)) next.delete(agent.id);
                                else next.add(agent.id);
                                return next;
                              })
                            }
                          >
                            {relatorioExpandido
                              ? "Mostrar só o resumo"
                              : "Expandir relatório completo"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
};
