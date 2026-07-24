import { type FormEvent, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";
import { Aviso, Cartao } from "../componentes.js";
import { navegar, propsLink } from "../rotas.js";

export function Cadastro({ aoEntrar }: { aoEntrar: (usuario: Usuario) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const dados = await api.post<{ usuario: Usuario }>("/api/cadastro", { email, nome, senha });
      aoEntrar(dados.usuario);
      navegar("/painel");
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Não consegui criar a conta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-page estreito">
      <Cartao className="auth-card">
        <span className="auth-symbol">✦</span>
        <p className="landing-eyebrow">BETA FECHADO</p>
        <h2>Crie seu espaço de trabalho.</h2>
        <p>
          Durante o beta, cada conta é aprovada manualmente. Você já entra no painel e recebe acesso
          assim que for liberada.
        </p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <form onSubmit={enviar}>
          <label>
            <span>Nome</span>
            <input
              autoComplete="name"
              minLength={2}
              onChange={(e) => setNome(e.target.value)}
              required
              value={nome}
            />
          </label>
          <label>
            <span>E-mail</span>
            <input
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>Senha</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(e) => setSenha(e.target.value)}
              required
              type="password"
              value={senha}
            />
            <small className="fraco">Mínimo de 8 caracteres, com letras e números.</small>
          </label>
          <button className="primario auth-submit" disabled={enviando} type="submit">
            {enviando ? "Criando…" : "Criar conta"}
          </button>
        </form>
        <p className="fraco centro" style={{ margin: "1rem 0 0" }}>
          Já tem conta? <a {...propsLink("/entrar")}>Entrar</a>
        </p>
      </Cartao>
    </div>
  );
}
