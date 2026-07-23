import { Cartao } from "../componentes.js";
import { propsLink } from "../rotas.js";

const RECURSOS = [
  {
    texto:
      "Loop agêntico completo: lê, edita e roda o que precisa, com sandbox de arquivos e permissões que você controla.",
    titulo: "Agente de verdade",
  },
  {
    texto:
      "Mensagens, comandos e erros em português. Nada de traduzir jargão na cabeça enquanto você programa.",
    titulo: "Tudo em pt-BR",
  },
  {
    texto:
      "Índice do repositório, busca vetorial local e memória de projeto — o contexto certo sem você colar arquivo.",
    titulo: "Conhece seu código",
  },
  {
    texto: "Subagentes, MCP, skills e hooks. A CLI cresce junto com o seu jeito de trabalhar.",
    titulo: "Extensível",
  },
  {
    texto:
      "Checkpoints com /undo e /redo. Toda escrita mostra o diff antes — você aprova ou recusa.",
    titulo: "Nada irreversível",
  },
  {
    texto:
      "Custo por sessão, taxa de cache e limite mensal visíveis o tempo todo. Sem surpresa na fatura.",
    titulo: "Consumo à vista",
  },
];

export function Landing() {
  return (
    <>
      <section className="centro" style={{ padding: "3rem 0 2.5rem" }}>
        <span className="selo info">Beta fechado</span>
        <h1 className="gradiente" style={{ marginTop: "1rem" }}>
          Programe com IA, no seu terminal, em português
        </h1>
        <p style={{ fontSize: "1.1rem", margin: "0 auto 2rem", maxWidth: "620px" }}>
          O <strong>CodingPro</strong> é uma CLI local-first de desenvolvimento assistido por IA.
          Crie uma conta e use direto — <strong>sem precisar de chave de IA própria</strong>.
        </p>
        <div className="linha" style={{ justifyContent: "center" }}>
          <a className="botao primario" {...propsLink("/cadastro")}>
            Criar conta
          </a>
          <a className="botao" {...propsLink("/comecar")}>
            Como começar
          </a>
        </div>
      </section>

      <Cartao>
        <p className="fraco" style={{ marginBottom: "0.5rem" }}>
          Instale e conecte sua conta —{" "}
          <a {...propsLink("/comecar")}>passo a passo completo aqui</a>:
        </p>
        <pre
          className="mono"
          style={{
            background: "var(--fundo)",
            border: "1px solid var(--borda)",
            borderRadius: "12px",
            margin: 0,
            overflowX: "auto",
            padding: "1rem 1.15rem",
          }}
        >
          <code>
            {"npm i -g codingpro\n"}
            {"codingpro login\n"}
            {"codingpro --chat"}
          </code>
        </pre>
      </Cartao>

      <h2 style={{ marginTop: "3rem" }}>O que você ganha</h2>
      <div className="grade tres" style={{ marginTop: "1rem" }}>
        {RECURSOS.map((recurso) => (
          <Cartao key={recurso.titulo}>
            <h3>{recurso.titulo}</h3>
            <p style={{ margin: 0 }}>{recurso.texto}</p>
          </Cartao>
        ))}
      </div>

      <h2 style={{ marginTop: "3rem" }}>Como funciona a conta</h2>
      <div className="grade tres" style={{ marginTop: "1rem" }}>
        <Cartao>
          <h3>1. Cadastro</h3>
          <p style={{ margin: 0 }}>
            Você cria a conta com e-mail e senha. Durante o beta, cada conta passa por aprovação
            manual antes de liberar o uso.
          </p>
        </Cartao>
        <Cartao>
          <h3>2. Conexão</h3>
          <p style={{ margin: 0 }}>
            Rode <code>codingpro login</code>, digite o código que aparece no terminal aqui no site
            e pronto — a máquina fica conectada.
          </p>
        </Cartao>
        <Cartao>
          <h3>3. Uso com limite</h3>
          <p style={{ margin: 0 }}>
            As chamadas de IA passam pelo servidor do CodingPro, que mede o consumo e respeita o
            limite mensal da sua conta. Você acompanha tudo no painel.
          </p>
        </Cartao>
      </div>

      <Cartao style={{ marginTop: "2.5rem" }} className="centro">
        <h3>Prefere usar sua própria chave?</h3>
        <p>
          Também dá: defina <code>DEEPSEEK_API_KEY</code> no ambiente e a CLI usa sua chave direto,
          sem passar por aqui. A conta é uma conveniência, não uma amarra.
        </p>
        <div className="linha" style={{ justifyContent: "center" }}>
          <a className="botao primario" {...propsLink("/comecar")}>
            Baixar e instalar
          </a>
          <a className="botao" href="https://github.com/alvaro209890/CodingPro">
            Ver no GitHub
          </a>
        </div>
      </Cartao>
    </>
  );
}
