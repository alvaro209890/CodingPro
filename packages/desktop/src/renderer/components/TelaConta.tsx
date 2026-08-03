import { type FormEvent, useCallback, useState } from "react";

/**
 * Tela de login do app: email + senha direto, sem navegador.
 * Quem já tem conta aprovada entra em segundos.
 */
export function TelaConta({ aoConectar }: { aoConectar: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState("");

  const entrar = useCallback(
    async (ev: FormEvent) => {
      ev.preventDefault();
      if (!email.trim() || !senha) return;
      setErro("");
      setEnviando(true);
      try {
        await window.codingproAPI.contaLoginDireto(email.trim(), senha);
        aoConectar();
      } catch (causa: unknown) {
        setErro(causa instanceof Error ? causa.message : "Login falhou.");
      } finally {
        setEnviando(false);
      }
    },
    [email, senha, aoConectar],
  );

  const cadastrar = useCallback(
    async (ev: FormEvent) => {
      ev.preventDefault();
      if (!email.trim() || !senha || nome.trim().length < 2) {
        setErro("Preencha nome, email e senha.");
        return;
      }
      setErro("");
      setEnviando(true);
      try {
        const msg = await window.codingproAPI.contaCadastrar(email.trim(), nome.trim(), senha);
        setSucesso(msg);
        setModo("login");
      } catch (causa: unknown) {
        setErro(causa instanceof Error ? causa.message : "Erro ao criar conta.");
      } finally {
        setEnviando(false);
      }
    },
    [email, senha, nome],
  );

  return (
    <main className="tela-conta">
      <section className="tela-conta__apresentacao" aria-label="CodingPro Desktop">
        <div className="tela-conta__logo">
          <span className="tela-conta__simbolo" aria-hidden="true">
            CP
          </span>
          <span>CodingPro</span>
        </div>

        <div className="tela-conta__mensagem">
          <p className="tela-conta__kicker">ASSISTENTE DE IA PARA DESENVOLVIMENTO</p>
          <h1>Seu código. Seu workspace. Um fluxo mais inteligente.</h1>
          <p>
            Entre com sua conta para trabalhar nos seus projetos locais com acesso controlado pelo
            CodingPro Cloud.
          </p>
          <div className="tela-conta__beneficios">
            <span>Workspace local</span>
            <span>Aprovação segura</span>
            <span>Créditos controlados</span>
          </div>
        </div>

        <p className="tela-conta__ambiente">CodingPro Desktop · Windows</p>
      </section>

      <section className="tela-conta__painel">
        <div className="tela-conta__cartao">
          <div className="tela-conta__marca-compacta" aria-hidden="true">
            <span className="tela-conta__simbolo">CP</span>
            <span>CodingPro</span>
          </div>
          <p className="tela-conta__etiqueta">CONTA CODINGPRO</p>
          <h2 className="tela-conta__titulo">
            {modo === "login" ? "Bem-vindo de volta" : "Crie sua conta"}
          </h2>
          <p className="tela-conta__sub">
            {modo === "login"
              ? "Use o mesmo e-mail e senha cadastrados no site."
              : "Cadastre-se aqui. O acesso é liberado após aprovação e concessão de créditos."}
          </p>

          {erro && (
            <div className="tela-conta__erro" role="alert">
              {erro}
            </div>
          )}
          {sucesso && <div className="tela-conta__sucesso">{sucesso}</div>}

          {modo === "login" ? (
            <form className="tela-conta__formulario" onSubmit={entrar}>
              <label className="tela-conta__campo">
                <span>E-mail</span>
                <input
                  autoComplete="username"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  type="email"
                  value={email}
                />
              </label>
              <label className="tela-conta__campo">
                <span>Senha</span>
                <input
                  autoComplete="current-password"
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Digite sua senha"
                  type="password"
                  value={senha}
                />
              </label>
              <button className="tela-conta__botao" disabled={enviando} type="submit">
                {enviando ? "Entrando…" : "Entrar na sua conta"}
              </button>
            </form>
          ) : (
            <form className="tela-conta__formulario" onSubmit={cadastrar}>
              <label className="tela-conta__campo">
                <span>Nome</span>
                <input
                  autoComplete="name"
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  value={nome}
                />
              </label>
              <label className="tela-conta__campo">
                <span>E-mail</span>
                <input
                  autoComplete="username"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  type="email"
                  value={email}
                />
              </label>
              <label className="tela-conta__campo">
                <span>Senha</span>
                <input
                  autoComplete="new-password"
                  minLength={8}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo de 8 caracteres"
                  type="password"
                  value={senha}
                />
              </label>
              <button className="tela-conta__botao" disabled={enviando} type="submit">
                {enviando ? "Criando…" : "Criar minha conta"}
              </button>
            </form>
          )}

          <div className="tela-conta__divisor" aria-hidden="true" />
          <p className="tela-conta__rodape">
            {modo === "login" ? (
              <>
                Ainda não tem conta?
                <button
                  className="tela-conta__link"
                  onClick={() => {
                    setModo("cadastro");
                    setErro("");
                    setSucesso("");
                  }}
                  type="button"
                >
                  Criar conta
                </button>
              </>
            ) : (
              <>
                Já tem uma conta?
                <button
                  className="tela-conta__link"
                  onClick={() => {
                    setModo("login");
                    setErro("");
                    setSucesso("");
                  }}
                  type="button"
                >
                  Fazer login
                </button>
              </>
            )}
          </p>
          <p className="tela-conta__seguranca">Sua credencial fica protegida neste dispositivo.</p>
        </div>
      </section>
    </main>
  );
}
