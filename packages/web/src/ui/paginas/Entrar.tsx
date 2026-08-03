import { type FormEvent, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";
import { Aviso, Cartao } from "../componentes.js";
import { navegar, propsLink } from "../rotas.js";

export function Entrar({
  aoEntrar,
  destino = "/painel",
}: {
  aoEntrar: (usuario: Usuario) => void;
  /** Para onde ir depois do login (ex.: /playground ou /entrar-dispositivo). */
  destino?: string;
}) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [totp, setTotp] = useState("");
  const [precisaTotp, setPrecisaTotp] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const dados = await api.post<{ usuario: Usuario }>("/api/login", {
        email,
        senha,
        ...(precisaTotp ? { totp } : {}),
      });
      aoEntrar(dados.usuario);
      navegar(destinoSeguro(destino));
    } catch (causa) {
      if (causa instanceof ErroApi && causa.status === 401 && causa.codigo === "totp_obrigatorio") {
        setPrecisaTotp(true);
        setErro(causa.message);
        return;
      }
      setErro(causa instanceof ErroApi ? causa.message : "Não consegui entrar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth-page estreito">
      <Cartao className="auth-card">
        <span className="auth-symbol">✦</span>
        <p className="landing-eyebrow">BEM-VINDO DE VOLTA</p>
        <h2>Entre na sua conta.</h2>
        <p>Acesse a sua conta para ver o painel e conectar a CLI e o app desktop.</p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <form onSubmit={enviar}>
          <label>
            <span>E-mail</span>
            <input
              autoComplete="email"
              onChange={(e) => {
                setEmail(e.target.value);
                setPrecisaTotp(false);
                setTotp("");
              }}
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
          {precisaTotp && (
            <label>
              <span>Código 2FA</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setTotp(e.target.value)}
                placeholder="000000"
                required
                value={totp}
              />
            </label>
          )}
          <button className="primario auth-submit" disabled={enviando} type="submit">
            {enviando ? "Entrando…" : precisaTotp ? "Confirmar 2FA" : "Entrar"}
          </button>
        </form>
        <p className="fraco centro" style={{ margin: "1rem 0 0" }}>
          Não tem conta? <a {...propsLink("/cadastro")}>Criar agora</a>
        </p>
      </Cartao>
    </div>
  );
}

/** Só aceita caminhos internos relativos — evita open redirect. */
export function destinoSeguro(bruto: string | null | undefined, padrao = "/painel"): string {
  if (!bruto) return padrao;
  if (!bruto.startsWith("/") || bruto.startsWith("//") || bruto.includes("://")) return padrao;
  return bruto;
}
