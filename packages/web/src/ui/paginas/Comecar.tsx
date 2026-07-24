import { useState } from "react";
import type { Usuario } from "../api.js";
import { Aviso, Cartao } from "../componentes.js";
import { propsLink } from "../rotas.js";

const REPO = "https://codingpro.cursar.space";
const RELEASES = `${REPO}/downloads/CodingPro-portable-0.1.0.zip`;

function Bloco({ children }: { children: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(children);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sem permissão de clipboard: o usuário ainda pode selecionar e copiar à mão.
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <pre
        className="mono"
        style={{
          background: "var(--fundo)",
          border: "1px solid var(--borda)",
          borderRadius: "12px",
          margin: "0 0 1rem",
          overflowX: "auto",
          padding: "0.9rem 1rem",
        }}
      >
        <code>{children}</code>
      </pre>
      <button
        className="pequeno"
        onClick={copiar}
        style={{ position: "absolute", right: "0.5rem", top: "0.5rem" }}
        type="button"
      >
        {copiado ? "copiado ✓" : "copiar"}
      </button>
    </div>
  );
}

function Passo({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
      <div
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: "var(--fundo-elevado)",
          border: "1px solid var(--borda-forte)",
          borderRadius: "999px",
          display: "flex",
          flexShrink: 0,
          fontWeight: 700,
          height: "2rem",
          justifyContent: "center",
          width: "2rem",
        }}
      >
        {numero}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ marginBottom: "0.5rem" }}>{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

/**
 * Passo a passo de instalação. É a página que o usuário aprovado abre depois do
 * cadastro: por enquanto o produto se usa pela CLI e pelo app de Windows — não há
 * editor no site — então esta página é o caminho principal, não um extra.
 */
export function Comecar({ usuario }: { usuario: Usuario | null }) {
  const [plataforma, setPlataforma] = useState<"cli" | "windows">("cli");

  return (
    <>
      <h1 style={{ marginBottom: "0.5rem" }}>Como começar</h1>
      <p style={{ marginBottom: "2rem" }}>
        O CodingPro roda na sua máquina — pelo <strong>terminal</strong> ou pelo{" "}
        <strong>aplicativo de Windows</strong>. O site serve para criar a conta, acompanhar o
        consumo e autorizar seus dispositivos.
      </p>

      {usuario === null && (
        <Aviso tipo="atencao">
          Você ainda não tem conta neste navegador. <a {...propsLink("/cadastro")}>Crie a sua</a>{" "}
          antes de seguir os passos — o login da CLI precisa de uma conta aprovada.
        </Aviso>
      )}
      {usuario?.status === "pendente" && (
        <Aviso tipo="atencao">
          Sua conta está <strong>aguardando aprovação</strong>. Pode instalar tudo desde já; o passo
          de login só vai concluir depois que o administrador liberar seu acesso.
        </Aviso>
      )}

      <div className="abas" role="tablist">
        <button
          aria-selected={plataforma === "cli"}
          onClick={() => setPlataforma("cli")}
          role="tab"
          type="button"
        >
          Terminal (CLI)
        </button>
        <button
          aria-selected={plataforma === "windows"}
          onClick={() => setPlataforma("windows")}
          role="tab"
          type="button"
        >
          Aplicativo de Windows
        </button>
      </div>

      {plataforma === "cli" ? <PassosCli /> : <PassosWindows />}

      <Cartao style={{ marginTop: "2rem" }}>
        <h3>Deu problema?</h3>
        <ul className="suave" style={{ margin: 0, paddingLeft: "1.2rem" }}>
          <li>
            <strong>&quot;Nenhuma conta conectada&quot;</strong> — rode <code>codingpro login</code>{" "}
            de novo; o token pode ter sido revogado (trocar a senha revoga todos).
          </li>
          <li>
            <strong>&quot;Sua conta ainda não foi aprovada&quot;</strong> — aguarde a liberação do
            administrador.
          </li>
          <li>
            <strong>&quot;Você atingiu seu limite mensal&quot;</strong> — o limite renova no dia 1º;
            veja quanto falta no <a {...propsLink("/painel")}>painel</a>.
          </li>
          <li>
            <strong>O código expirou</strong> — ele vale 10 minutos. Rode{" "}
            <code>codingpro login</code> outra vez.
          </li>
        </ul>
      </Cartao>
    </>
  );
}

function PassosCli() {
  return (
    <Cartao>
      <Passo numero={1} titulo="Instale o Node.js 24 ou superior">
        <p>
          Baixe em <a href="https://nodejs.org">nodejs.org</a> (versão LTS). Confira no terminal:
        </p>
        <Bloco>node --version</Bloco>
      </Passo>

      <Passo numero={2} titulo="Instale o CodingPro">
        <p>Um comando só, em qualquer sistema:</p>
        <Bloco>npm install -g codingpro</Bloco>
        <p className="fraco">
          Os comandos <code>codingpro</code> e <code>cpro</code> passam a existir no seu terminal.
        </p>
      </Passo>

      <Passo numero={3} titulo="Conecte sua conta">
        <p>
          Rode o login. Ele mostra um código de 8 letras e fica esperando você confirmar aqui no
          site.
        </p>
        <Bloco>codingpro login</Bloco>
        <p>
          Abra{" "}
          <a {...propsLink("/entrar-dispositivo")}>codingpro.cursar.space/entrar-dispositivo</a>,
          digite o código e pronto — o terminal conclui sozinho. Nada de copiar chave de IA.
        </p>
      </Passo>

      <Passo numero={4} titulo="Confira se está tudo certo">
        <Bloco>codingpro conta</Bloco>
        <p className="fraco">
          Deve mostrar a API, o início do seu token e <strong>Estado: ✓ Token válido</strong>.
        </p>
      </Passo>

      <Passo numero={5} titulo="Use">
        <p>Abra o chat interativo na pasta do seu projeto:</p>
        <Bloco>{"cd meu-projeto\ncodingpro --chat"}</Bloco>
        <p>Ou mande uma tarefa direta, sem abrir o chat:</p>
        <Bloco>codingpro -p &quot;explique o que este projeto faz&quot;</Bloco>
        <p className="fraco" style={{ margin: 0 }}>
          Para sair da conta nesta máquina: <code>codingpro logout</code>.
        </p>
      </Passo>
    </Cartao>
  );
}

function PassosWindows() {
  return (
    <Cartao>
      <Passo numero={1} titulo="Baixe o instalador">
        <p>
          O aplicativo de desktop traz a mesma engine da CLI numa janela, com chat, diffs e terminal
          integrado.
        </p>
        <a className="botao primario" href={RELEASES}>
          Baixar para Windows (.zip)
        </a>
        <p className="fraco" style={{ marginTop: "0.75rem" }}>
          Descompacte o arquivo e execute <code>CodingPro.exe</code>. O Windows pode mostrar um aviso de
          aplicativo desconhecido (o app ainda não é assinado): clique em{" "}
          <strong>Mais informações</strong> → <strong>Executar assim mesmo</strong>.
        </p>
      </Passo>

      <Passo numero={2} titulo="Extraia e abra">
        <p>
          Descompacte o arquivo <code>.zip</code> em qualquer pasta e execute o{" "}
          <code>CodingPro.exe</code>. O Windows pode mostrar um aviso de aplicativo
          desconhecido (o app ainda não é assinado): clique em{" "}
          <strong>Mais informações</strong> → <strong>Executar assim mesmo</strong>.
        </p>
      </Passo>

      <Passo numero={3} titulo="Entre com sua conta">
        <p>
          Na tela inicial, digite seu <strong>e-mail e senha</strong> e clique em{" "}
          <strong>Entrar</strong>. O app conecta direto na sua conta — sem navegador,
          sem código. Quem ainda não tem conta pode criar ali mesmo, em segundos.
        </p>
        <p className="fraco" style={{ margin: 0 }}>
          Se você já rodou <code>codingpro login</code> nesta máquina, o app reaproveita
          a mesma conta e nem pede login.
        </p>
      </Passo>

      <Passo numero={4} titulo="Escolha a pasta do projeto">
        <p>
          Clique em <strong>Pasta</strong> (ou digite <code>/abrir</code>) e selecione o projeto em
          que quer trabalhar. A partir daí é só conversar.
        </p>
      </Passo>
    </Cartao>
  );
}
