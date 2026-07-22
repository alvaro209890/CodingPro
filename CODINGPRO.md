# Contexto do CodingPro

## Produto

CodingPro é uma CLI local-first de desenvolvimento assistido por IA. A interface visível é
pt-BR, o runtime alvo é Node.js 24 e o workspace usa pnpm.

## Regras de desenvolvimento

- Implementar em incrementos pequenos seguindo `CHECKLIST_MESTRE.md` e `planos/04_roadmap.md`.
- Atualizar documentação, checklist e roteiro de QA no mesmo incremento do código.
- Rodar `pnpm check` antes de commit e push.
- Testes comuns não acessam LLM nem rede; chamadas reais são evals opt-in.
- Nunca ler, imprimir ou versionar valores de chaves. Credenciais não entram no ambiente de tools.
- Código portado exige origem, SHA, licença e aviso em `THIRD_PARTY_NOTICES.md`.
- A branch `master` só recebe push normal, nunca force push.

## Estado atual

O F0.2b adicionou o adaptador `deepseek-v4-pro` via AI SDK, streaming de texto/raciocínio,
usage/cache, cancelamento, erros seguros e hardening de terminal. A integração é validada
offline com `fetch` injetado; o smoke real existe, mas só roda com autorização explícita e
nunca no CI. Após esse smoke, o próximo incremento é o sistema de configuração em camadas.
