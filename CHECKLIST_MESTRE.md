# CHECKLIST MESTRE — CodingPro (FASE 1: a CLI)

Visão única de progresso da **Fase 1**. Detalhes nos docs de `planos/`.
Fases 2 (app Windows) e 3 (plataforma web) têm roadmaps próprios em `fase2-app-windows/04` e `fase3-plataforma-web/04` — **só começam com a Fase 1 concluída**.
Legenda: ☐ pendente · ✅ feito · 🔶 em andamento

## Planejamento

- [x] Definir stack (TypeScript/Node ≥ 24) e nome (CodingPro) — 2026-07-22
- [x] Escrever docs de planejamento 01–16 + fases 2/3 — 2026-07-22
- [x] Rodada de 10 decisões de produto com o Álvaro (tabela no doc 01): comando codingpro+cpro, allowlist padrão, licença source-available, repo definitivo, pet on, voz→pós-1.0, trailer on, Aurora, npm+curl, Windows na F2 — 2026-07-22
- [ ] Álvaro revisar os planos e marcar ajustes
- [x] Iniciar a F0 — 2026-07-22

## Pré-F0 — Preparação

- [x] Clonar referências (cline, aider, sst/opencode + **Vertex/vertex-cli do Álvaro**) em `referencias/` e confirmar licenças — 2026-07-22
- [x] Mapear código portável (arquivo a arquivo) → doc 13 — 2026-07-22
- [x] Pesquisar DeepSeek V4 Pro (preços, cache, thinking, endpoints) → doc 14 — 2026-07-22
- [ ] Extrair spec do repo map do Aider (`repomap.py`) para .md próprio em TS-pseudocódigo
- [ ] Estudar a fundo `tool/edit.ts` do opencode e escolher Replacers da v1
- [ ] Rodar o provider-vcr do Cline e decidir portar × imitar o design
- [x] Chave DeepSeek p/ desenvolvimento definida; execução usa arquivo `0600` dedicado somente com `DEEPSEEK_API_KEY`, nunca o `.env` compartilhado — 2026-07-22
- [x] Decisão de produto: único provider de LLM para código é DeepSeek, somente V4 Pro/Flash; replay fica restrito a testes; CI verde ([execução 29951543077](https://github.com/alvaro209890/CodingPro/actions/runs/29951543077)) — 2026-07-22

## Transversal — Economia de tokens & auto-effort *(doc 14)*

- [ ] Layout de contexto cache-friendly especificado (prefixo estável, volátil no fim)
- [x] Driver DeepSeek com capability flags (`thinking` on/off + effort high/max; sem `budget_tokens`) — F0.2b, 2026-07-22
- [x] Estratégia fixa de 2 modelos (Pro código / Flash mecânico) com roteamento interno — F0.4, 2026-07-22
- [x] Auto-effort v1: heurísticas + roteador Flash + escalada por falha (sem escolha do usuário) — F1.10, 2026-07-23
- [x] `/cost` com taxa de cache-hit + custo por turno/tarefa/subagente — `formatCost` já inclui cache %; `/custo` no chat
- [x] Loop de qualidade: biome check automático após write/edit — só em projetos com `biome.json`; via `execFile` (sem shell → imune a injeção); non-blocking. Módulo `quality-runtime.ts` testável — 2026-07-23
- [ ] Evals **com LLM real** (opt-in): cache-hit >70% em sessão típica; auto-effort ≤60% do custo de fixo-high — fora do gate CI offline; ver `pnpm smoke:deepseek`

## Transversal — Português & Visual Aurora *(docs 15/16)*

- [~] verbos de progresso por evento (`describeAgentEvent`: "Lendo…", "Rodando…", "Pensando…") — F1.10, 2026-07-22; falta i18n canônico completo da UI
- [ ] Raciocínio interno livre, colapsado na TUI (Ctrl+O expande o bruto)
- [x] Comandos em português com alias inglês (/plano, /desfazer, /custo…) — 2026-07-23
- [x] Identidade visual Aurora entregue via **camada ANSI** (`packages/cli/src/tema.ts`), não Ink: banner com **gradiente esmeralda→ciano→violeta**, cabeçalho de projeto, régua, prompt ❯ violeta, eventos de ferramenta em ciano, aprovação/erros/sucesso coloridos — sobre o chat readline. 2026-07-23
- [x] Detecção de capacidade truecolor/256/16/NO_COLOR + `FORCE_COLOR` + degradação p/ texto limpo em pipe (`detectarNivelCor`), testada — 2026-07-23
- [ ] Timeline/spinner animados + 4 temas selecionáveis + fallback de glyphs — polimento adicional (opcional). O 1º protótipo Ink 5/React 19 (`packages/tui`) foi **removido do build** (incompleto/não-integrado); preservado no git (`fd6f3b1`). A camada ANSI atual entrega a identidade Aurora sem a fragilidade do full-screen Ink
- [ ] 3 propostas de banner/logo p/ o Álvaro escolher
- [ ] Eval A/B idioma do system prompt (en+diretiva-pt vs 100% pt)
- [ ] QA visual nos 6 terminais + sessão de aprovação visual com o Álvaro

## F0 — Fundação *(doc 04)*

- [x] F0.1: workspace pnpm + pacote `packages/cli` + bins `codingpro`/`cpro` — 2026-07-22
- [x] Node 24 fixado + TypeScript strict + Biome + Vitest + cobertura — 2026-07-22
- [x] Esqueleto offline: ajuda/versão em pt-BR, build ESM e erros controlados — 2026-07-22
- [x] CI em Node 24 verde no Linux e macOS — 2026-07-22
- [x] F0.2a: pacote `packages/llm` + contrato Provider v1 + replay sintético fail-closed — 2026-07-22
- [x] F0.2a: `codingpro -p`/`--prompt` com streaming headless offline e smoke do tarball — 2026-07-22
- [x] F0.2b: adaptador DeepSeek/AI SDK + usage de cache + erros/abort offline — 2026-07-22
- [x] F0.2b: smoke real sintético com autorização dupla e bloqueio no CI — 2026-07-22
- [x] F0.2c: config JSONC global → projeto → ambiente legado → flags, fail-closed e sem segredos — 2026-07-22
- [x] F0.3: contrato `Tool` puro + calls/results estruturados, sem execução automática no provider — 2026-07-22
- [x] F0.3: tool calling multi-turno no DeepSeek V4 Pro/Flash com reasoning preservado — 2026-07-22
- [x] F0.3: validação fail-closed de schema, argumentos, IDs, transcript e allowlist de modelos — 2026-07-22
- [x] F0.3: replay multi-turno, 167 testes offline e cobertura global >93% — 2026-07-22
- [x] F0.4: roteamento interno `auto|main|fast` → Pro/Flash, fail-closed, headless em Pro — 2026-07-22
- [x] Pacotes `packages/cli`, `packages/core` e `packages/llm` criados e em uso — 2026-07-23
- [x] Contrato de eventos core↔UI consolidado via `ProviderEvent`/`AgentEvent` — 2026-07-23
- [ ] Spikes restantes da F0: Ink+streaming · node:sqlite FTS5 · tree-sitter WASM (bloqueiam a TUI Aurora na F8)
- [x] 🏁 `codingpro -p` respondendo via DeepSeek real com prompt sintético — 2026-07-22

## F1 — Loop agêntico mínimo

- [ ] LLM Layer (streaming, tools, retry, custo)
- [x] F1.1: pacote `packages/core` + `Workspace` sandboxado (realpath, sem escape, O_NOFOLLOW) + `ToolRegistry` fail-closed — 2026-07-22
- [x] F1.1: tools de leitura `read_file` / `list_dir` / `grep` (busca literal, sem ReDoS), offline e com tetos — 2026-07-22
- [x] F1.2: tools de efeito `write_file` (O_NOFOLLOW + pai por realpath) e `bash` (env mínimo, grupo de processo morto no timeout/abort, saída saneada) — 2026-07-22
- [x] F1.2: permissões `ask|allowlist|auto` (`decidePermission` puro + `PermissionController` de sessão) e `ToolGate` que autoriza antes de executar; efeito sem checkpoint sempre pede aprovação — 2026-07-22
- [x] CI F1.1/F1.2 verde no Node 24.11/24.18 Linux e 24.18 macOS ([execução 29958217506](https://github.com/alvaro209890/CodingPro/actions/runs/29958217506)) — 2026-07-22
- [x] F1.3: loop agêntico `runAgent` (provider↔`ToolGate` multi-turno, uso de tokens agregado, teto de passos, abort) + system prompt v1 — 2026-07-22
- [x] F1.4: persistência de sessão em JSONL (`SessionStore`: save/append/load/list, fail-closed, id seguro) + retomada sem duplicar system prompt no `runAgent` — 2026-07-22
- [x] CI F1.3/F1.4 verde no Node 24.11/24.18 Linux e 24.18 macOS ([execução 29958941912](https://github.com/alvaro209890/CodingPro/actions/runs/29958941912)) — 2026-07-22
- [x] F1.5: compactação de contexto por truncamento (`compactMessages`: mantém system + sufixo recente, preserva pareamento tool-call/result, integridade acima do orçamento) — 2026-07-22
- [x] F1.6: contabilidade de custo DeepSeek (`estimateCost`/`formatCost`: cache-hit + USD; Pro oficial, Flash estimado ~10×) — 2026-07-22
- [x] CI F1.5/F1.6 verde no Node 24.11/24.18 Linux e 24.18 macOS ([execução 29959645894](https://github.com/alvaro209890/CodingPro/actions/runs/29959645894)) — 2026-07-22
- [x] F1.7: retry/backoff no `runAgent` só antes do 1º token (sem duplicar deltas nem efeitos), abortável — 2026-07-22
- [x] F1.8: compactação ligada ao loop via `contextBudget` (compacta antes de cada turno) — 2026-07-22
- [x] F1.9: custo agregado no `AgentResult` (`cost`) quando o modelo tem tabela de preço — 2026-07-22
- [x] F1.11: runtime headless do agente (`executarAgenteHeadless`: Workspace + tools de leitura + gate + loop; texto→stdout, progresso/`/cost`→stderr) — 2026-07-22
- [x] F1.12: `codingpro --agente -p` liga o loop à CLI + `--max-contexto` (compactação) — 2026-07-22
- [x] F1.13: sessões no agente headless (auto-salva transcrito em JSONL, imprime id) + `--resume <id>` — 2026-07-22
- [x] F1.14: `--continuar` retoma a sessão mais recente; `CoreError` vira mensagem segura na CLI — 2026-07-22
- [x] CI F1.7–F1.14 verde no Node 24.11/24.18 Linux e 24.18 macOS ([execução 29961027060](https://github.com/alvaro209890/CodingPro/actions/runs/29961027060)) — 2026-07-22
- [x] F1.15: aprovação interativa de efeitos (`Approver` via readline) + `PermissionRequest.input` para mostrar o que aprovar — 2026-07-22
- [x] F1.16: chat interativo `codingpro --chat` (todas as tools, efeitos sob aprovação, sessão salva por turno, `/sair` `/custo` `/limpar` `/ajuda`) — 2026-07-22
- [~] camada visual Ink/Aurora (tema, spinner, statusline, banner — doc 16): interface v1 é readline; visual vira polimento (F8)
- [x] CI F1.15/F1.16 verde no Node 24.11/24.18 Linux e 24.18 macOS ([execução 29961622281](https://github.com/alvaro209890/CodingPro/actions/runs/29961622281)); binário real validado (`--chat` abre, `--agente` dirige a cadeia até o provider, `-p` intacto) — 2026-07-22
- [x] 🏁 **Tarefa real de 5+ passos com aprovações — validada AO VIVO com DeepSeek** (2026-07-22): `--chat` num projeto real fez 10 passos (2× list_dir, 5× read_file, 1× write_file) com 1 aprovação interativa concedida no prompt e `VISAO.md` criado de fato; headless `--agente` fez 6 passos read-only + custo/cache reais (65% cache-hit, US$ 0,0009)
- [x] fix: `--chat` por stdin em pipe (não-TTY) — `criarLeitorDeLinhas` (eventos `line`/`close` + fila) elimina o race de EOF do `readline/promises`; validado no binário real (pipe lê as linhas e roda o agente) — 2026-07-22

## F2 — Edição segura

- [x] edit_file (search/replace atômico) + recuperação de falha — blocos `{search,replace}`, cada `search` casa exatamente 1×, aplicação atômica (todos ou nenhum), guarda de leitura-antes-de-editar (`ReadTracker` por sessão, `read_file` marca), erro estruturado ao modelo (0 ocorrências → dica de linha mais próxima; >1 → contagem), substituição literal via split/join (não interpreta `$`) — 2026-07-22
- [x] Checkpoints automáticos + `/undo`/`/redo`/`/checkpoint` — `CheckpointStore` puro em Node (backed em `.codingpro/checkpoints/`), pilhas desfazer/refazer sobre *snapshots* de arquivo; write/edit capturam o estado pré-escrita, cada turno com escrita vira um passo desfazível; `/undo [N]`, `/redo [N]`, `/checkpoint` (linha do tempo); nunca toca no git do usuário (uniforme p/ pastas com ou sem git) — 2026-07-22
- [x] Diff view na aprovação — `diffLinhas` (LCS puro) + `formatarDiff` (estilo unificado enxuto, contexto colapsado em `⋯`, truncado por `maxLinhas`); `resolverPreviaDeEscrita` calcula o antes/depois de `write_file`/`edit_file` (best-effort) e o aprovador mostra o diff antes do `[s/N/sempre]` — 2026-07-22
- [x] 🏁 Refatoração multi-arquivo + undo < 2 s — marco validado offline: 12 arquivos num passo, `undo` restaura todos em < 2 s (teste com deadline); e2e pelo chat: 3 `write_file` num turno desfeitos num único `/undo` — 2026-07-22

## F3 — Entendimento de projeto

- [x] F3.2: Indexador de símbolos (`extrairSimbolos` heurístico p/ TS/JS·Python·Java/Kotlin·Go·SQL, assinaturas não corpos, tetos) + cache incremental por `mtime`+`size` (`RepoMapCache`, JSON em `.codingpro/`) — 2026-07-22
- [x] F3.2: Repo map com ranking (referências via índice invertido + boost de foco/vizinhos) e orçamento de tokens (`construirRepoMap`); tool de leitura `repo_map` + comando `/mapa`; validado ao vivo pela CLI + 26 testes offline (473 verdes, `pnpm check` completo) — 2026-07-22
- [ ] Upgrade F3 (pós-1.0): trocar backend heurístico por web-tree-sitter e cache JSON por SQLite/FTS5 (mesmo desenho)
- [x] Detecção de projeto + `/init` gera CODINGPRO.md — `detectarProjeto` (linguagens por varredura rasa com ignore/tetos; framework/gerenciador/testes por marcadores Node/Python/Rust/Go; monorepo; scripts de package.json+Makefile); resumo no cabeçalho do chat; `/init` gera CODINGPRO.md (confirma sobrescrita) — 2026-07-22
- [ ] 🏁 Pergunta de arquitetura respondida certo em repo médio — mecanismo entregue; validação ao vivo opcional / produto

## F4 — Memória persistente

- [x] Store markdown+frontmatter + `MEMORY.md` — `MemoryStore` (global `~/.codingpro/memory` + projeto `.codingpro/memory`), 1 arquivo=1 fato, frontmatter (name/description/type/created/updated/strength), índice regenerado a cada escrita, reforço em vez de duplicar, guarda contra valores de segredo — 2026-07-22
- [x] Tool `remember` + retrieval no turno — tool pré-autorizada (`alwaysAllow`, grava só na memória), retrieval léxico (`buscarMemorias`) + índices sempre injetados no system prompt por turno (chat e headless); comandos `/lembrar`, `/memory list|forget|edit` — 2026-07-22
- [x] Consolidação mecânica: `forget`→`_archive/` (nunca deleta), `_changelog.md` auditável, reindexação; validado ao vivo pela CLI + 41 testes novos (507 no total, `pnpm check` verde) — 2026-07-22
- [ ] Upgrade F4 (pós-1.0): índice SQLite/FTS5 e consolidador com DeepSeek Flash (extração/merge/poda por similaridade) — mesmo desenho
- [~] 🏁 Correção de sessão aplicada depois: mecanismo validado ao vivo (fato persistido + índice + retrieval reinjetado em nova sessão); consolidador LLM fica pós-1.0

## F5 — Multi-agente

- [x] Tipos de agente + subagente isolado — 4 tipos de fábrica (explorer/worker/architect/reviewer) + custom de `.codingpro/agents/*.md` (frontmatter role/tools + corpo=prompt); `executarSubagente` roda contexto isolado (tools filtradas pelo tipo, system prompt próprio, efeitos negados sem aprovador) — 2026-07-23
- [x] Orquestrador paralelo + tetos — `orquestrarSubagentes` (concorrência limitada, ordem preservada); tetos de passos + timeout; tool `task` (até 8 subtarefas paralelas, relatórios consolidados) no chat e no headless — 2026-07-23
- [x] Modo planejamento — comando `/plan <objetivo>` roda o arquiteto (só leitura) e salva o plano em `.codingpro/plans/AAAA-MM-DD-slug.md` — 2026-07-23
- [ ] Upgrade F5 (pós-1.0): subprocesso stdio/JSON-RPC (hoje é in-process), teto de custo com interrupção, tarefas em background + `notify-send` + `/tasks`, aprovação/edição do plano antes de executar, isolamento por git worktree
- [~] 🏁 Revisão com 3 revisores paralelos: mecanismo entregue e testado offline (orquestrador paralelo + consolidação); validação ao vivo com DeepSeek é evidência opcional

## F6 — Extensibilidade

- [x] Cliente MCP (stdio) + config de servidores — `McpClient` JSON-RPC 2.0 por linha (initialize/tools/list/tools/call), tools expostas como `mcp__<srv>__<tool>` (efeito exec), config em `mcpServers` do settings, ligado ao chat; 3 fixes de robustez de revisão DeepSeek — 2026-07-23
- [x] Skills .md + hooks pre/post/stop — skills com sugestão + `/skills`/`/skill`; hooks de shell (veto no pre-tool) via `settings.hooks`, integrados ao `ToolGate` — 2026-07-23
- [~] 🏁 Servidor MCP de terceiros real usado numa tarefa (stdio + fake server + testes no CI; ao vivo com servidor externo é evidência opcional)

## F7 — Voz *(PÓS-1.0 — vira release 1.1)*

- [ ] Push-to-talk → whisper.cpp → caixa de entrada
- [ ] TTS Piper opcional + `voice setup` lazy
- [ ] 🏁 Tarefa por voz 100% offline

## F8 — Personalidade e acabamento

- [x] Undercover (attribution full/trailer/none) — campo `attribution` no settings vira diretriz de assinatura de commits no system prompt (chat e headless) — 2026-07-23
- [x] `/review` com achados por severidade — `/review [alvo]` revisa o diff (não commitado ou `git diff <alvo>`) via subagente reviewer — 2026-07-23
- [ ] Pet/XP/conquistas (desligável) — pós-1.0, polimento cosmético; não bloqueia a Fase 2
- [x] Camada visual Aurora (banner com gradiente, cores por evento, prompt, detecção de cor) entregue via ANSI puro (`tema.ts`) sobre o chat readline — bonito e robusto, sem o full-screen Ink — 2026-07-23
- [x] Prompt interativo TTY: autocomplete `/` (↑↓ Tab Enter Esc), spinner braille, banner animado, catálogo de comandos — `prompt-tty`/`prompt-input`/`commands`/`animacao` — 2026-07-23
- [ ] Polimento opcional pós-1.0: 4 temas selecionáveis, QA nos 6 terminais, pet/XP
- [ ] i18n pt-BR: auditoria final de toda string da UI (UI já é pt-BR; consolidação pós-1.0)
- [ ] 🏁 1h de uso real sem atrito anotado — sessão de produto humana; fora do gate de engenharia

## F9 — Release 1.0

- [x] Pacote npm global (bins codingpro+cpro) + `install.sh` (curl|sh) + smoke de instalação limpa do tarball no CI (`test:package`) — 2026-07-23
- [x] Docs de usuário (`docs/GUIA-DO-USUARIO.md`, fiel à implementação) + comando `doctor` — 2026-07-23
- [x] package.json publicável (metadata, bins, files, `private:false`); `npm publish` fica como passo manual do Álvaro — 2026-07-23
- [x] Hardening final offline (caminhos com espaço/acento, tetos em árvore grande, sem rede fail-closed, chave ausente/inválida) — suite `hardening-evals` em core+cli; `pnpm test:evals` + incluso no `pnpm check`/CI — 2026-07-23
- [x] Evals mínimos no CI (doc 10): tortura offline determinística (sem LLM ao vivo no gate padrão); live DeepSeek permanece opt-in (`smoke:deepseek`) — 2026-07-23
- [ ] 🏁 Setup < 10 min em máquina nova (validar ao vivo após `npm publish` — passo do Álvaro)
- [x] **Fase 1 / CLI 1.0 — núcleo fechado offline** (2026-07-23): F0–F6 + F8 essencial + F9 empacotamento/docs/hardening/evals. Diferido pós-1.0: F7 voz, pet/XP, upgrades tree-sitter/SQLite/subprocesso, QA visual humano, `npm publish`
