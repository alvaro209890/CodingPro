# Desktop 1.1.1 — login Cloud obrigatório e tela de acesso corrigida

Data: 2026-08-03  
Escopo: app Electron para Windows, site de downloads e publicação no acer.

## Problema encontrado

O instalador 1.1.0 podia abrir diretamente no chat sem pedir login quando encontrava uma
`DEEPSEEK_API_KEY` já configurada no computador. Essa regra era útil para desenvolvimento,
mas no produto distribuído contornava o fluxo oficial de aprovação da conta e consumo dos
créditos liberados pelo administrador.

A primeira tela de login exposta após fechar esse desvio também tinha falhas visuais: o
contêiner encolhia dentro do `#root` flexível, ocupava apenas parte da janela e os campos não
tinham estilos próprios para formulário.

## Correção

- builds empacotados (`app.isPackaged`) ignoram qualquer chave DeepSeek local;
- o app instalado aceita somente uma conta CodingPro Cloud válida;
- a conveniência de chave própria permanece apenas no runtime de desenvolvimento;
- conta válida continua tendo prioridade e usando o proxy da plataforma;
- a tela de acesso foi refeita com layout completo, responsivo, campos empilhados, estados de
  foco/erro/sucesso e texto explícito sobre aprovação e créditos;
- a barra de menu nativa fica oculta no uso normal;
- versão do desktop e do download público avançou para `1.1.1`.

## Verificações

- política empacotada + chave local + sem conta → `sem-acesso`;
- política empacotada + conta → `conta`;
- política de desenvolvimento + chave local → `chave-propria`;
- gate do monorepo: 336 arquivos de teste aprovados, 2 ignorados; 3.858 testes aprovados e
  52 ignorados, além de formatação, lint, tipos, builds e smoke de pacote;
- instalação local registrada como `CodingPro 1.1.1`;
- login redesenhado validado visualmente no Windows pelo usuário.

## Artefatos Windows

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| `CodingPro-Setup-1.1.1.exe` | 84.733.035 | `5b8a20cf7f21ad43f3cdc80d81bd262fa1cbdbb8e8352c070de89156c9cbd5fa` |
| `CodingPro-portable-1.1.1.exe` | 84.505.487 | `cccb02e4850f1b9d38683876ce99daef7b33bbbaab63657c84a8c59bef369bd5` |

Os dois arquivos têm cabeçalho PE `MZ`. A assinatura Authenticode ainda está ausente, como na
versão anterior; assinatura de código continua sendo uma pendência de distribuição.

## Resultado online

- site: `https://codingpro.cursar.space`;
- API: `https://codingpro-api.cursar.space`;
- downloads publicados em `/downloads/CodingPro-Setup-1.1.1.exe` e
  `/downloads/CodingPro-portable-1.1.1.exe`;
- serviços `codingpro-api`, `codingpro-web` e `codingpro-tunnel` ativos após a publicação.

## Rollback

Reverter o commit desta correção e restaurar `DESKTOP_VERSAO` para `1.1.0`; os executáveis
anteriores podem permanecer no diretório de downloads para rollback operacional, mas não
devem voltar a ser anunciados no site enquanto contornarem o login Cloud.
