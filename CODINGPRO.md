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

O **F1.3** fechou o loop agêntico: `runAgent` transmite um turno do provider, acumula a mensagem
do assistant, executa cada tool pedida via `ToolGate` (permissão aplicada) e realimenta os
`ToolResult` até o modelo parar de pedir tools ou o teto de passos ser atingido. Ferramentas só
rodam após um `finish` limpo, então falha de streaming nunca duplica efeito. Agrega uso de tokens,
respeita `AbortSignal` e emite eventos (`text/reasoning-delta`, `tool-call`, `tool-result`, `step`)
para a UI. O system prompt v1 (pt-BR, regras de tool-use e estilo conciso) é prefixado.

O **F1.4** adicionou persistência de sessão: `SessionStore` grava o transcrito em JSONL (uma
`ChatMessage` por linha, append-only), com `save`/`append`/`load`/`list`/`has`, ids seguros como
nome de arquivo e carga fail-closed (linha corrompida ou não-mensagem aborta). O `runAgent` passou a
detectar quando o transcrito já começa com o system prompt e não o duplica, habilitando a retomada.

Próximo na F1 (fase de integração): a TUI Ink (chat com streaming + `Approver` visual) ligando o loop
e as sessões à interface e ao `codingpro -p`, com as flags `--continue`/`--resume`; depois
retry/backoff e `/cost`. O núcleo agêntico (sandbox, tools, permissões, loop, sessões) já está pronto
e testado offline; falta a camada de interface. Antes (F0.4/F0.3) já estavam fechados o roteamento
de papéis Pro/Flash e o tool calling multi-turno.
