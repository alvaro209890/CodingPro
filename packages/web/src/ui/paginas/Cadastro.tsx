import { type FormEvent, useEffect, useRef, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";
import { Aviso, Cartao } from "../componentes.js";
import { navegar, propsLink } from "../rotas.js";

type ConfigPublica = {
  turnstileSiteKey: string | null;
};

type Turnstile = {
  render: (
    elemento: HTMLElement,
    opcoes: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset?: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile";

function aoCarregarTurnstile(callback: () => void): () => void {
  if (window.turnstile) {
    callback();
    return () => {};
  }

  const existente = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
  if (existente) {
    existente.addEventListener("load", callback, { once: true });
    return () => existente.removeEventListener("load", callback);
  }

  const script = document.createElement("script");
  script.id = TURNSTILE_SCRIPT_ID;
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.addEventListener("load", callback, { once: true });
  document.head.appendChild(script);
  return () => script.removeEventListener("load", callback);
}

export function Cadastro({ aoEntrar }: { aoEntrar: (usuario: Usuario) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [aceitou, setAceitou] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileWidgetId, setTurnstileWidgetId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const turnstileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .get<ConfigPublica>("/api/publico/config")
      .then((config) => setTurnstileSiteKey(config.turnstileSiteKey))
      .catch(() => setTurnstileSiteKey(null));
  }, []);

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current || turnstileWidgetId) return;

    let ativo = true;
    const removerListener = aoCarregarTurnstile(() => {
      if (!ativo || !window.turnstile || !turnstileRef.current) return;
      const widgetId = window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
      });
      setTurnstileWidgetId(widgetId);
    });

    return () => {
      ativo = false;
      removerListener();
    };
  }, [turnstileSiteKey, turnstileWidgetId]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    if (!aceitou) {
      setErro("Você precisa aceitar os Termos e a Política de Privacidade.");
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setErro("Confirme o desafio de segurança para continuar.");
      return;
    }
    setEnviando(true);
    try {
      const dados = await api.post<{ usuario: Usuario }>("/api/cadastro", {
        email,
        nome,
        senha,
        termosAceitos: true,
        turnstileToken: turnstileToken || undefined,
      });
      aoEntrar(dados.usuario);
      navegar("/painel");
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Não consegui criar a conta.");
      if (turnstileWidgetId) {
        window.turnstile?.reset?.(turnstileWidgetId);
        setTurnstileToken("");
      }
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
          quando o administrador aprovar a conta e liberar créditos.
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
          <label className="checkbox-label">
            <input
              checked={aceitou}
              onChange={(e) => setAceitou(e.target.checked)}
              required
              type="checkbox"
            />
            <span>
              Li e aceito os <a {...propsLink("/termos")}>Termos</a> e a{" "}
              <a {...propsLink("/privacidade")}>Política de Privacidade</a>.
            </span>
          </label>
          {turnstileSiteKey && <div className="turnstile-box" ref={turnstileRef} />}
          <button
            className="primario auth-submit"
            disabled={enviando || !aceitou || (turnstileSiteKey !== null && !turnstileToken)}
            type="submit"
          >
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
