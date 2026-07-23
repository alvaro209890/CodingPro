import type React from "react";

interface SettingsPanelProps {
  autoApprove: boolean;
  onToggleAutoApprove: () => void;
  modelName: string;
  onModelChange?: (m: string) => void;
  effortLevel: string;
  onEffortChange?: (e: string) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  autoApprove,
  onToggleAutoApprove,
  modelName,
  effortLevel,
}) => (
  <div className="settings-panel">
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
      <div className="settings-value">v0.1.0 — Fase 2 (W2.5)</div>
    </div>
  </div>
);
