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

F1 (loop agêntico) em andamento no pacote `packages/core`. O **F1.1** deu a base: `Workspace` é a
raiz canonicalizada (realpath) por onde toda tool de arquivo passa — rejeita caminho
absoluto/`~`/`..`, caracteres de controle e symlink que escapa (I/O com `O_NOFOLLOW`).
`ToolRegistry.run` valida o input contra o schema e converte qualquer falha em `ToolResult` de erro,
sem vazar caminho absoluto nem propagar throw pro loop. Tools de leitura offline com tetos:
`read_file`, `list_dir` e `grep` (**busca literal**, nunca cria `RegExp` do usuário → sem ReDoS).

O **F1.2** adicionou efeitos e permissões. `write_file` ancora a escrita no realpath do diretório-pai
(que já deve existir) e abre com `O_NOFOLLOW` (symlink final → bloqueado); `bash` roda na raiz com
**ambiente mínimo** (`PATH`/`HOME`/`LANG`, credenciais nunca vazam), grupo de processo próprio morto
no timeout/abort, saída capada e saneada (sem caracteres de controle). Permissões: `decidePermission`
é puro (`allowlist`/`ask`/`auto`; leitura sempre liberada; **efeito sem checkpoint sempre pede
aprovação** — git de checkpoint só chega na F2); `PermissionController` guarda o allow de sessão e
consulta o `Approver`; `ToolGate` autoriza antes de executar e devolve `execution-denied` sem tocar
em disco/processo quando negado.

Próximo na F1: TUI Ink (chat com streaming + `Approver` visual), o loop agêntico que liga
provider→tool-call→gate→`ToolResult`→próximo turno, e sessões/compactação. Antes (F0.4/F0.3) já
estavam fechados o roteamento de papéis Pro/Flash e o tool calling multi-turno.
