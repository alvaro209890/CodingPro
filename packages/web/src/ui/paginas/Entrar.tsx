import { type FormEvent, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";
import { Aviso, Cartao } from "../componentes.js";
import { navegar, propsLink } from "../rotas.js";

export function Entrar({ aoEntrar }: { aoEntrar: (usuario: Usuario) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const dados = await api.post<{ usuario: Usuario }>("/api/login", { email, senha });
      aoEntrar(dados.usuario);
      navegar("/painel");
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Não consegui entrar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="estreito" style={{ margin: "2rem auto" }}>
      <Cartao>
        <h2>Entrar</h2>
        <p>Acesse sua conta do CodingPro.</p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <form onSubmit={enviar}>
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
              autoComplete="current-password"
              onChange={(e) => setSenha(e.target.value)}
              required
              type="password"
              value={senha}
            />
          </label>
          <button className="primario" disabled={enviando} style={{ width: "100%" }} type="submit">
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="fraco centro" style={{ margin: "1rem 0 0" }}>
          Não tem conta? <a {...propsLink("/cadastro")}>Criar agora</a>
        </p>
      </Cartao>
    </div>
  );
}
