# CodingPro Desktop 1.2.1 — timeout, cancelamento e saldo Cloud

Data: 2026-08-04

## Incidente observado

Durante uma tarefa de edição no desktop, a interface mostrou duas vezes `A DeepSeek não respondeu
dentro do tempo limite`. O transcrito persistido terminou às 09:59:16, mas o índice da sessão
chegou a 92 chamadas de API em cinco solicitações e o proxy continuou recebendo chamadas depois do
erro visível.

O banco de uso confirmou uma resposta interrompida às 10:03:57, com 39.204 ms e zero tokens,
registrada incorretamente como `ok`. Outras chamadas continuaram até a execução antiga finalmente
encerrar. Nenhum prompt, resposta ou token foi consultado nessa análise; somente horário, modelo,
contadores, duração e estado.

## Causa raiz

1. O main criava `activeAbort`, mas não passava `abort.signal` para `runAgent`, para o `ToolContext`
   nem para os turnos de reparo. Assim, **Parar**, fechar a janela ou cancelar não alcançava o
   provider e os subagentes.
2. O handler de cancelamento definia `runInFlight = false` imediatamente. A UI também saía do
   estado de execução antes do unwind, permitindo um segundo envio enquanto o primeiro ainda
   consumia a API.
3. O timeout entre chunks era 30 s. Uma resposta ainda viva passou desse intervalo e foi abortada;
   o retry automático repetiu a chamada sem indicar a tentativa na interface.
4. Quando o cliente abandonava o stream, o proxy liberava o reader sem cancelá-lo e registrava a
   chamada incompleta como sucesso.
5. O Electron empacotado escrevia o erro apenas em `console.error`, sem arquivo local persistente.

## Correção

- O mesmo `AbortSignal` agora percorre agente principal, tools, `task`, subagentes, provider e QA.
- O gate só é liberado no `finally` da execução; a UI mostra `Cancelando a execução…` até o
  evento final.
- O provider aceita 60 s entre chunks e 300 s no total. Retries transitórios aparecem como um
  aviso consolidado.
- O proxy acompanha a desconexão HTTP, aborta o fetch upstream, cancela readers abandonados e grava
  `cliente_desconectado`/`stream_interrompido` em vez de `ok`.
- `%APPDATA%\@codingpro\desktop\diagnostics.jsonl` registra início, retry, cancelamento, conclusão
  e falha, sem prompt, resposta ou credencial.
- A implementação de saldo que ficou parcial durante o incidente foi reconciliada: o provider lê
  `x-codingpro-creditos-micro`, o main guarda o valor e o preload entrega somente o número ao badge.

## Testes de regressão

- Cancelamento ligado ao runtime principal e aos reparos, sem liberar `runInFlight` cedo.
- Reader upstream cancelado quando o consumidor fecha antes do fim; resposta completa preserva uso.
- Retry transitório observável e consolidável na UI.
- JSONL de diagnóstico sem prompt e com mensagem sanitizada.
- Parse/formatação de microdólares e contrato main/preload/renderer.
- Callback de headers não consome o stream do provider.
- Smoke Cloud usa o token salvo sem imprimi-lo e exige resposta final mais header de saldo.

## Operação

O instalador NSIS 1.2.0 possui updater e deve oferecer a 1.2.1, sempre pedindo autorização para
baixar e novamente para instalar. A edição portátil continua oferecendo download manual.

## Validação e artefatos

- Node 24.14.0 e pnpm 10.34.4: `pnpm check` aprovado, com 3.922 testes aprovados e 52 pulados.
- Cobertura: statements 89,47%, branches 82,11%, functions 92,09% e lines 89,82%.
- `smoke-core` e `smoke:cloud` aprovados; o segundo validou resposta real e header de saldo sem
  imprimir credenciais.
- O smoke direto de desenvolvimento continuou recebendo 401 da chave DeepSeek local antiga. Esse
  caminho não é usado pelo aplicativo empacotado, que foi validado pela rota Cloud.
- `CodingPro-Setup-1.2.1.exe`: 86.419.821 bytes, SHA-256
  `7d82f4d085ebfb568d3e17623ed2d3536c686e4890f870379acb70c10df93685`.
- `CodingPro-portable-1.2.1.exe`: 86.180.863 bytes, SHA-256
  `08f4d7dd6af7c33861d644a1b491fe219f7d777a46eaddf7e797377376755461`.
- `CodingPro-Setup-1.2.1.exe.blockmap`: 91.384 bytes, SHA-256
  `c21c3ee06cb8890a4426fa06bdf2ed9096e0a2883ccfe826e3769a9a9fd2ea02`.
- `latest.yml`: SHA-256 `afc79263b084e319811c8381b0001e3340a5ba9a1636f195066a353c0c314797`.
- `latest.json`: SHA-256 `88b05c5bf8d41742a1f818ca987d5b0260201b5ea3ea00b20198a3d8a833c858`.
- Artefatos sem assinatura Authenticode nesta entrega, conforme a limitação já documentada.
