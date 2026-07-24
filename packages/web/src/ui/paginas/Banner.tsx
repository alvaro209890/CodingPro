const SUGESTOES = [
  ["✦", "Criar um projeto", "Monte uma API, landing page ou automação."],
  ["⌘", "Analisar arquivos", "Peça uma leitura do seu workspace."],
  ["↗", "Executar comandos", "Use /agent ou abra o terminal integrado."],
];

export function Banner() {
  return (
    <div className="playground__banner">
      <div className="playground__brandMark" aria-hidden="true">
        ✦
      </div>
      <p className="playground__eyebrow">CODINGPRO · WORKSPACE PESSOAL</p>
      <h2 className="playground__bannerTitle">
        Construa no seu ritmo.
        <br />
        <span>A IA acompanha.</span>
      </h2>
      <p className="playground__bannerHint">
        Descreva uma tarefa, envie arquivos ou digite <kbd>/</kbd> para ver os comandos.
      </p>
      <div className="playground__suggestions">
        {SUGESTOES.map(([icon, title, text], index) => (
          <div
            className="playground__suggestion"
            style={{ animationDelay: `${120 + index * 90}ms` }}
            key={title}
          >
            <span>{icon}</span>
            <div>
              <strong>{title}</strong>
              <small>{text}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
