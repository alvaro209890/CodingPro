import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, ErroApi, formatarData, formatarUsd, type Usuario } from "../api.js";
import { Aviso, Barra, Carregando, Cartao, GraficoDiario, Metrica } from "../componentes.js";
import { navegar, propsLink } from "../rotas.js";

type Consumo = {
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

type InicioTotp = {
  segredo: string;
  otpauth: string;
};

type Aba = "consumo" | "tokens" | "perfil";

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
          <strong>Conta aguardando aprovação.</strong> Você já pode navegar pelo painel, mas só vai
          conseguir gerar tokens e usar a CLI depois que o administrador liberar seu acesso.
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
          aria-selected={aba === "tokens"}
          onClick={() => setAba("tokens")}
          role="tab"
          type="button"
        >
          Tokens da CLI
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
      {aba === "tokens" && <AbaTokens usuario={usuario} />}
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
            de {formatarUsd(consumo.limiteMicro)} disponíveis
          </p>
        </Cartao>
        <Cartao className="painel-metrica">
          <Metrica rotulo="Do limite" valor={`${consumo.percentual.toFixed(1)}%`} />
          <div style={{ marginTop: "0.75rem" }}>
            <Barra percentual={consumo.percentual} />
          </div>
        </Cartao>
        <Cartao className="painel-metrica">
          <Metrica rotulo="Renova em" valor={`${consumo.diasAteRenovar}d`} />
          <p className="fraco" style={{ margin: "0.5rem 0 0" }}>
            {consumo.requisicoes} requisições este mês
          </p>
        </Cartao>
      </div>

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

function AbaTokens({ usuario }: { usuario: Usuario }) {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [novo, setNovo] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    api
      .get<{ tokens: Token[] }>("/api/tokens")
      .then((dados) => setTokens(dados.tokens))
      .catch((causa: unknown) =>
        setErro(causa instanceof ErroApi ? causa.message : "Falha ao carregar os tokens."),
      );
  }, []);

  useEffect(carregar, [carregar]);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      const dados = await api.post<{ texto: string }>("/api/tokens", { nome: nome || "Meu token" });
      setNovo(dados.texto);
      setNome("");
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao criar o token.");
    }
  }

  async function revogar(id: number) {
    setErro("");
    try {
      await api.del(`/api/tokens/${id}`);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao revogar.");
    }
  }

  return (
    <div className="pilha">
      <Cartao>
        <h3>Conectar uma máquina</h3>
        <p>
          Ainda não instalou? Veja o{" "}
          <a {...propsLink("/comecar")}>passo a passo para a CLI e o app de Windows</a>.
        </p>
        <p>
          Com a CLI instalada, rode <code>codingpro login</code> no terminal e digite o código que
          aparecer em <a {...propsLink("/entrar-dispositivo")}>entrar-dispositivo</a> — o token é
          criado sozinho.
        </p>
        <p style={{ margin: 0 }}>
          Se preferir colar o token manualmente, gere um abaixo e grave em{" "}
          <code>~/.codingpro/credenciais.json</code> (campo <code>token</code>) ou exporte{" "}
          <code>CODINGPRO_TOKEN</code> no ambiente.
        </p>
      </Cartao>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {novo && (
        <Aviso tipo="sucesso">
          <strong>Guarde este token agora — ele não será mostrado de novo.</strong>
          <code className="token-revelado">{novo}</code>
          <button className="pequeno" onClick={() => setNovo("")} type="button">
            Já guardei
          </button>
        </Aviso>
      )}

      <Cartao>
        <h3>Gerar token</h3>
        {usuario.status !== "ativo" ? (
          <p className="fraco" style={{ margin: 0 }}>
            Disponível assim que sua conta for aprovada.
          </p>
        ) : (
          <form className="linha" onSubmit={criar}>
            <input
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome (ex.: notebook do trabalho)"
              style={{ flex: 1, minWidth: "200px" }}
              value={nome}
            />
            <button className="primario" type="submit">
              Gerar
            </button>
          </form>
        )}
      </Cartao>

      <Cartao>
        <h3>Meus tokens</h3>
        {tokens === null ? (
          <Carregando />
        ) : tokens.length === 0 ? (
          <p className="fraco" style={{ margin: 0 }}>
            Nenhum token ainda.
          </p>
        ) : (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Início</th>
                  <th>Criado</th>
                  <th>Último uso</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td>{token.nome}</td>
                    <td className="mono">{token.prefixo}…</td>
                    <td className="fraco">{formatarData(token.criadoEm)}</td>
                    <td className="fraco">{formatarData(token.ultimoUso)}</td>
                    <td>
                      <span className={`selo ${token.revogadoEm ? "ruim" : "ok"}`}>
                        {token.revogadoEm ? "Revogado" : "Ativo"}
                      </span>
                    </td>
                    <td>
                      {!token.revogadoEm && (
                        <button
                          className="pequeno perigo"
                          onClick={() => revogar(token.id)}
                          type="button"
                        >
                          Revogar
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
  const totpAtivo = usuario.totpAtivo ?? usuario.totpAtivado ?? false;
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [codigo, setCodigo] = useState("");
  const [totpInicio, setTotpInicio] = useState<InicioTotp | null>(null);
  const [totpCodigo, setTotpCodigo] = useState("");
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
        `Senha alterada. ${dados.tokensRevogados} token(s) de CLI foram revogados por segurança — rode \`codingpro login\` de novo nas suas máquinas.`,
      );
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao trocar a senha.");
    }
  }

  async function verificar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      await api.post("/api/verificar-email", { codigo });
      setMensagem("E-mail verificado.");
      aoAtualizar();
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Código incorreto.");
    }
  }

  async function iniciarTotp() {
    setErro("");
    setMensagem("");
    try {
      const dados = await api.post<InicioTotp>("/api/conta/totp/iniciar");
      setTotpInicio(dados);
      setTotpCodigo("");
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao iniciar o 2FA.");
    }
  }

  async function ativarTotp(evento: FormEvent) {
    evento.preventDefault();
    if (!totpInicio) return;
    setErro("");
    setMensagem("");
    try {
      await api.post("/api/conta/totp/ativar", {
        codigo: totpCodigo,
        segredo: totpInicio.segredo,
      });
      setTotpInicio(null);
      setTotpCodigo("");
      setMensagem("Autenticação em dois fatores ativada.");
      aoAtualizar();
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao ativar o 2FA.");
    }
  }

  async function desativarTotp() {
    if (!window.confirm("Desativar a autenticação em dois fatores desta conta?")) return;
    setErro("");
    setMensagem("");
    try {
      await api.del("/api/conta/totp");
      setMensagem("Autenticação em dois fatores desativada.");
      aoAtualizar();
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Falha ao desativar o 2FA.");
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
                <td>
                  {usuario.email}{" "}
                  {usuario.emailVerificado ? (
                    <span className="selo ok">Verificado</span>
                  ) : (
                    <span className="selo espera">Não verificado</span>
                  )}
                </td>
              </tr>
              <tr>
                <th>Limite mensal</th>
                <td>{formatarUsd(usuario.limiteMicro)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Cartao>

      {!usuario.emailVerificado && (
        <Cartao>
          <h3>Verificar e-mail</h3>
          <p>
            Peça o código de 6 dígitos ao administrador (o envio automático por e-mail ainda não
            está ligado) e confirme aqui.
          </p>
          <form className="linha" onSubmit={verificar}>
            <input
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="000000"
              style={{ maxWidth: "160px" }}
              value={codigo}
            />
            <button type="submit">Confirmar</button>
          </form>
        </Cartao>
      )}

      <Cartao>
        <h3>Autenticação em dois fatores</h3>
        <p className="fraco">
          Proteja o login com um código temporário do seu aplicativo autenticador.
        </p>
        <div className="linha" style={{ marginBottom: totpInicio ? "1rem" : 0 }}>
          <span className={`selo ${totpAtivo ? "ok" : "espera"}`}>
            {totpAtivo ? "2FA ativo" : "2FA desativado"}
          </span>
          {!totpAtivo && (
            <button onClick={iniciarTotp} type="button">
              Iniciar
            </button>
          )}
          {totpAtivo && (
            <button className="perigo" onClick={desativarTotp} type="button">
              Desativar
            </button>
          )}
        </div>
        {totpInicio && (
          <form onSubmit={ativarTotp}>
            <p>
              Escaneie este URI no autenticador ou cadastre o segredo manualmente. Depois informe o
              código de 6 dígitos para ativar.
            </p>
            <code className="token-revelado">{totpInicio.otpauth}</code>
            <p className="fraco">
              Segredo: <code>{totpInicio.segredo}</code>
            </p>
            <label>
              <span>Código 2FA</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setTotpCodigo(e.target.value)}
                placeholder="000000"
                required
                style={{ maxWidth: "180px" }}
                value={totpCodigo}
              />
            </label>
            <div className="linha">
              <button className="primario" type="submit">
                Ativar 2FA
              </button>
              <button onClick={() => setTotpInicio(null)} type="button">
                Cancelar
              </button>
            </div>
          </form>
        )}
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
