import { useCallback, useEffect, useState } from "react";
import { api, ErroApi, type Saude } from "../api.js";

function duracao(segundos: number): string {
  const dias = Math.floor(segundos / 86_400);
  const horas = Math.floor((segundos % 86_400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${minutos}min`;
  return `${minutos}min`;
}

export function SaudeTela() {
  const [saude, setSaude] = useState<Saude | null>(null);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const buscar = useCallback(() => {
    api
      .get<Saude>("/api/admin/saude")
      .then(setSaude)
      .catch((causa: unknown) =>
        setErro(causa instanceof ErroApi ? causa.message : "Falha ao carregar a saúde."),
      );
  }, []);

  useEffect(() => {
    buscar();
    const id = setInterval(buscar, 10_000);
    return () => clearInterval(id);
  }, [buscar]);

  async function alternarKillSwitch(ligado: boolean) {
    setErro("");
    try {
      await api.post("/api/admin/kill-switch", { ligado });
      setConfirmando(false);
      buscar();
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao acionar o kill switch.");
    }
  }

  if (erro) return <div className="aviso erro">{erro}</div>;
  if (!saude) return <p className="fraco centro">Carregando…</p>;

  const memoriaUsadaPct =
    ((saude.memoriaTotalMb - saude.memoriaLivreMb) / Math.max(1, saude.memoriaTotalMb)) * 100;

  return (
    <div className="pilha">
      <div className="grade tres">
        <Cartao
          rotulo="Requisições ativas"
          valor={String(saude.requisicoesAtivas)}
          nota={`${saude.requisicoesTotal} no total`}
        />
        <Cartao
          rotulo="Latência p50"
          valor={`${saude.latenciaP50Ms} ms`}
          nota={`p95: ${saude.latenciaP95Ms} ms`}
        />
        <Cartao
          rotulo="Erros 5xx"
          valor={String(saude.erros5xx)}
          nota={saude.erros5xx === 0 ? "nenhum desde o boot" : "conferir os logs"}
        />
        <Cartao
          rotulo="Memória do processo"
          valor={`${saude.memoriaProcessoMb} MB`}
          nota="teto do systemd: 1024 MB"
        />
        <Cartao
          rotulo="Memória da máquina"
          valor={`${memoriaUsadaPct.toFixed(0)}%`}
          nota={`${saude.memoriaLivreMb} MB livres de ${saude.memoriaTotalMb} MB`}
        />
        <Cartao
          rotulo="No ar há"
          valor={duracao(saude.uptimeSegundos)}
          nota={`load 1m: ${saude.loadAvg1m.toFixed(2)}`}
        />
      </div>

      <div className="cartao">
        <div className="linha">
          <div>
            <h3 style={{ marginBottom: "0.2rem" }}>
              Kill switch{" "}
              <span className={`selo ${saude.killSwitch ? "ruim" : "ok"}`}>
                {saude.killSwitch ? "🔴 fechado" : "🔵 aberto"}
              </span>
            </h3>
            <p className="fraco" style={{ margin: 0 }}>
              Corta todas as chamadas de IA imediatamente. O site, o login e o painel continuam
              funcionando — só o proxy para.
            </p>
          </div>
          <span className="espacador" />
          {saude.killSwitch ? (
            <button className="primario" onClick={() => alternarKillSwitch(false)} type="button">
              Reabrir a plataforma
            </button>
          ) : (
            <button className="perigo" onClick={() => setConfirmando(true)} type="button">
              Fechar a plataforma
            </button>
          )}
        </div>
      </div>

      {confirmando && (
        <ConfirmarFechamento
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => alternarKillSwitch(true)}
        />
      )}
    </div>
  );
}

function Cartao({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="cartao">
      <div className="metrica">
        <span className="rotulo">{rotulo}</span>
        <span className="valor">{valor}</span>
      </div>
      <p className="fraco" style={{ margin: "0.4rem 0 0" }}>
        {nota}
      </p>
    </div>
  );
}

/** Confirmação dupla: derrubar o proxy afeta todo mundo, não pode sair por clique errado. */
function ConfirmarFechamento({
  onCancelar,
  onConfirmar,
}: {
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const [texto, setTexto] = useState("");

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay de modal
    // biome-ignore lint/a11y/useKeyWithClickEvents: o botão Cancelar é o caminho acessível
    <div className="modal-fundo" onClick={onCancelar}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: barra a propagação do clique */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: não é um controle */}
      <div
        aria-modal="true"
        className="cartao modal"
        onClick={(evento) => evento.stopPropagation()}
        role="dialog"
      >
        <h3>Fechar a plataforma?</h3>
        <p>
          Todas as chamadas de IA passam a devolver <strong>503</strong> na hora, para todos os
          usuários. Digite <code>FECHAR</code> para confirmar.
        </p>
        <input
          aria-label="Confirmação"
          onChange={(e) => setTexto(e.target.value.toUpperCase())}
          placeholder="FECHAR"
          value={texto}
        />
        <div className="linha" style={{ marginTop: "1rem" }}>
          <button
            className="perigo"
            disabled={texto !== "FECHAR"}
            onClick={onConfirmar}
            type="button"
          >
            Fechar agora
          </button>
          <button onClick={onCancelar} type="button">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
