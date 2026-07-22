# Contexto do CodingPro

## Produto

CodingPro é uma CLI local-first de desenvolvimento assistido por IA. A interface visível é
pt-BR, o runtime alvo é Node.js 24 e o workspace usa pnpm. O único provider de LLM para código é
DeepSeek, limitado aos modelos V4 Pro e V4 Flash; replay existe somente para testes.

## Regras de desenvolvimento

- Implementar em incrementos pequenos seguindo `CHECKLIST_MESTRE.md` e `planos/04_roadmap.md`.
- Atualizar documentação, checklist e roteiro de QA no mesmo incremento do código.
- Rodar `pnpm check` antes de commit e push.
- Testes comuns não acessam LLM nem rede; chamadas reais são evals opt-in.
- Nunca ler, imprimir ou versionar valores de chaves. Credenciais não entram no ambiente de tools.
- Código portado exige origem, SHA, licença e aviso em `THIRD_PARTY_NOTICES.md`.
- A branch `master` só recebe push normal, nunca force push.

## Estado atual

O F0.2c adicionou configuração JSONC global → projeto → ambiente legado → flags, com schema
fechado, leitura segura e política que impede repositórios de ativarem rede. O smoke real do
adaptador e o fluxo completo `codingpro -p` via DeepSeek foram aprovados com prompt sintético.
O próximo incremento é o F0.3: tool calling multi-turno no DeepSeek V4 Pro e V4 Flash, com
preservação de reasoning e evolução dos contratos Provider/Tool.
