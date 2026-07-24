import { Cartao } from "../componentes.js";
import { DESKTOP_VERSAO, DOWNLOAD_WINDOWS, urlDownload } from "../downloads.js";
import { propsLink } from "../rotas.js";

const RECURSOS = [
  [
    "✦",
    "Agente de verdade",
    "Lê, edita e executa tarefas no seu projeto, com permissões sob seu controle.",
  ],
  [
    "⌘",
    "Tudo em pt-BR",
    "Mensagens, comandos e erros em uma linguagem clara, sem traduzir jargão.",
  ],
  [
    "◌",
    "Conhece seu código",
    "Contexto de projeto, memória e busca para trabalhar com mais continuidade.",
  ],
  [
    "↗",
    "Extensível",
    "Skills, MCP, hooks e subagentes para adaptar o fluxo ao seu jeito de trabalhar.",
  ],
  ["✓", "Nada irreversível", "Checkpoints e diffs antes de mudanças importantes no seu trabalho."],
  [
    "◔",
    "Consumo à vista",
    "Acompanhe limite, custo e uso da conta sem perder o contexto do projeto.",
  ],
];

export function Landing() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="selo info">Beta fechado · acesso por convite</span>
          <p className="landing-eyebrow">SEU WORKSPACE, SUA FORMA DE CRIAR</p>
          <h1>
            Uma IA que acompanha <span>o jeito que você trabalha.</span>
          </h1>
          <p className="landing-lead">
            CodingPro conecta CLI, desktop e navegador para você criar, corrigir e entregar software
            com contexto de verdade.
          </p>
          <div className="landing-actions">
            <a className="botao primario" {...propsLink("/cadastro")}>
              Criar minha conta <span>→</span>
            </a>
            <a className="botao" {...propsLink("/comecar")}>
              Ver como funciona
            </a>
          </div>
          <p className="landing-note">
            Sem chave de IA própria para começar. Você controla o workspace.
          </p>
        </div>

        <section className="landing-console" aria-label="Prévia da CLI CodingPro">
          <div className="landing-consoleBar">
            <span />
            <span />
            <span />
            <code>codingpro · workspace</code>
          </div>
          <div className="landing-consoleBody">
            <p className="console-muted">~/meu-projeto</p>
            <p>
              <b>›</b> codingpro --chat
            </p>
            <p className="console-green">✓ Contexto do projeto carregado</p>
            <p className="console-muted">Descreva o que quer criar ou corrigir.</p>
            <div className="console-input">
              <b>›</b>
              <span>analise esta aplicação e proponha melhorias</span>
              <i />
            </div>
          </div>
          <div className="landing-consoleFoot">
            <span>● Conectado</span>
            <span>DeepSeek V4</span>
          </div>
        </section>
      </section>

      <section className="landing-install">
        <div>
          <p className="landing-eyebrow">COMECE EM MINUTOS</p>
          <h2>Do terminal ao primeiro projeto.</h2>
        </div>
        <pre>
          <code>{"npm i -g codingpro\ncodingpro login\ncodingpro --chat"}</code>
        </pre>
        <div className="landing-install-actions">
          <a className="botao pequeno" {...propsLink("/comecar")}>
            Guia de instalação →
          </a>
          <a
            className="botao pequeno"
            download
            href={urlDownload(DOWNLOAD_WINDOWS.portable.arquivo)}
            title={DOWNLOAD_WINDOWS.portable.descricao}
          >
            {DOWNLOAD_WINDOWS.portable.rotulo} · {DOWNLOAD_WINDOWS.portable.tamanho}
          </a>
          <a
            className="botao pequeno"
            download
            href={urlDownload(DOWNLOAD_WINDOWS.setup.arquivo)}
            title={DOWNLOAD_WINDOWS.setup.descricao}
          >
            {DOWNLOAD_WINDOWS.setup.rotulo} · v{DESKTOP_VERSAO}
          </a>
        </div>
      </section>

      <section className="landing-section">
        <p className="landing-eyebrow">PROJETADO PARA O FLUXO REAL</p>
        <h2>Menos troca de contexto. Mais avanço.</h2>
        <div className="landing-features">
          {RECURSOS.map(([icone, titulo, texto]) => (
            <Cartao className="landing-feature" key={titulo}>
              <span className="landing-featureIcon">{icone}</span>
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </Cartao>
          ))}
        </div>
      </section>

      <section className="landing-steps">
        <p className="landing-eyebrow">DA CONTA AO WORKSPACE</p>
        <h2>Pronto para começar?</h2>
        <div className="landing-stepGrid">
          {["Crie sua conta", "Conecte sua máquina", "Construa com contexto"].map(
            (titulo, indice) => (
              <div className="landing-step" key={titulo}>
                <span>0{indice + 1}</span>
                <h3>{titulo}</h3>
                <p>
                  {indice === 0
                    ? "Cadastre-se e acompanhe a liberação de acesso."
                    : indice === 1
                      ? "Faça login na CLI ou no app desktop."
                      : "Use chat, terminal e arquivos no mesmo fluxo."}
                </p>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
