import { useCallback, useEffect, useState } from "react";
import { api, ErroApi, formatarData, type RegistroAuditoria } from "../api.js";

const ACOES: readonly { valor: string; rotulo: string }[] = [
  { rotulo: "Todas as ações", valor: "" },
  { rotulo: "Cadastro", valor: "cadastro" },
  { rotulo: "Usuário atualizado", valor: "usuario_atualizado" },
  { rotulo: "Token criado", valor: "token_criado" },
  { rotulo: "Token revogado", valor: "token_revogado" },
  { rotulo: "Tokens revogados (admin)", valor: "tokens_revogados_admin" },
  { rotulo: "Dispositivo aprovado", valor: "device_aprovado" },
  { rotulo: "Troca de senha", valor: "troca_senha" },
  { rotulo: "Kill switch", valor: "kill_switch" },
];

export function Auditoria() {
  const [registros, setRegistros] = useState<RegistroAuditoria[] | null>(null);
  const [acao, setAcao] = useState("");
  const [pagina, setPagina] = useState(0);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    api
      .get<{ registros: RegistroAuditoria[] }>(
        `/api/admin/auditoria?acao=${encodeURIComponent(acao)}&pagina=${pagina}`,
      )
      .then((dados) => setRegistros(dados.registros))
      .catch((causa: unknown) =>
        setErro(causa instanceof ErroApi ? causa.message : "Falha ao carregar a auditoria."),
      );
  }, [acao, pagina]);

  useEffect(carregar, [carregar]);

  return (
    <div className="pilha">
      <div className="linha">
        <select
          onChange={(e) => {
            setAcao(e.target.value);
            setPagina(0);
          }}
          style={{ maxWidth: "280px" }}
          value={acao}
        >
          {ACOES.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
        <span className="espacador" />
        <button
          className="pequeno"
          disabled={pagina === 0}
          onClick={() => setPagina((p) => p - 1)}
          type="button"
        >
          ← Anterior
        </button>
        <span className="fraco">página {pagina + 1}</span>
        <button
          className="pequeno"
          disabled={(registros?.length ?? 0) < 50}
          onClick={() => setPagina((p) => p + 1)}
          type="button"
        >
          Próxima →
        </button>
      </div>

      {erro && <div className="aviso erro">{erro}</div>}

      <div className="cartao">
        {registros === null ? (
          <p className="fraco centro">Carregando…</p>
        ) : registros.length === 0 ? (
          <p className="fraco centro">Nenhum registro nesta página.</p>
        ) : (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Ação</th>
                  <th>Ator</th>
                  <th>Alvo</th>
                  <th>Detalhe</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((registro) => (
                  <tr key={registro.id}>
                    <td className="fraco">{formatarData(registro.criado_em)}</td>
                    <td>
                      <span className="selo">{registro.acao}</span>
                    </td>
                    <td>{registro.ator_email ?? registro.atorEmail ?? "—"}</td>
                    <td>{registro.alvo ?? "—"}</td>
                    <td className="mono fraco">
                      {registro.detalhe === null ? "—" : JSON.stringify(registro.detalhe)}
                    </td>
                    <td className="fraco">{registro.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
