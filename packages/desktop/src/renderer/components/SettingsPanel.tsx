import type React from "react";
import type { TemaNome } from "../../shared/temas-paleta.js";
import { TEMAS, DESCRICAO_TEMA } from "../../shared/temas-paleta.js";

interface SettingsPanelProps {
  autoApprove: boolean;
  onToggleAutoApprove: () => void;
  modelName: string;
  onModelChange?: (m: string) => void;
  effortLevel: string;
  onEffortChange?: (e: string) => void;
  tema: TemaNome;
  onTemaChange: (t: TemaNome) => void;
}

const ROTULOS_TEMA: Record<TemaNome, string> = {
  aurora: "Aurora",
  solar: "Solar",
  neon: "Neon",
  mono: "Mono",
};

const CORES_TEMA: Record<TemaNome, string> = {
  aurora: "var(--theme-primaria)",
  solar: "var(--theme-primaria)",
  neon: "var(--theme-primaria)",
  mono: "var(--theme-primaria)",
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  autoApprove,
  onToggleAutoApprove,
  modelName,
  effortLevel,
  tema,
  onTemaChange,
}) => (
  <div className="settings-panel">
    <div className="settings-section">
      <div className="settings-label">Tema</div>
      <div className="settings-theme-grid">
        {TEMAS.map((t) => (
          <button
            key={t}
            type="button"
            className={`settings-theme-chip${t === tema ? " active" : ""}`}
            onClick={() => onTemaChange(t)}
            title={DESCRICAO_TEMA[t]}
          >
            <span
              className="settings-theme-swatch"
              style={{
                background: `linear-gradient(135deg, var(--theme-primaria), var(--theme-acento))`,
              }}
              data-theme-preview={t}
            />
            <span className="settings-theme-name">{ROTULOS_TEMA[t]}</span>
          </button>
        ))}
      </div>
      <div className="settings-hint">{DESCRICAO_TEMA[tema]}</div>
    </div>

    <div className="settings-section">
      <div className="settings-label">Modelo</div>
      <div className="settings-value">{modelName}</div>
      <div className="settings-hint">DeepSeek V4 Pro (único disponível)</div>
    </div>

    <div className="settings-section">
      <div className="settings-label">Esforço de raciocínio</div>
      <div className="settings-value">{effortLevel}</div>
      <div className="settings-hint">Alto = mais tokens, respostas melhores</div>
    </div>

    <div className="settings-section">
      <div className="settings-label">Auto-aprovar ferramentas</div>
      <button
        type="button"
        className={`settings-toggle ${autoApprove ? "on" : "off"}`}
        onClick={onToggleAutoApprove}
      >
        <span className="settings-toggle-knob" />
        <span className="settings-toggle-label">{autoApprove ? "Ligado" : "Desligado"}</span>
      </button>
      <div className="settings-hint">Pula pedidos de permissão para write_file, bash, etc.</div>
    </div>

    <div className="settings-section">
      <div className="settings-label">Skills automáticas</div>
      <div className="settings-value">Ativo</div>
      <div className="settings-hint">Skills de .codingpro/skills/ carregadas automaticamente</div>
    </div>

    <div className="settings-section">
      <div className="settings-label">Atalhos</div>
      <div className="settings-shortcuts">
        <div><kbd>Ctrl+K</kbd> Paleta de comandos</div>
        <div><kbd>Ctrl+.</kbd> Cancelar execução</div>
        <div><kbd>Enter</kbd> Enviar mensagem</div>
        <div><kbd>Shift+Enter</kbd> Nova linha</div>
        <div><kbd>/</kbd> Sugestão de comandos</div>
      </div>
    </div>

    <div className="settings-section">
      <div className="settings-label">Versão</div>
      <div className="settings-value">v0.1.0 — Fase 2 (W3-dev)</div>
    </div>
  </div>
);
