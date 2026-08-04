import type React from "react";
import type { UpdateStateUI } from "../../types/electron.js";

const BRAND_MARK = new URL("../../../assets/branding/codingpro-mark.png", import.meta.url).href;

interface UpdatePromptProps {
  state: UpdateStateUI;
  onDismiss: () => void;
  onDownload: () => void;
  onInstall: () => void;
}

export const UpdatePrompt: React.FC<UpdatePromptProps> = ({
  state,
  onDismiss,
  onDownload,
  onInstall,
}) => {
  if (state.status !== "available" && state.status !== "downloaded") return null;
  const downloaded = state.status === "downloaded";
  return (
    <div className="update-prompt-backdrop" role="presentation">
      <section
        className="update-prompt"
        role="dialog"
        aria-modal="true"
        aria-label="Atualização do CodingPro"
      >
        <img src={BRAND_MARK} alt="" />
        <div className="update-prompt-copy">
          <span className="update-prompt-eyebrow">CodingPro {state.availableVersion}</span>
          <h2>{downloaded ? "Atualização pronta" : "Nova atualização disponível"}</h2>
          <p>
            {downloaded
              ? "O download terminou. Deseja reiniciar o aplicativo e instalar agora?"
              : state.mode === "portable"
                ? "A edição portátil precisa ser baixada manualmente. Deseja abrir a página de instalação?"
                : "Deseja baixar agora? O aplicativo só será reiniciado depois de uma segunda confirmação."}
          </p>
          {state.releaseNotes && <div className="update-release-notes">{state.releaseNotes}</div>}
          <div className="update-prompt-actions">
            <button type="button" className="secondary" onClick={onDismiss}>
              Agora não
            </button>
            <button type="button" className="primary" onClick={downloaded ? onInstall : onDownload}>
              {downloaded
                ? "Reiniciar e instalar"
                : state.mode === "portable"
                  ? "Abrir download"
                  : "Baixar atualização"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
