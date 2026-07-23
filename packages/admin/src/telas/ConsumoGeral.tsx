import { useEffect, useState } from "react";
import { api, type Consumo, ErroApi, formatarUsd } from "../api.js";

export function ConsumoGeral() {
  const [dados, setDados] = useState<Consumo | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const buscar = () =>
      api
        .get<Consumo>("/api/admin/consumo")
        .then(setDados)
        .catch((causa: unknown) =>
          setErro(causa instanceof ErroApi ? causa.message : "Falha ao carregar o consumo."),
        );
    buscar();
    const id = setInterval(buscar, 60_000);
    return () => clearInterval(id);
  }, []);

  if (erro) return <div className="aviso erro">{erro}</div>;
  if (!dados) return <p className="fraco centro">Carregando…</p>;

  const maximo = Math.max(...dados.diario.map((d) => d.custoMicro), 1);

  return (
    <div className="pilha">
      <div className="grade tres">
        <div className="cartao">
          <div className="metrica">
            <span className="rotulo">Custo do mês ({dados.competencia})</span>
            <span className="valor">{formatarUsd(dados.totalMicro)}</span>
          </div>
        </div>
        <div className="cartao">
          <div className="metrica">
            <span className="rotulo">Requisições (30d)</span>
            <span className="valor">{dados.totalRequisicoes}</span>
          </div>
        </div>
        <div className="cartao">
          <div className="metrica">
            <span className="rotulo">Contas com consumo</span>
            <span className="valor">{dados.top.length}</span>
          </div>
        </div>
      </div>

      <div className="cartao">
        <h3>Consumo diário (30 dias)</h3>
        {dados.diario.length === 0 ? (
          <p className="fraco">Nenhum consumo registrado ainda.</p>
        ) : (
          <>
            <div className="grafico">
              {dados.diario.map((ponto) => (
                <div
                  key={ponto.dia}
                  style={{ height: `${Math.max(2, (ponto.custoMicro / maximo) * 100)}%` }}
                  title={`${ponto.dia}: ${formatarUsd(ponto.custoMicro)} · ${ponto.requisicoes} reqs`}
                />
              ))}
            </div>
            <p className="fraco" style={{ marginTop: "0.6rem" }}>
              {dados.diario[0]?.dia} → {dados.diario[dados.diario.length - 1]?.dia} · pico de{" "}
              {formatarUsd(maximo)} num dia
            </p>
          </>
        )}
      </div>

      <div className="cartao">
        <h3>Top 5 usuários do mês</h3>
        {dados.top.length === 0 ? (
          <p className="fraco">Ninguém consumiu ainda este mês.</p>
        ) : (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Custo</th>
                  <th>Requisições</th>
                </tr>
              </thead>
              <tbody>
                {dados.top.map((linha) => (
                  <tr key={linha.email}>
                    <td>{linha.email}</td>
                    <td>{formatarUsd(linha.custoMicro)}</td>
                    <td>{linha.requisicoes}</td>
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
