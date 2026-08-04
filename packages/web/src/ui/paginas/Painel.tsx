import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { api, ErroApi, formatarData, formatarUsd, formatarUsdFino, type Usuario } from "../api.js";
import {
  Aviso,
  Cartao,
  ConfirmacaoInline,
  Esqueleto,
  GraficoDiario,
  Metrica,
} from "../componentes.js";
import { navegar, propsLink } from "../rotas.js";

export type Consumo = {
  creditosMicro: number;
  custoMicro: number;
  limiteMicro: number;
  percentual: number;
  requisicoes: number;
  diasAteRenovar: number;
  cacheHitPercent: number;
  custoMedioMicro: number;
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

const POLL_CONSUMO_MS = 30_000;

export function Painel({ usuario, aoAtualizar }: { usuario: Usuario; aoAtualizar: () => void }) {
  const [aba, setAba] = useState<Aba>("consumo");
  const tabIds = {
    consumo: useId(),
    dispositivos: useId(),
    perfil: useId(),
  };
  const painelIds = {
    consumo: useId(),
    dispositivos: useId(),
    perfil: useId(),
  };
  const tabRefs = {
    consumo: useRef<HTMLButtonElement>(null),
    dispositivos: useRef<HTMLButtonElement>(null),
    perfil: useRef<HTMLButtonElement>(null),
  };

  function trocarAba(proxima: Aba) {
    setAba(proxima);
    queueMicrotask(() => tabRefs[proxima].current?.focus());
  }

  function onTeclaAba(evento: KeyboardEvent<HTMLDivElement>) {
    const ordem: Aba[] = ["consumo", "dispositivos", "perfil"];
    const indice = ordem.indexOf(aba);
    if (evento.key === "ArrowRight" || evento.key === "ArrowLeft") {
      evento.preventDefault();
      const delta = evento.key === "ArrowRight" ? 1 : -1;
      const proxima = ordem[(indice + delta + ordem.length) % ordem.length];
      if (proxima) trocarAba(proxima);
    } else if (evento.key === "Home") {
      evento.preventDefault();
      trocarAba("consumo");
    } else if (evento.key === "End") {
      evento.preventDefault();
      trocarAba("perfil");
    }
  }

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

      <div className="abas" onKeyDown={onTeclaAba} role="tablist">
        {(
          [
            ["consumo", "Consumo"],
            ["dispositivos", "Dispositivos"],
            ["perfil", "Perfil"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            aria-controls={painelIds[id]}
            aria-selected={aba === id}
            id={tabIds[id]}
            key={id}
            onClick={() => trocarAba(id)}
            ref={tabRefs[id]}
            role="tab"
            tabIndex={aba === id ? 0 : -1}
            type="button"
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={tabIds.consumo}
        hidden={aba !== "consumo"}
        id={painelIds.consumo}
        role="tabpanel"
      >
        {aba === "consumo" && <AbaConsumo />}
      </div>
      <div
        aria-labelledby={tabIds.dispositivos}
        hidden={aba !== "dispositivos"}
        id={painelIds.dispositivos}
        role="tabpanel"
      >
        {aba === "dispositivos" && <AbaDispositivos />}
      </div>
      <div
        aria-labelledby={tabIds.perfil}
        hidden={aba !== "perfil"}
        id={painelIds.perfil}
        role="tabpanel"
      >
        {aba === "perfil" && <AbaPerfil usuario={usuario} aoAtualizar={aoAtualizar} />}
      </div>
    </>
  );
}

function AbaConsumo() {
  const [consumo, setConsumo] = useState<Consumo | null>(null);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const dados = await api.get<Consumo>("/api/consumo");
      setConsumo(dados);
      setAtualizadoEm(new Date());
    } catch (causa: unknown) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao carregar o consumo.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Polling leve só enquanto a aba está montada (W3).
  useEffect(() => {
    if (erro || !consumo) return;
    const id = window.setInterval(() => void carregar(), POLL_CONSUMO_MS);
    return () => window.clearInterval(id);
  }, [carregar, consumo, erro]);

  if (erro) {
    return (
      <Aviso aoTentarNovamente={() => void carregar()} tipo="erro">
        {erro}
      </Aviso>
    );
  }

  if (!consumo) {
    return (
      <div className="pilha" aria-busy="true">
        <div className="grade tres">
          <Esqueleto altura="6rem" />
          <Esqueleto altura="6rem" />
          <Esqueleto altura="6rem" />
        </div>
        <Esqueleto altura="10rem" />
      </div>
    );
  }

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

      <div className="grade tres">
        <Cartao className="painel-metrica">
          <Metrica rotulo="Cache-hit" valor={`${(consumo.cacheHitPercent ?? 0).toFixed(0)}%`} />
          <p className="fraco" style={{ margin: "0.5rem 0 0" }}>
            tokens reaproveitados do cache
          </p>
        </Cartao>
        <Cartao className="painel-metrica">
          <Metrica
            rotulo="Custo / requisição"
            valor={formatarUsdFino(consumo.custoMedioMicro ?? 0)}
          />
          <p className="fraco" style={{ margin: "0.5rem 0 0" }}>
            média deste mês
          </p>
        </Cartao>
        <Cartao className="painel-metrica">
          <Metrica
            rotulo="Atualização"
            valor={
              atualizadoEm
                ? atualizadoEm.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "—"
            }
          />
          <p className="fraco" style={{ margin: "0.5rem 0 0" }}>
            atualiza a cada 30 s
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
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nomeEdit, setNomeEdit] = useState("");

  const carregar = useCallback(() => {
    setErro("");
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
    setConfirmandoId(null);
    try {
      await api.del(`/api/tokens/${id}`);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao desconectar.");
    }
  }

  async function salvarNome(id: number) {
    const nome = nomeEdit.trim();
    if (!nome) return;
    setErro("");
    try {
      await api.patch(`/api/tokens/${id}`, { nome });
      setEditandoId(null);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao renomear.");
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

      {erro && (
        <Aviso aoTentarNovamente={carregar} tipo="erro">
          {erro}
        </Aviso>
      )}

      <Cartao>
        <h3>Máquinas conectadas</h3>
        {tokens === null ? (
          <div className="pilha" aria-busy="true">
            <Esqueleto altura="3rem" />
            <Esqueleto altura="3rem" />
          </div>
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
                    <td>
                      {editandoId === token.id ? (
                        <form
                          className="linha"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void salvarNome(token.id);
                          }}
                        >
                          <input
                            aria-label="Nome da máquina"
                            maxLength={80}
                            onChange={(e) => setNomeEdit(e.target.value)}
                            value={nomeEdit}
                          />
                          <button className="pequeno" type="submit">
                            Salvar
                          </button>
                          <button
                            className="pequeno"
                            onClick={() => setEditandoId(null)}
                            type="button"
                          >
                            Cancelar
                          </button>
                        </form>
                      ) : (
                        <div className="linha">
                          <span>{token.nome}</span>
                          <button
                            className="pequeno"
                            onClick={() => {
                              setEditandoId(token.id);
                              setNomeEdit(token.nome);
                            }}
                            type="button"
                          >
                            Renomear
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="fraco">{formatarData(token.criadoEm)}</td>
                    <td className="fraco">{formatarData(token.ultimoUso)}</td>
                    <td>
                      {confirmandoId === token.id ? (
                        <ConfirmacaoInline
                          aoCancelar={() => setConfirmandoId(null)}
                          aoConfirmar={() => void desconectar(token.id)}
                          confirmarRotulo="Desconectar"
                          pergunta="Desconectar esta máquina?"
                        />
                      ) : (
                        <button
                          className="pequeno perigo"
                          onClick={() => setConfirmandoId(token.id)}
                          type="button"
                        >
                          Desconectar
                        </button>
                      )}
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
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

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

  async function excluirConta() {
    setErro("");
    setMensagem("");
    setProcessandoDados(true);
    setConfirmarExclusao(false);
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
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            setConfirmarExclusao(true);
          }}
        >
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
          {confirmarExclusao ? (
            <ConfirmacaoInline
              aoCancelar={() => setConfirmarExclusao(false)}
              aoConfirmar={() => void excluirConta()}
              confirmarRotulo="Excluir definitivamente"
              pergunta="Excluir conta e dados associados?"
            />
          ) : (
            <button className="perigo" disabled={processandoDados} type="submit">
              Excluir conta
            </button>
          )}
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
