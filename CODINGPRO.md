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

O F0.3 adicionou tool calling multi-turno no DeepSeek V4 Pro e V4 Flash, com contrato Tool puro,
schemas/argumentos/transcript validados, replay estrito e reasoning preservado entre call e
resultado. O smoke real de dois turnos foi aprovado nos dois modelos. O provider não executa
tools; permissões e efeitos pertencem à F1. O próximo incremento é o roteamento interno
`main|fast` entre Pro e Flash, sem seleção de provider ou ID arbitrário pelo usuário.
