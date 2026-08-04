import type { PermissionRequest, PreviaEscrita } from "@codingpro/core";
import type React from "react";
import { useEffect, useRef } from "react";
import { DiffViewer } from "./DiffViewer.js";

interface PermissionModalProps {
  request: PermissionRequest;
  previa?: PreviaEscrita;
  /** Quantos pedidos ainda esperam atrás deste (subagentes em paralelo). */
  naFila?: number;
  onRespond: (action: "allow" | "always" | "deny") => void;
  economiaHistoricoTok?: number;
}

/** Frase do que exatamente será feito — o usuário não deve ter que ler JSON para decidir. */
function resumirPedido(request: PermissionRequest): string {
  const input = request.input as Record<string, unknown> | undefined;
  const alvo = typeof input?.path === "string" ? input.path : undefined;
  switch (request.toolName) {
    case "write_file":
      return alvo ? `Criar ou sobrescrever ${alvo}` : "Escrever um arquivo";
    case "edit_file":
      return alvo ? `Editar ${alvo}` : "Editar um arquivo";
    case "bash":
      return typeof input?.command === "string"
        ? `Executar: ${input.command}`
        : "Executar um comando";
    default:
      return `Executar a ferramenta ${request.toolName}`;
  }
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  request,
  previa,
  naFila = 0,
  onRespond,
  economiaHistoricoTok,
}) => {
  const permitirRef = useRef<HTMLButtonElement | null>(null);

  // Foco vai para a ação primária ao abrir, e Esc recusa (fail-closed: a saída mais
  // segura é a negação, nunca a aprovação).
  useEffect(() => {
    permitirRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onRespond("deny");
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onRespond]);

  return (
    <div className="modal-overlay">
      <div
        className="modal-card permissao"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="permissao-titulo"
      >
        <div className="modal-header" id="permissao-titulo">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Precisa da sua permissão
          {naFila > 0 && (
            <span className="permissao-fila" title="Outros pedidos aguardam resposta">
              +{naFila} na fila
            </span>
          )}
        </div>

        <p className="permissao-resumo">{resumirPedido(request)}</p>
        <p className="permissao-meta">
          ferramenta <code>{request.toolName}</code> · efeito <code>{request.sideEffect}</code>
        </p>

        {previa ? (
          <DiffViewer
            previa={previa}
            {...(economiaHistoricoTok !== undefined && economiaHistoricoTok > 0
              ? { economiaHistoricoTok }
              : {})}
          />
        ) : (
          <pre className="modal-code-box">{JSON.stringify(request.input, null, 2)}</pre>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-deny" onClick={() => onRespond("deny")}>
            Negar <kbd>Esc</kbd>
          </button>
          <button type="button" className="btn btn-always" onClick={() => onRespond("always")}>
            Sempre permitir
          </button>
          <button
            ref={permitirRef}
            type="button"
            className="btn btn-allow"
            onClick={() => onRespond("allow")}
          >
            Permitir
          </button>
        </div>
        <p className="permissao-nota">
          “Sempre permitir” vale para <code>{request.toolName}</code> até o fim desta sessão.
        </p>
      </div>
    </div>
  );
};
