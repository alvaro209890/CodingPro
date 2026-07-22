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

Começou a F1 (loop agêntico). O **F1.1** entregou o pacote `packages/core`: `Workspace` é a raiz
de trabalho canonicalizada (realpath) por onde toda tool de arquivo passa — rejeita caminho
absoluto/`~`/`..`, caracteres de controle e symlink que escapa (leitura com `O_NOFOLLOW`).
`ToolRegistry.run` é a única fronteira de execução: valida o input contra o schema e converte
qualquer falha em `ToolResult` de erro, sem nunca vazar caminho absoluto nem propagar throw pro
loop. As tools de leitura `read_file`, `list_dir` e `grep` são offline, com tetos de bytes/entradas;
o `grep` faz **busca literal** (nunca cria `RegExp` do usuário) para eliminar ReDoS. Efeitos
colaterais (write/bash) e permissões `ask|allowlist|auto` ficam para o **F1.2**.

O F0.4 anterior fechou o roteamento de papéis `auto|main|fast` para a allowlist DeepSeek
(`main`/`auto` → Pro, `fast` → Flash), puro e fail-closed. O F0.3 cobriu tools multi-turno,
schemas e smoke real Pro/Flash. Próximo: **F1.2** (write_file + bash sob permissão, `ask` até haver
checkpoint).
