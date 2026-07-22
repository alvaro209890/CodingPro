export const mensagens = {
  ajuda: {
    descricao: "CLI local de código assistida por IA",
    opcoes: "Opções:",
    uso: "Uso:",
  },
  erro: {
    argumentoAusente: "argumento obrigatório ausente",
    argumentosDemais: "argumentos demais",
    inesperado: "não foi possível concluir a solicitação",
    interrompido: "operação interrompida",
    opcaoDesconhecida: "opção desconhecida",
    promptVazio: "o prompt não pode estar vazio",
  },
  opcao: {
    ajuda: "exibe a ajuda",
    prompt: "envia um prompt no modo não interativo",
    provider: "seleciona deepseek ou replay",
    replayFile: "define a fixture do provider replay",
    versao: "exibe a versão",
  },
} as const;
