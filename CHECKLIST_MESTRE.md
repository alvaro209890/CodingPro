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
- [ ] Auto-effort v1: heurísticas + roteador Flash + escalada por falha (sem escolha do usuário)
- [ ] `/cost` com taxa de cache-hit + custo por turno/tarefa/subagente
- [ ] Loop de qualidade: sintaxe→lint→testes→review antes do "pronto" (14.5)
- [ ] Evals: cache-hit >70% em sessão típica; auto-effort ≤60% do custo de fixo-high

## Transversal — Português & Visual Aurora *(docs 15/16)*

- [~] verbos de progresso por evento (`describeAgentEvent`: "Lendo…", "Rodando…", "Pensando…") — F1.10, 2026-07-22; falta i18n canônico completo da UI
- [ ] Raciocínio interno livre, colapsado na TUI (Ctrl+O expande o bruto)
- [ ] Comandos em português com alias inglês (/plano, /desfazer, /custo…)
- [ ] Design tokens + tema Aurora escuro + trilho de timeline + spinner gradiente
- [ ] 4 temas + detecção truecolor/256/16/NO_COLOR + fallback de glyphs
- [ ] 3 propostas de banner/logo p/ o Álvaro escolher
- [ ] Eval A/B idioma do system prompt (en+diretiva-pt vs 100% pt)
- [ ] QA visual nos 6 terminais + sessão de aprovação visual com o Álvaro

## F0 — Fundação *(doc 04)*

- [x] F0.1: workspace pnpm + pacote `packages/cli` + bins `codingpro`/`cpro` — 2026-07-22
- [x] Node 24 fixado + TypeScript strict + Biome + Vitest + cobertura — 2026-07-22
- [x] Esqueleto offline: ajuda/versão em pt-BR, build ESM e erros controlados — 2026-07-22
- [x] CI em Node 24 verde no Linux e macOS ([execução 29943155025](https://github.com/alvaro209890/CodingPro/actions/runs/29943155025)) — 2026-07-22
- [x] F0.2a: pacote `packages/llm` + contrato Provider v1 + replay sintético fail-closed — 2026-07-22
- [x] F0.2a: `codingpro -p`/`--prompt` com streaming headless offline e smoke do tarball — 2026-07-22
- [x] CI F0.2a bloqueante verde no Node 24.11/24.18 Linux e 24.18 macOS ([execução 29944958829](https://github.com/alvaro209890/CodingPro/actions/runs/29944958829)) — 2026-07-22
- [x] F0.2b: adaptador DeepSeek/AI SDK + usage de cache + erros/abort offline — 2026-07-22
- [x] F0.2b: smoke real sintético com autorização dupla e bloqueio no CI — 2026-07-22
- [x] CI F0.2b bloqueante verde no Node 24.11/24.18 Linux e 24.18 macOS ([execução 29947294481](https://github.com/alvaro209890/CodingPro/actions/runs/29947294481)) — 2026-07-22
- [x] Smoke DeepSeek real e `codingpro -p` real aprovados com prompt sintético e credencial isolada — 2026-07-22
- [ ] Adicionar os demais pacotes de domínio conforme entrarem em uso (`core`, `tools`, `tui`, `knowledge`, `memory`, `voice`)
- [ ] Contrato restante fora da F0.3: eventos core↔UI
- [x] Contrato Provider v1: streaming de texto/raciocínio, finalização, uso e capabilities — 2026-07-22
- [x] F0.2c: config JSONC global → projeto → ambiente legado → flags, fail-closed e sem segredos — 2026-07-22
- [x] CI F0.2c verde no Node 24.11/24.18 Linux e 24.18 macOS ([execução 29950272198](https://github.com/alvaro209890/CodingPro/actions/runs/29950272198)) — 2026-07-22
- [x] F0.3: contrato `Tool` puro + calls/results estruturados, sem execução automática no provider — 2026-07-22
- [x] F0.3: tool calling multi-turno no DeepSeek V4 Pro/Flash com reasoning preservado — 2026-07-22
- [x] F0.3: validação fail-closed de schema, argumentos, IDs, transcript e allowlist de modelos — 2026-07-22
- [x] F0.3: replay multi-turno, 167 testes offline e cobertura global >93% — 2026-07-22
- [x] F0.3: smoke real `modelo → somar → resultado → modelo` aprovado no Pro e Flash — 2026-07-22
- [x] CI F0.3 verde no Node 24.11/24.18 Linux e 24.18 macOS ([execução 29954449299](https://github.com/alvaro209890/CodingPro/actions/runs/29954449299)) — 2026-07-22
- [x] F0.4: roteamento interno `auto|main|fast` → Pro/Flash, fail-closed, headless em Pro — 2026-07-22
- [x] F0.4: API pura `resolveDeepSeekModelForRole` + runtime `role` e testes offline — 2026-07-22
- [ ] Spikes restantes da F0: Ink+streaming · node:sqlite FTS5 · tree-sitter WASM · checkpoint git
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
- [ ] TUI chat (Ink) ligando o loop/aprovações à interface interativa
- [ ] 🏁 Tarefa real de 5+ passos com aprovações

## F2 — Edição segura

- [ ] edit_file (search/replace atômico) + recuperação de falha
- [ ] Checkpoints git + shadow git + `/undo`
- [ ] Diff view na TUI
- [ ] 🏁 Refatoração multi-arquivo + undo < 2 s

## F3 — Entendimento de projeto

- [ ] Indexador tree-sitter + cache SQLite incremental
- [ ] Repo map com ranking e orçamento de tokens
- [ ] Detecção de projeto + `/init` gera CODINGPRO.md
- [ ] 🏁 Pergunta de arquitetura respondida certo em repo médio

## F4 — Memória persistente

- [ ] Store markdown+frontmatter + MEMORY.md + FTS5
- [ ] Tool remember + retrieval no turno
- [ ] Consolidador background (extract/merge/prune/changelog)
- [ ] 🏁 Correção de uma sessão aplicada dias depois

## F5 — Multi-agente

- [ ] Modo subagente + JSON-RPC + tipos de agente
- [ ] Orquestrador paralelo + tetos de custo
- [ ] Background tasks + notificação desktop
- [ ] Modo planejamento (architect → plano → aprovação)
- [ ] 🏁 Revisão com 3 revisores paralelos consolidada

## F6 — Extensibilidade

- [ ] Cliente MCP (stdio) + config de servidores
- [ ] Skills .md + hooks pre/post/stop
- [ ] 🏁 Servidor MCP de terceiros usado numa tarefa

## F7 — Voz *(PÓS-1.0 — vira release 1.1)*

- [ ] Push-to-talk → whisper.cpp → caixa de entrada
- [ ] TTS Piper opcional + `voice setup` lazy
- [ ] 🏁 Tarefa por voz 100% offline

## F8 — Personalidade e acabamento

- [ ] Pet/XP/conquistas (desligável)
- [ ] Undercover (attribution full/trailer/none + estilo de commit)
- [ ] `/review` com achados por severidade
- [ ] 🏁 1h de uso real sem atrito anotado

## F9 — Release 1.0

- [ ] Pacote npm global (bins codingpro+cpro) + script install.sh + instalação limpa testada
- [ ] Docs de usuário + `doctor` + hardening
- [ ] Evals no CI
- [ ] 🏁 Setup < 10 min em máquina nova
