import { useEffect, useState } from "react";
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

export function App() {
  const [admin, setAdmin] = useState<{ email: string; nome: string } | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "negado">("carregando");
  const [aba, setAba] = useState<Aba>("usuarios");

  useEffect(() => {
    // Portão de entrada: sem isso o painel renderizaria vazio para quem não é admin,
    // o que confunde mais do que um "acesso negado" explícito.
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
    return (
      <div className="conteudo estreito" style={{ paddingTop: "4rem" }}>
        <div className="cartao centro">
          <h2>Acesso restrito</h2>
          <p>
            Esta área é só do administrador. Entre com uma conta de administrador para continuar.
          </p>
          <a className="botao primario" href={`${SITE_URL}/entrar`}>
            Ir para o login
          </a>
        </div>
      </div>
    );
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
