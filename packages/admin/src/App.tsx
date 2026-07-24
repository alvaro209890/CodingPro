import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ErroApi } from "./api.js";
import { Auditoria } from "./telas/Auditoria.js";
import { ConsumoGeral } from "./telas/ConsumoGeral.js";
import { SaudeTela } from "./telas/Saude.js";
import { Usuarios } from "./telas/Usuarios.js";

type Aba = "usuarios" | "consumo" | "saude" | "auditoria";

const ABAS: readonly { id: Aba; rotulo: string }[] = [
  { id: "usuarios", rotulo: "Usuários" },
  { id: "consumo", rotulo: "Consumo" },
  { id: "saude", rotulo: "Saúde" },
  { id: "auditoria", rotulo: "Auditoria" },
];

const SITE_URL = "https://codingpro.cursar.space";

function TelaLogin({ erro }: { erro?: string }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState(erro ?? "");

  async function entrar(ev: FormEvent) {
    ev.preventDefault();
    if (!email || !senha) return;
    setEnviando(true);
    setMsg("");
    try {
      await api.post("/api/login", { email: email.trim(), senha });
      window.location.reload();
    } catch (causa: unknown) {
      setMsg(causa instanceof ErroApi ? causa.message : "Erro ao fazer login.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="conteudo estreito" style={{ paddingTop: "2rem" }}>
      <div className="cartao">
        <h2>Painel administrativo</h2>
        <p className="fraco">Entre com uma conta de administrador para continuar.</p>
        {msg && <p className="erro">{msg}</p>}
        <form onSubmit={entrar}>
          <label>
            E-mail
            <input
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@exemplo.com"
              type="email"
              value={email}
            />
          </label>
          <label>
            Senha
            <input
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••"
              type="password"
              value={senha}
            />
          </label>
          <button
            className="botao primario"
            disabled={enviando}
            type="submit"
            style={{ width: "100%" }}
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function App() {
  const [admin, setAdmin] = useState<{ email: string; nome: string } | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "negado">("carregando");
  const [aba, setAba] = useState<Aba>("usuarios");

  useEffect(() => {
    api
      .get<{ email: string; nome: string }>("/api/admin/check")
      .then((dados) => {
        setAdmin(dados);
        setEstado("ok");
      })
      .catch((causa: unknown) => {
        setEstado(causa instanceof ErroApi && causa.status === 0 ? "carregando" : "negado");
      });
  }, []);

  if (estado === "carregando") {
    return (
      <p className="fraco centro" style={{ padding: "4rem" }}>
        Verificando acesso…
      </p>
    );
  }

  if (estado === "negado") {
    return <TelaLogin />;
  }

  return (
    <div className="casca">
      <header className="topo">
        <span className="marca gradiente">CodingPro</span>
        <span className="selo info">Admin</span>
        <nav>
          <span className="fraco">{admin?.email}</span>
          <a className="botao pequeno" href={SITE_URL}>
            Site
          </a>
        </nav>
      </header>

      <main className="conteudo">
        <div className="abas" role="tablist">
          {ABAS.map((item) => (
            <button
              aria-selected={aba === item.id}
              key={item.id}
              onClick={() => setAba(item.id)}
              role="tab"
              type="button"
            >
              {item.rotulo}
            </button>
          ))}
        </div>

        {aba === "usuarios" && <Usuarios />}
        {aba === "consumo" && <ConsumoGeral />}
        {aba === "saude" && <SaudeTela />}
        {aba === "auditoria" && <Auditoria />}
      </main>
    </div>
  );
}
