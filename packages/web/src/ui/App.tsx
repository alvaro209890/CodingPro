import { useCallback, useEffect, useState } from "react";
import { API_URL, api, type Usuario } from "./api.js";
import { Carregando } from "./componentes.js";
import { Cadastro } from "./paginas/Cadastro.js";
import { Comecar } from "./paginas/Comecar.js";
import { Entrar } from "./paginas/Entrar.js";
import { EntrarDispositivo } from "./paginas/EntrarDispositivo.js";
import { Landing } from "./paginas/Landing.js";
import { Painel } from "./paginas/Painel.js";
import { Playground } from "./paginas/Playground.js";
import { navegar, propsLink, useCaminho } from "./rotas.js";

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

  async function sair() {
    await api.post("/api/logout").catch(() => {});
    setUsuario(null);
    navegar("/");
  }

  // Playground roda em tela cheia, sem header/footer
  if (caminho === "/playground") {
    if (carregando) return <Carregando />;
    if (!usuario) return <Entrar aoEntrar={setDepoisDeEntrar(recarregarUsuario)} />;
    return <Playground usuario={usuario} />;
  }

  return (
    <div className="casca">
      <header className="topo">
        <a className="marca gradiente" {...propsLink("/")}>
          <span className="marca-sinal">✦</span> CodingPro
        </a>
        <nav>
          <a className="botao pequeno topo-link" {...propsLink("/comecar")}>
            Como começar
          </a>
          {usuario ? (
            <>
              <a className="botao pequeno topo-link" {...propsLink("/playground")}>
                Workspace
              </a>
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
          <Conteudo caminho={caminho} recarregar={recarregarUsuario} usuario={usuario} />
        )}
      </main>

      <footer className="rodape">
        <span>© {new Date().getFullYear()} CodingPro</span>
        <span>Desenvolvimento assistido por IA, em português.</span>
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
      <Entrar aoEntrar={setDepoisDeEntrar(recarregar)} />
    );
  }

  if (caminho === "/comecar") {
    return <Comecar usuario={usuario} />;
  }

  if (caminho === "/entrar-dispositivo") {
    return <EntrarDispositivo usuario={usuario} />;
  }

  if (caminho === "/painel") {
    if (!usuario) return <Entrar aoEntrar={setDepoisDeEntrar(recarregar)} />;
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
