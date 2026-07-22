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

O F0.4 fechou o roteamento interno de papéis `auto|main|fast` para a allowlist DeepSeek:
`main`/`auto` → `deepseek-v4-pro`, `fast` → `deepseek-v4-flash`. A resolução é pura, fail-closed
e não aceita provider, endpoint ou ID arbitrário na fronteira de produto. O tráfego headless de
codificação (`codingpro -p`) usa `auto` → Pro; caminhos mecânicos internos passam `role: "fast"`.
O F0.3 anterior cobriu tools multi-turno, schemas e smoke real Pro/Flash. O provider ainda não
executa tools; permissões e efeitos ficam na F1. Próximo: heurísticas de auto-effort / spikes F0
restantes, sem seletor de modelo para o usuário.
