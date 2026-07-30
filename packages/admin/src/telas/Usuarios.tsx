import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  api,
  ErroApi,
  formatarData,
  formatarUsd,
  PRESETS_LIMITE,
  type UsuarioAdmin,
} from "../api.js";

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);

  const carregar = useCallback((termo: string) => {
    api
      .get<{ usuarios: UsuarioAdmin[] }>(`/api/admin/usuarios?busca=${encodeURIComponent(termo)}`)
      .then((dados) => setUsuarios(dados.usuarios))
      .catch((causa: unknown) =>
        setErro(causa instanceof ErroApi ? causa.message : "Falha ao carregar usuários."),
      );
  }, []);

  useEffect(() => {
    // Debounce: a busca dispara a cada tecla, não vale bater na API em todas.
    const id = setTimeout(() => carregar(busca), 250);
    return () => clearTimeout(id);
  }, [busca, carregar]);

  async function alterar(usuario: UsuarioAdmin, campos: Record<string, unknown>) {
    setErro("");
    try {
      await api.patch(`/api/admin/usuarios/${usuario.id}`, campos);
      carregar(busca);
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao atualizar.");
    }
  }

  async function revogarTokens(usuario: UsuarioAdmin) {
    setErro("");
    try {
      const r = await api.post<{ total: number }>(
        `/api/admin/usuarios/${usuario.id}/revogar-tokens`,
      );
      setErro(`${r.total} token(s) revogado(s) de ${usuario.email}.`);
      carregar(busca);
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao revogar.");
    }
  }

  return (
    <div className="pilha">
      <div className="linha">
        <input
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          style={{ maxWidth: "340px" }}
          value={busca}
        />
        <span className="espacador" />
        <span className="fraco">{usuarios?.length ?? 0} conta(s)</span>
      </div>

      {erro && <div className="aviso">{erro}</div>}

      <div className="cartao">
        {usuarios === null ? (
          <p className="fraco centro">Carregando…</p>
        ) : usuarios.length === 0 ? (
          <p className="fraco centro">Nenhuma conta encontrada.</p>
        ) : (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Status</th>
                  <th>Consumo/mês</th>
                  <th>Limite</th>
                  <th>Reqs</th>
                  <th>VPS</th>
                  <th>Último login</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr key={usuario.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {usuario.nome} {usuario.admin && <span className="selo info">admin</span>}
                      </div>
                      <div className="fraco">{usuario.email}</div>
                    </td>
                    <td>
                      <span
                        className={`selo ${
                          usuario.status === "ativo"
                            ? "ok"
                            : usuario.status === "pendente"
                              ? "espera"
                              : "ruim"
                        }`}
                      >
                        {usuario.status}
                      </span>
                    </td>
                    <td>{formatarUsd(usuario.custoMicro)}</td>
                    <td>
                      <div>
                        {usuario.limiteMicro === 0
                          ? "sem limite mensal"
                          : formatarUsd(usuario.limiteMicro)}
                      </div>
                      <div className="fraco">
                        dia:{" "}
                        {usuario.limiteDiarioMicro === 0
                          ? "sem limite"
                          : formatarUsd(usuario.limiteDiarioMicro ?? 0)}{" "}
                        · {usuario.rateRpm ?? 60} rpm
                      </div>
                    </td>
                    <td>{usuario.requisicoes}</td>
                    <td className="fraco">{usuario.workspaceMb ?? 0} MB</td>
                    <td className="fraco">{formatarData(usuario.ultimoLogin)}</td>
                    <td>
                      <div className="linha" style={{ gap: "0.35rem" }}>
                        {usuario.status === "pendente" && (
                          <button
                            className="pequeno"
                            onClick={() => alterar(usuario, { status: "ativo" })}
                            type="button"
                          >
                            Aprovar
                          </button>
                        )}
                        {usuario.status === "bloqueado" && (
                          <button
                            className="pequeno"
                            onClick={() => alterar(usuario, { status: "ativo" })}
                            type="button"
                          >
                            Desbloquear
                          </button>
                        )}
                        {usuario.status !== "bloqueado" && (
                          <button
                            className="pequeno perigo"
                            onClick={() => alterar(usuario, { status: "bloqueado" })}
                            type="button"
                          >
                            Bloquear
                          </button>
                        )}
                        <button
                          className="pequeno"
                          onClick={() => setEditando(usuario)}
                          type="button"
                        >
                          Limite
                        </button>
                        <button
                          className="pequeno"
                          onClick={() => revogarTokens(usuario)}
                          type="button"
                        >
                          Revogar tokens
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <ModalLimite
          onFechar={() => setEditando(null)}
          onSalvar={async (campos) => {
            await alterar(editando, campos);
            setEditando(null);
          }}
          usuario={editando}
        />
      )}
    </div>
  );
}

function ModalLimite({
  usuario,
  onFechar,
  onSalvar,
}: {
  usuario: UsuarioAdmin;
  onFechar: () => void;
  onSalvar: (campos: {
    limiteDiarioMicro: number;
    limiteMicro: number;
    rateRpm: number;
  }) => Promise<void>;
}) {
  const [valor, setValor] = useState((usuario.limiteMicro / 1_000_000).toFixed(2));
  const [valorDiario, setValorDiario] = useState(
    ((usuario.limiteDiarioMicro ?? 0) / 1_000_000).toFixed(2),
  );
  const [rateRpm, setRateRpm] = useState(String(usuario.rateRpm ?? 60));

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const dolares = Number.parseFloat(valor.replace(",", "."));
    const dolaresDia = Number.parseFloat(valorDiario.replace(",", "."));
    const rpm = Number.parseInt(rateRpm, 10);
    if (!Number.isFinite(dolares) || dolares < 0) return;
    if (!Number.isFinite(dolaresDia) || dolaresDia < 0) return;
    if (!Number.isSafeInteger(rpm) || rpm < 0) return;
    await onSalvar({
      limiteDiarioMicro: Math.round(dolaresDia * 1_000_000),
      limiteMicro: Math.round(dolares * 1_000_000),
      rateRpm: rpm,
    });
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay de modal
    // biome-ignore lint/a11y/useKeyWithClickEvents: o botão Cancelar é o caminho acessível
    <div className="modal-fundo" onClick={onFechar}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation no painel do modal */}
      <div
        aria-modal="true"
        className="cartao modal"
        onClick={(evento) => evento.stopPropagation()}
        role="dialog"
      >
        <h3>Limite mensal de {usuario.nome}</h3>
        <p className="fraco">Zero significa sem limite. O valor é em dólares por mês.</p>
        <form onSubmit={enviar}>
          <label>
            <span>Presets</span>
            <select
              onChange={(e) => setValor((Number(e.target.value) / 1_000_000).toFixed(2))}
              value=""
            >
              <option value="">Escolher um preset…</option>
              {PRESETS_LIMITE.map((preset) => (
                <option key={preset.rotulo} value={preset.micro}>
                  {preset.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Limite (US$/mês)</span>
            <input
              inputMode="decimal"
              onChange={(e) => setValor(e.target.value)}
              required
              value={valor}
            />
          </label>
          <label>
            <span>Limite diário (US$/dia)</span>
            <input
              inputMode="decimal"
              onChange={(e) => setValorDiario(e.target.value)}
              required
              value={valorDiario}
            />
          </label>
          <label>
            <span>Rate limit (RPM)</span>
            <input
              inputMode="numeric"
              min={0}
              onChange={(e) => setRateRpm(e.target.value)}
              required
              type="number"
              value={rateRpm}
            />
          </label>
          <div className="linha">
            <button className="primario" type="submit">
              Salvar
            </button>
            <button onClick={onFechar} type="button">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
