import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, ErroApi, formatarData, formatarUsd, type Usuario } from "../api.js";
import { Aviso, Carregando, Cartao, GraficoDiario, Metrica } from "../componentes.js";
import { navegar, propsLink } from "../rotas.js";

type Consumo = {
  creditosMicro: number;
  custoMicro: number;
  limiteMicro: number;
  percentual: number;
  requisicoes: number;
  diasAteRenovar: number;
  diario: { dia: string; custoMicro: number }[];
};

type Token = {
  id: number;
  nome: string;
  prefixo: string;
  criadoEm: string;
  ultimoUso: string | null;
  revogadoEm: string | null;
};

type Aba = "consumo" | "dispositivos" | "perfil";

export function Painel({ usuario, aoAtualizar }: { usuario: Usuario; aoAtualizar: () => void }) {
  const [aba, setAba] = useState<Aba>("consumo");

  return (
    <>
      <div className="painel-cabecalho">
        <div>
          <p className="landing-eyebrow">CENTRO DA CONTA</p>
          <h1>Olá, {usuario.nome}</h1>
          <p className="fraco">{usuario.email}</p>
        </div>
        <span
          className={`selo ${usuario.status === "ativo" ? "ok" : usuario.status === "pendente" ? "espera" : "ruim"}`}
        >
          {usuario.status === "ativo"
            ? "Conta ativa"
            : usuario.status === "pendente"
              ? "Aguardando aprovação"
              : "Conta bloqueada"}
        </span>
      </div>

      {usuario.status === "pendente" && (
        <Aviso tipo="atencao">
          <strong>Conta criada! Aguardando aprovação do administrador.</strong> Você já pode navegar
          pelo painel, mas só poderá usar a CLI e o app depois que o administrador aprovar a conta e
          liberar créditos.
        </Aviso>
      )}
      {usuario.status === "bloqueado" && (
        <Aviso tipo="erro">
          <strong>Conta bloqueada.</strong> Fale com o administrador.
        </Aviso>
      )}

      <div className="abas" role="tablist">
        <button
          aria-selected={aba === "consumo"}
          onClick={() => setAba("consumo")}
          role="tab"
          type="button"
        >
          Consumo
        </button>
        <button
          aria-selected={aba === "dispositivos"}
          onClick={() => setAba("dispositivos")}
          role="tab"
          type="button"
        >
          Dispositivos
        </button>
        <button
          aria-selected={aba === "perfil"}
          onClick={() => setAba("perfil")}
          role="tab"
          type="button"
        >
          Perfil
        </button>
      </div>

      {aba === "consumo" && <AbaConsumo />}
      {aba === "dispositivos" && <AbaDispositivos />}
      {aba === "perfil" && <AbaPerfil usuario={usuario} aoAtualizar={aoAtualizar} />}
    </>
  );
}

function AbaConsumo() {
  const [consumo, setConsumo] = useState<Consumo | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .get<Consumo>("/api/consumo")
      .then(setConsumo)
      .catch((causa: unknown) =>
        setErro(causa instanceof ErroApi ? causa.message : "Falha ao carregar o consumo."),
      );
  }, []);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!consumo) return <Carregando />;

  return (
    <div className="pilha">
      <div className="grade tres">
        <Cartao className="painel-metrica">
          <Metrica rotulo="Consumo do mês" valor={formatarUsd(consumo.custoMicro)} />
          <p className="fraco" style={{ margin: "0.5rem 0 0" }}>
            limite mensal: {formatarUsd(consumo.limiteMicro)}
          </p>
        </Cartao>
        <Cartao className="painel-metrica">
          <Metrica rotulo="Saldo de créditos" valor={formatarUsd(consumo.creditosMicro)} />
          <p className="fraco" style={{ margin: "0.5rem 0 0" }}>
            liberado pelo administrador
          </p>
        </Cartao>
        <Cartao className="painel-metrica">
          <Metrica rotulo="Renova em" valor={`${consumo.diasAteRenovar}d`} />
          <p className="fraco" style={{ margin: "0.5rem 0 0" }}>
            {consumo.requisicoes} requisições este mês
          </p>
        </Cartao>
      </div>

      {consumo.creditosMicro <= 0 && (
        <Aviso tipo="erro">
          Seus créditos acabaram. Aguarde o administrador liberar mais para voltar a usar a IA.
        </Aviso>
      )}

      {consumo.percentual >= 80 && (
        <Aviso tipo={consumo.percentual >= 95 ? "erro" : "atencao"}>
          Você já usou {consumo.percentual.toFixed(0)}% do limite mensal. Ao atingir 100%, as
          chamadas passam a ser recusadas até a virada do mês.
        </Aviso>
      )}

      <Cartao>
        <h3>Consumo diário (30 dias)</h3>
        <GraficoDiario dados={consumo.diario} />
      </Cartao>
    </div>
  );
}

/**
 * Dispositivos conectados. A geração manual de token saiu do produto — o padrão é a
 * conta CodingPro Cloud, e o token é emitido sozinho quando você conecta a máquina.
 * O que continua aqui é o controle de segurança de verdade: ver e desconectar máquinas.
 */
function AbaDispositivos() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    api
      .get<{ tokens: Token[] }>("/api/tokens")
      .then((dados) => setTokens(dados.tokens))
      .catch((causa: unknown) =>
        setErro(causa instanceof ErroApi ? causa.message : "Falha ao carregar os dispositivos."),
      );
  }, []);

  useEffect(carregar, [carregar]);

  async function desconectar(id: number) {
    setErro("");
    try {
      await api.del(`/api/tokens/${id}`);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao desconectar.");
    }
  }

  const ativos = (tokens ?? []).filter((t) => !t.revogadoEm);

  return (
    <div className="pilha">
      <Cartao>
        <h3>Conectar uma máquina</h3>
        <p>
          Ainda não instalou? Veja o{" "}
          <a {...propsLink("/comecar")}>passo a passo para a CLI e o app de Windows</a>.
        </p>
        <p style={{ margin: 0 }}>
          Com o CodingPro instalado, rode <code>codingpro login</code> (ou entre pelo app de
          Windows) e confirme o código em{" "}
          <a {...propsLink("/entrar-dispositivo")}>entrar-dispositivo</a>. A conexão é automática —
          você não precisa criar nem copiar nada.
        </p>
      </Cartao>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Cartao>
        <h3>Máquinas conectadas</h3>
        {tokens === null ? (
          <Carregando />
        ) : ativos.length === 0 ? (
          <p className="fraco" style={{ margin: 0 }}>
            Nenhuma máquina conectada ainda.
          </p>
        ) : (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Máquina</th>
                  <th>Conectada em</th>
                  <th>Último uso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ativos.map((token) => (
                  <tr key={token.id}>
                    <td>{token.nome}</td>
                    <td className="fraco">{formatarData(token.criadoEm)}</td>
                    <td className="fraco">{formatarData(token.ultimoUso)}</td>
                    <td>
                      <button
                        className="pequeno perigo"
                        onClick={() => desconectar(token.id)}
                        type="button"
                      >
                        Desconectar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
function AbaPerfil({ usuario, aoAtualizar }: { usuario: Usuario; aoAtualizar: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [senhaExclusao, setSenhaExclusao] = useState("");
  const [processandoDados, setProcessandoDados] = useState(false);

  async function trocarSenha(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setMensagem("");
    try {
      const dados = await api.post<{ tokensRevogados: number }>("/api/senha", { atual, nova });
      setAtual("");
      setNova("");
      setMensagem(
        `Senha alterada. ${dados.tokensRevogados} máquina(s) foram desconectadas por segurança — entre de novo no app ou rode \`codingpro login\`.`,
      );
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao trocar a senha.");
    }
  }

  async function exportarDados() {
    setErro("");
    setMensagem("");
    setProcessandoDados(true);
    try {
      const dados = await api.get<Record<string, unknown>>("/api/conta/exportar");
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `codingpro-dados-${usuario.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMensagem("Exportação gerada.");
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao exportar dados.");
    } finally {
      setProcessandoDados(false);
    }
  }

  async function excluirConta(evento: FormEvent) {
    evento.preventDefault();
    if (!window.confirm("Excluir definitivamente sua conta e dados associados?")) return;
    setErro("");
    setMensagem("");
    setProcessandoDados(true);
    try {
      await api.del("/api/conta", { senha: senhaExclusao });
      setSenhaExclusao("");
      aoAtualizar();
      navegar("/");
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao excluir a conta.");
    } finally {
      setProcessandoDados(false);
    }
  }

  return (
    <div className="pilha">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {mensagem && <Aviso tipo="sucesso">{mensagem}</Aviso>}

      <Cartao>
        <h3>Conta</h3>
        <div className="tabela-rolagem">
          <table>
            <tbody>
              <tr>
                <th>Nome</th>
                <td>{usuario.nome}</td>
              </tr>
              <tr>
                <th>E-mail</th>
                <td>{usuario.email}</td>
              </tr>
              <tr>
                <th>Saldo de créditos</th>
                <td>{formatarUsd(usuario.creditosMicro)}</td>
              </tr>
              <tr>
                <th>Limite mensal</th>
                <td>{formatarUsd(usuario.limiteMicro)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Cartao>

      <Cartao>
        <h3>Seus dados</h3>
        <p className="fraco">
          Baixe uma cópia dos dados da conta ou solicite a exclusão definitiva.
        </p>
        <div className="linha" style={{ marginBottom: "1rem" }}>
          <button disabled={processandoDados} onClick={exportarDados} type="button">
            Exportar JSON
          </button>
        </div>
        <form onSubmit={excluirConta}>
          <label>
            <span>Confirmar senha para excluir conta</span>
            <input
              autoComplete="current-password"
              onChange={(e) => setSenhaExclusao(e.target.value)}
              required
              type="password"
              value={senhaExclusao}
            />
          </label>
          <button className="perigo" disabled={processandoDados} type="submit">
            Excluir conta
          </button>
        </form>
      </Cartao>

      <Cartao>
        <h3>Trocar senha</h3>
        <p className="fraco">Trocar a senha revoga todos os tokens de CLI da conta.</p>
        <form onSubmit={trocarSenha}>
          <label>
            <span>Senha atual</span>
            <input
              autoComplete="current-password"
              onChange={(e) => setAtual(e.target.value)}
              required
              type="password"
              value={atual}
            />
          </label>
          <label>
            <span>Nova senha</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(e) => setNova(e.target.value)}
              required
              type="password"
              value={nova}
            />
          </label>
          <button type="submit">Trocar senha</button>
        </form>
      </Cartao>
    </div>
  );
}
