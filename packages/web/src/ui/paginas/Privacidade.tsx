export function Privacidade() {
  return (
    <article className="pagina-legal">
      <p className="landing-eyebrow">PRIVACIDADE</p>
      <h1>Política de Privacidade</h1>
      <p className="landing-lead">
        Esta política resume quais dados o CodingPro usa para entregar o serviço e quais controles
        ficam disponíveis para sua conta.
      </p>

      <section>
        <h2>Serviço</h2>
        <p>
          Coletamos os dados necessários para autenticar usuários, conectar dispositivos, executar
          comandos solicitados e medir o consumo da plataforma.
        </p>
      </section>

      <section>
        <h2>Contas</h2>
        <p>
          Guardamos informações como nome, e-mail, status da conta, verificação de e-mail, sessões e
          tokens. Senhas ficam armazenadas como hash e não são exibidas pela equipe.
        </p>
      </section>

      <section>
        <h2>Limites</h2>
        <p>
          Registramos métricas de uso, custos e eventos técnicos para aplicar limites, prevenir
          abuso e manter previsibilidade no beta.
        </p>
      </section>

      <section>
        <h2>Dados</h2>
        <p>
          Dados de projetos, prompts, respostas e arquivos podem transitar pelo serviço quando você
          pede uma ação ao agente. Evite enviar segredos ou informações sensíveis sem necessidade.
        </p>
      </section>

      <section>
        <h2>Contato</h2>
        <p>
          Você pode solicitar exportação ou exclusão de dados pelo painel da conta. Para dúvidas
          adicionais, use o canal de suporte informado no convite do beta.
        </p>
      </section>
    </article>
  );
}
