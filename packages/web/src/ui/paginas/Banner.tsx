interface BannerProps {
  onSelectSuggestion?: (prompt: string) => void;
}

const SUGESTOES = [
  {
    icon: "✦",
    title: "Criar um projeto",
    text: "Monte uma API, landing page ou automação.",
    prompt: "Crie uma estrutura inicial para uma API REST em TypeScript",
  },
  {
    icon: "⚡",
    title: "Analisar arquivos",
    text: "Peça uma leitura do seu workspace.",
    prompt: "/context",
  },
  {
    icon: ">_",
    title: "Executar comandos",
    text: "Use modo agente para executar tarefas reais.",
    prompt: "/agent Crie um arquivo README.md detalhando este projeto",
  },
];

export function Banner({ onSelectSuggestion }: BannerProps) {
  return (
    <div className="playground__banner">
      <div className="playground__bannerHero">
        <div className="playground__brandMark" aria-hidden="true">
          ⚡
        </div>
        <p className="playground__eyebrow">CODINGPRO AI WORKSPACE</p>
        <h2 className="playground__bannerTitle">
          Desenvolvimento Inteligente.
          <br />
          <span className="gradiente">Impulsionado por IA.</span>
        </h2>
        <p className="playground__bannerHint">
          Descreva sua ideia, envie arquivos ou digite <kbd>/</kbd> para abrir os 12 slash commands.
        </p>
      </div>

      <div className="playground__suggestions">
        {SUGESTOES.map((item, index) => (
          <button
            type="button"
            className="playground__suggestion playground__card-rotating-border"
            style={{ animationDelay: `${120 + index * 90}ms` }}
            key={item.title}
            onClick={() => onSelectSuggestion?.(item.prompt)}
          >
            <span className="playground__suggestionIcon">{item.icon}</span>
            <div className="playground__suggestionText">
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
