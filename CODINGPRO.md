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

O loop foi endurecido e ligado à CLL. **F1.7** deu retry/backoff no `runAgent` (só antes do 1º
token, sem duplicar deltas nem efeitos). **F1.8** ligou a compactação ao loop via `contextBudget`.
**F1.9** expôs `cost` no `AgentResult`. **F1.10** trouxe verbos de progresso pt-BR
(`describeAgentEvent`: "Lendo…", "Rodando…", ✓/✗). **F1.5/F1.6** já haviam entregue `compactMessages`
(trunca preservando o pareamento tool-call/result) e `estimateCost`/`formatCost` (doc 14.1).

**F1.11/F1.12** ligaram o agente à CLI: `codingpro --agente -p "..."` roda o loop headless com as
tools de leitura (efeitos negados fail-closed sem aprovação interativa), texto→stdout,
progresso/`/cost`→stderr, `--max-contexto` para compactar. O `-p` simples segue intacto (o smoke de
pacote continua verde). **F1.13/F1.14** adicionaram sessões: o transcrito é salvo em JSONL e o id
impresso; `--resume <id>` retoma um transcrito e `--continuar` a sessão mais recente; `CoreError`
vira mensagem segura na CLI.

**F1.15/F1.16** fecharam a interface interativa: `codingpro --chat` abre um chat (readline) que roda
o loop com TODAS as ferramentas; efeitos (escrever/rodar) pedem **aprovação interativa**
(`[s/N/sempre]`, fail-closed) mostrando o que será feito (`PermissionRequest.input`); o transcrito é
salvo por turno e há `/sair` `/custo` `/limpar` `/ajuda`. Toda a mecânica é testada offline com IO e
provider injetados.

A **F1 está completa, incluindo o marco validado AO VIVO com DeepSeek** (2026-07-22): num projeto
real, `codingpro --chat` executou uma tarefa de 10 passos (2× list_dir, 5× read_file, 1× write_file)
com **1 aprovação interativa** concedida no prompt e o arquivo criado de fato; o headless `--agente`
fez 6 passos read-only com custo/cache reais (65% de cache-hit, ~US$ 0,0009). Sandbox, tools,
permissões, loop (retry/compactação/custo), sessões, progresso, headless e chat interativo com
aprovações — tudo pronto, testado offline e comprovado ao vivo.

O *known issue* do `--chat` por *pipe* foi **corrigido**: `criarLeitorDeLinhas` lê stdin por eventos
`line`/`close` com uma fila (em vez de `readline/promises.question` sequencial), então funciona igual
em TTY e em pipe e resolve `undefined` no EOF sem travar. Validado no binário real (pipe consome as
linhas e roda o agente) e com 5 testes de unidade, incluindo o cenário exato do race (todo o input
de uma vez + EOF imediato).

O **polimento visual Ink/Aurora** (doc 16) segue reservado para a F8. Antes (F0.4/F0.3) já estavam
fechados o roteamento de papéis Pro/Flash e o tool calling multi-turno.

## F2 — Edição segura (em andamento)

O **F2.1** entregou a tool `edit_file` (blocos search/replace, formato do doc 07). Cada bloco tem
`search`/`replace`; o `search` precisa casar **exatamente uma vez** no arquivo (contagem literal, sem
regex) — 0 ocorrências devolve um erro estruturado ao modelo com a **linha mais parecida** como dica,
e >1 devolve a contagem pedindo mais contexto. A aplicação é **atômica**: os blocos entram numa cópia
de trabalho em ordem (um bloco pode editar texto que outro anterior produziu) e o arquivo só é
gravado se **todos** casarem; qualquer falha não toca o disco. A substituição é **literal** (split/join,
nunca interpreta `$&`/`$1` do `replace`). Há uma **guarda de leitura-antes-de-editar**: um `ReadTracker`
por sessão (criado no runtime de chat e no headless) registra cada `read_file`, e `edit_file` recusa
editar um arquivo que não foi lido na sessão (evita edição às cegas). A tool é `write` (passa pelo gate
de permissão como o `write_file`), reaproveita `writeFileWithin` (symlink final bloqueado, teto de 1 MiB,
contenção por realpath) e aparece no progresso pt-BR como "Editando …". Tudo testado offline
(blocos únicos/múltiplos/atômicos, match falho/ambíguo, guarda de leitura, `$` literal, symlink).

O **F2.2** entregou os **checkpoints automáticos com `/undo`**. Um `CheckpointStore` puro em Node
(sem dependência de git) mantém pilhas de **desfazer/refazer** sobre *snapshots* de arquivo,
persistidos em `.codingpro/checkpoints/<seq>/meta.json`. Antes de gravar, `write_file`/`edit_file`
**capturam o estado atual em disco** do alvo (a primeira captura do passo vence, então preserva
edições manuais do usuário feitas entre turnos). No chat, cada turno abre um passo (`begin`) e, se
escreveu algo, fecha num checkpoint (`commit`) — um turno que edita 3 arquivos vira **um** passo
desfazível. Comandos: `/undo [N]` restaura o estado anterior aos N últimos passos, `/redo [N]` refaz
(pilha só em memória, zerada a cada nova escrita), `/checkpoint` lista a linha do tempo. `undo`
guarda o estado "depois" antes de restaurar o "antes", e apaga o checkpoint do disco (um novo store
não o revê); `redo` recria o passo. A restauração usa `writeFileWithin`/`removeFileWithin` (contenção
por realpath, symlink final bloqueado) — desfazer um "criar" apaga o arquivo; arquivos acima de 4 MiB
são **omitidos** do snapshot (undo os ignora). A escolha por Node puro em vez de refs git ocultas é
deliberada: **nunca toca no `.git`/staging/branches do usuário**, funciona igual em pastas com ou sem
git e é 100% testável offline — satisfazendo a garantia do marco ("sem sujar o staging"). Tudo testado
(edição/criação/multi-arquivo, undo/redo, primeira-captura-vence, persistência entre instâncias,
omissão de arquivo grande, dir corrompido ignorado) — 404 testes verdes, cobertura 96,12%/92,62%.

O **F2.3** fechou a F2 com a **prévia de diff na aprovação** e o **marco**. `diffLinhas` faz um diff
linha a linha por LCS (puro, determinístico, sem dependências) e `formatarDiff` renderiza no estilo
unificado enxuto (`+`/`-`/` `, trechos longos de contexto colapsados em `⋯`, truncado por `maxLinhas`).
`resolverPreviaDeEscrita` calcula o antes/depois de uma escrita — para `write_file` lê o arquivo atual
(ou vazio se novo) contra o `content`; para `edit_file` aplica os blocos via `aplicarEdicoes` — de forma
**best-effort** (qualquer problema devolve `undefined`, nunca bloqueia a aprovação). O aprovador
interativo, que já recebe o `ToolContext` com o `workspace`, mostra esse diff **antes** do
`[s/N/sempre]`, então o usuário vê exatamente o que vai mudar. Arquivos acima de 2000 linhas viram só
um resumo (o diff O(n·m) é pulado).

O **marco da F2** foi validado offline: um `CheckpointStore` desfaz uma refatoração de **12 arquivos**
num único passo em **< 2 s** (teste com deadline), e um teste e2e pelo chat reescreve 3 arquivos num
turno e os reverte com um único `/undo`. Como nada disso toca o git do usuário, a garantia "sem sujar o
staging" é atendida por construção.

**F2 (edição segura) está completa**: `edit_file` atômico, checkpoints com `/undo`/`/redo`/`/checkpoint`
e diff na aprovação — tudo testado offline (426 testes, cobertura 96,16%/92,49%). Próximo bloco: **F3**
(entendimento de projeto: indexador tree-sitter, repo map com ranking, `/init` gera CODINGPRO.md).
