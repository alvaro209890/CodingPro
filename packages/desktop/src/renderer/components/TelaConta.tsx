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
    <div className="tela-conta">
      <div className="tela-conta__cartao">
        <h1 className="tela-conta__marca">CodingPro</h1>
        <p className="tela-conta__sub">
          {modo === "login"
            ? "Entre com sua conta aprovada para usar o app."
            : "Crie sua conta. O administrador vai aprová-la em seguida."}
        </p>

        {erro && <div className="tela-conta__erro">{erro}</div>}
        {sucesso && <div className="tela-conta__sucesso">{sucesso}</div>}

        {modo === "login" ? (
          <form onSubmit={entrar}>
            <label>
              E-mail
              <input autoFocus onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" type="email" value={email} />
            </label>
            <label>
              Senha
              <input onChange={(e) => setSenha(e.target.value)} placeholder="••••••" type="password" value={senha} />
            </label>
            <button className="tela-conta__botao" disabled={enviando} type="submit">
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        ) : (
          <form onSubmit={cadastrar}>
            <label>
              Nome
              <input autoFocus onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" value={nome} />
            </label>
            <label>
              E-mail
              <input onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" type="email" value={email} />
            </label>
            <label>
              Senha
              <input onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 8 caracteres" type="password" value={senha} />
            </label>
            <button className="tela-conta__botao" disabled={enviando} type="submit">
              {enviando ? "Criando…" : "Criar conta"}
            </button>
          </form>
        )}

        <p className="tela-conta__rodape">
          {modo === "login" ? (
            <>
              Não tem conta?{" "}
              <button className="tela-conta__link" onClick={() => { setModo("cadastro"); setErro(""); setSucesso(""); }} type="button">
                Criar agora
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button className="tela-conta__link" onClick={() => { setModo("login"); setErro(""); setSucesso(""); }} type="button">
                Fazer login
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
