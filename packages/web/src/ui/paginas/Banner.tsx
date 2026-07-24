interface BannerProps {
  onSelectSuggestion?: (prompt: string) => void;
}

const SUGESTOES = [
  {
    title: "Explorar workspace",
    text: "Analise arquivos e estrutura do projeto",
    prompt: "/context",
  },
  {
    title: "Criar código",
    text: "Gere API, componentes ou scripts",
    prompt: "Crie uma estrutura inicial para uma API REST em TypeScript",
  },
  {
    title: "Debugar",
    text: "Encontre e corrija erros no código",
    prompt: "Analise os arquivos do workspace e encontre possíveis bugs",
  },
  {
    title: "Executar tarefas",
    text: "Use o agente com tools reais",
    prompt: "/agent Liste os arquivos do workspace e sugira melhorias",
  },
];

export function Banner({ onSelectSuggestion }: BannerProps) {
  return (
    <div className="playground__banner">
      <h2 className="playground__bannerTitle">O que você quer criar hoje?</h2>

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
