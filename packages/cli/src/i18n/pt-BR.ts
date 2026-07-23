export const mensagens = {
  ajuda: {
    descricao: "CLI local de código assistida por IA",
    opcoes: "Opções:",
    uso: "Uso:",
  },
  erro: {
    argumentoAusente: "argumento obrigatório ausente",
    argumentosDemais: "argumentos demais",
    chatIndisponivel:
      "o modo chat exige um terminal interativo (TTY).\n  Abra o Konsole/GNOME Terminal e rode:  codingpro --chat",
    inesperado: "não foi possível concluir a solicitação",
    interrompido: "operação interrompida",
    opcaoDesconhecida: "opção desconhecida",
    promptVazio: "o prompt não pode estar vazio",
  },
  opcao: {
    agente: "roda o loop agêntico com ferramentas de leitura (headless)",
    ajuda: "exibe a ajuda",
    chat: "abre o chat interativo do agente (com aprovação de efeitos)",
    continuar: "retoma a sessão mais recente do agente",
    doctor: "roda o diagnóstico do ambiente e sai",
    maxContexto: "orçamento de tokens antes de compactar o contexto",
    prompt: "envia um prompt no modo não interativo",
    provider: "seleciona deepseek ou replay",
    replayFile: "define a fixture do provider replay",
    resume: "retoma uma sessão do agente pelo id",
    versao: "exibe a versão",
  },
} as const;
