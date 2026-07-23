import React from "react";
import type { PermissionRequest } from "@codingpro/core";

interface PermissionModalProps {
  request: PermissionRequest;
  onRespond: (action: "allow" | "always" | "deny") => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({ request, onRespond }) => {
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Solicitada Aprovação de Efeito Colateral
        </div>

        <div className="modal-body">
          O agente solicita permissão para executar a ferramenta <strong>{request.toolName}</strong> ({request.sideEffect}):
        </div>

        <div className="modal-code-box">
          {JSON.stringify(request.input, null, 2)}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-deny" onClick={() => onRespond("deny")}>
            Recusar
          </button>
          <button type="button" className="btn btn-always" onClick={() => onRespond("always")}>
            Sempre Permitir
          </button>
          <button type="button" className="btn btn-allow" onClick={() => onRespond("allow")}>
            Aprovar
          </button>
        </div>
      </div>
    </div>
  );
};
