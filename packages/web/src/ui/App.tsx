import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { API_URL, api, type Usuario } from "./api.js";
import { Carregando } from "./componentes.js";
import { destinoSeguro, navegar, propsLink, useCaminho } from "./rotas.js";

const Landing = lazy(() => import("./paginas/Landing.js").then((m) => ({ default: m.Landing })));
const Cadastro = lazy(() => import("./paginas/Cadastro.js").then((m) => ({ default: m.Cadastro })));
const Entrar = lazy(() => import("./paginas/Entrar.js").then((m) => ({ default: m.Entrar })));
const EntrarDispositivo = lazy(() =>
  import("./paginas/EntrarDispositivo.js").then((m) => ({ default: m.EntrarDispositivo })),
);
const Comecar = lazy(() => import("./paginas/Comecar.js").then((m) => ({ default: m.Comecar })));
const Painel = lazy(() => import("./paginas/Painel.js").then((m) => ({ default: m.Painel })));
const Termos = lazy(() => import("./paginas/Termos.js").then((m) => ({ default: m.Termos })));
const Privacidade = lazy(() =>
  import("./paginas/Privacidade.js").then((m) => ({ default: m.Privacidade })),
);

/** Preload da rota mais provável após autenticar / aterrissar. */
function preloadRota(caminho: string, logado: boolean): void {
  if (logado || caminho === "/painel" || caminho === "/playground") {
    void import("./paginas/Painel.js");
    return;
  }
  if (caminho === "/entrar" || caminho === "/cadastro") {
    void import("./paginas/Entrar.js");
    void import("./paginas/Cadastro.js");
    return;
  }
  if (caminho === "/comecar") {
    void import("./paginas/Comecar.js");
    return;
  }
  void import("./paginas/Landing.js");
}

function destinoDaQuery(): string {
  try {
    return destinoSeguro(new URLSearchParams(window.location.search).get("voltar"));
  } catch {
    return "/painel";
  }
}

export function App() {
  const caminho = useCaminho();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregarUsuario = useCallback(() => {
    api
      .get<{ usuario: Usuario }>("/api/eu")
      .then((dados) => setUsuario(dados.usuario))
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(recarregarUsuario, [recarregarUsuario]);

  useEffect(() => {
    if (carregando) return;
    preloadRota(caminho, usuario !== null);
  }, [caminho, carregando, usuario]);

  async function sair() {
    await api.post("/api/logout").catch(() => {});
    setUsuario(null);
    navegar("/");
  }

  return (
    <div className="casca">
      <header className="topo">
        <a className="marca gradiente" {...propsLink("/")}>
          <img className="marca-sinal" src="/codingpro-mark.png" alt="" />
          <span>CodingPro</span>
        </a>
        <nav>
          <a className="botao pequeno topo-link" {...propsLink("/comecar")}>
            Como começar
          </a>
          {usuario ? (
            <>
              <a className="botao pequeno topo-link" {...propsLink("/painel")}>
                Painel
              </a>
              {usuario.admin && (
                <a className="botao pequeno" href={`${API_URL}/admin/`}>
                  Admin
                </a>
              )}
              <button className="pequeno topo-sair" onClick={sair} type="button">
                Sair
              </button>
            </>
          ) : (
            <>
              <a className="botao pequeno topo-link" {...propsLink("/entrar")}>
                Entrar
              </a>
              <a className="botao pequeno primario" {...propsLink("/cadastro")}>
                Criar conta
              </a>
            </>
          )}
        </nav>
      </header>

      <main className="conteudo">
        {carregando ? (
          <Carregando />
        ) : (
          <Suspense fallback={<Carregando />}>
            <Conteudo caminho={caminho} recarregar={recarregarUsuario} usuario={usuario} />
          </Suspense>
        )}
      </main>

      <footer className="rodape">
        <span>© {new Date().getFullYear()} CodingPro</span>
        <span className="rodape-links">
          <a {...propsLink("/termos")}>Termos</a>
          <a {...propsLink("/privacidade")}>Privacidade</a>
          <span>Desenvolvimento assistido por IA, em português.</span>
        </span>
      </footer>
    </div>
  );
}

function Conteudo({
  caminho,
  usuario,
  recarregar,
}: {
  caminho: string;
  usuario: Usuario | null;
  recarregar: () => void;
}) {
  if (caminho === "/cadastro") {
    return usuario ? (
      <Painel aoAtualizar={recarregar} usuario={usuario} />
    ) : (
      <Cadastro aoEntrar={setDepoisDeEntrar(recarregar)} />
    );
  }

  if (caminho === "/entrar") {
    return usuario ? (
      <Painel aoAtualizar={recarregar} usuario={usuario} />
    ) : (
      <Entrar aoEntrar={setDepoisDeEntrar(recarregar)} destino={destinoDaQuery()} />
    );
  }

  if (caminho === "/comecar") {
    return <Comecar usuario={usuario} />;
  }

  if (caminho === "/termos") {
    return <Termos />;
  }

  if (caminho === "/privacidade") {
    return <Privacidade />;
  }

  if (caminho === "/entrar-dispositivo") {
    return <EntrarDispositivo usuario={usuario} />;
  }

  // O workspace no navegador foi descontinuado: o front de trabalho é o app desktop e a CLI,
  // e a web ficou só como site de conta e informações. Links antigos caem no painel.
  if (caminho === "/painel" || caminho === "/playground") {
    if (!usuario) {
      return <Entrar aoEntrar={setDepoisDeEntrar(recarregar)} destino="/painel" />;
    }
    return <Painel aoAtualizar={recarregar} usuario={usuario} />;
  }

  return <Landing />;
}

/**
 * Depois de entrar/cadastrar, recarrega o usuário pela API em vez de confiar só no
 * corpo da resposta — assim o estado do topo e do painel vem sempre da mesma fonte.
 */
function setDepoisDeEntrar(recarregar: () => void) {
  return (_usuario: Usuario) => recarregar();
}
