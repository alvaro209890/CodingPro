import type React from "react";
import type { TemaNome } from "../../shared/temas-paleta.js";
import { DESCRICAO_TEMA, gradienteCSS, PALETAS, TEMAS } from "../../shared/temas-paleta.js";

interface SettingsPanelProps {
  autoApprove: boolean;
  onToggleAutoApprove: () => void;
  tema: TemaNome;
  onTemaChange: (t: TemaNome) => void;
  /** Versão real do app (main → package.json); a UI nunca inventa este número. */
  appVersion?: string | undefined;
  /** Skills carregadas de `.codingpro/skills` na sessão atual. */
  skills?: number | undefined;
  reducaoMovimento: boolean;
  onToggleReducaoMovimento: () => void;
}

const ROTULOS_TEMA: Record<TemaNome, string> = {
  aurora: "Aurora",
  mono: "Mono",
  neon: "Neon",
  solar: "Solar",
};

const ATALHOS: ReadonlyArray<readonly [string, string]> = [
  ["Ctrl K", "Paleta de comandos"],
  ["Ctrl .", "Cancelar execução"],
  ["Enter", "Enviar mensagem"],
  ["Shift Enter", "Quebrar linha"],
  ["/", "Sugerir comandos"],
  ["Esc", "Fechar diálogo · negar permissão"],
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  autoApprove,
  onToggleAutoApprove,
  tema,
  onTemaChange,
  appVersion,
  skills,
  reducaoMovimento,
  onToggleReducaoMovimento,
}) => (
  <div className="settings-panel">
    <section className="settings-section">
      <fieldset className="settings-fieldset">
        <legend className="settings-label">Tema</legend>
        <div className="settings-theme-grid">
          {TEMAS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={t === tema}
              className={`settings-theme-chip${t === tema ? " active" : ""}`}
              onClick={() => onTemaChange(t)}
              title={DESCRICAO_TEMA[t]}
            >
              {/* Cada amostra usa o gradiente REAL do seu tema. Antes todas liam as
                variáveis do tema ativo, então os quatro chips ficavam idênticos. */}
              <span
                className="settings-theme-swatch"
                style={{ background: gradienteCSS(PALETAS[t]) }}
                aria-hidden="true"
              />
              <span className="settings-theme-name">{ROTULOS_TEMA[t]}</span>
            </button>
          ))}
        </div>
        <p className="settings-hint">{DESCRICAO_TEMA[tema]}</p>
      </fieldset>
    </section>

    <section className="settings-section">
      <h2 className="settings-label">Auto-aprovar ferramentas</h2>
      <button
        type="button"
        className={`settings-toggle ${autoApprove ? "on" : "off"}`}
        onClick={onToggleAutoApprove}
        role="switch"
        aria-checked={autoApprove}
      >
        <span className="settings-toggle-knob" aria-hidden="true" />
        <span className="settings-toggle-label">{autoApprove ? "Ligado" : "Desligado"}</span>
      </button>
      <p className="settings-hint">
        Ligado, escritas e comandos rodam sem pedir permissão. Desligado, cada efeito abre um pedido
        com prévia do diff.
      </p>
    </section>

    <section className="settings-section">
      <h2 className="settings-label">Reduzir animações</h2>
      <button
        type="button"
        className={`settings-toggle ${reducaoMovimento ? "on" : "off"}`}
        onClick={onToggleReducaoMovimento}
        role="switch"
        aria-checked={reducaoMovimento}
      >
        <span className="settings-toggle-knob" aria-hidden="true" />
        <span className="settings-toggle-label">{reducaoMovimento ? "Ligado" : "Desligado"}</span>
      </button>
      <p className="settings-hint">
        Desliga transições e o pulsar dos indicadores. O sistema já é respeitado automaticamente
        quando você pede movimento reduzido no Windows.
      </p>
    </section>

    <section className="settings-section">
      <h2 className="settings-label">Skills do projeto</h2>
      <p className="settings-value">
        {skills === undefined
          ? "—"
          : skills === 0
            ? "Nenhuma"
            : `${skills} carregada${skills > 1 ? "s" : ""}`}
      </p>
      <p className="settings-hint">
        Lidas de <code>.codingpro/skills</code> na pasta aberta.
      </p>
    </section>

    <section className="settings-section">
      <h2 className="settings-label">Atalhos</h2>
      <dl className="settings-shortcuts">
        {ATALHOS.map(([tecla, acao]) => (
          <div key={tecla}>
            <dt>
              {tecla.split(" ").map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{acao}</dd>
          </div>
        ))}
      </dl>
    </section>

    <section className="settings-section">
      <h2 className="settings-label">Versão</h2>
      <p className="settings-value">{appVersion ? `CodingPro Desktop ${appVersion}` : "—"}</p>
    </section>
  </div>
);
