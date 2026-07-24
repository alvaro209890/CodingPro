interface BannerProps {
  onSelectSuggestion?: (prompt: string) => void;
}

const SUGESTOES = [
  {
    title: "Explorar workspace",
    text: "Liste arquivos e entenda a estrutura",
    prompt: "/context",
  },
  {
    title: "Criar código",
    text: "Gere API, componentes ou scripts",
    prompt: "Crie uma estrutura inicial para uma API REST em TypeScript",
  },
  {
    title: "Debugar",
    text: "Encontre e corrija problemas",
    prompt: "Analise os arquivos do workspace e encontre possíveis bugs",
  },
  {
    title: "Agente com tools",
    text: "Use o workspace real via ferramentas",
    prompt: "/agent Liste os arquivos do workspace e sugira melhorias",
  },
];

export function Banner({ onSelectSuggestion }: BannerProps) {
  return (
    <div className="playground__banner">
      <p className="playground__bannerEyebrow">Playground</p>
      <h2 className="playground__bannerTitle">Como posso ajudar?</h2>
      <p className="playground__bannerSub">
        Converse com a IA no seu workspace isolado — arquivos, terminal e Git no mesmo lugar.
      </p>

      <div className="playground__suggestions">
        {SUGESTOES.map((item, index) => (
          <button
            type="button"
            className="playground__suggestion"
            style={{ animationDelay: `${80 + index * 60}ms` }}
            key={item.title}
            onClick={() => onSelectSuggestion?.(item.prompt)}
          >
            <strong>{item.title}</strong>
            <small>{item.text}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
