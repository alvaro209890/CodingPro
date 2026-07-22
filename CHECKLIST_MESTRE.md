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
- [x] Chave DeepSeek p/ desenvolvimento definida: a do Hermes deste PC (`DEEPSEEK_API_KEY` em `~/.hermes/.env`; valor nunca em docs/repo) — 2026-07-22

## Transversal — Economia de tokens & auto-effort *(doc 14)*

- [ ] Layout de contexto cache-friendly especificado (prefixo estável, volátil no fim)
- [ ] Driver DeepSeek com capability flags (`thinking` on/off + effort high/max; `budget_tokens` é ignorado pela API oficial)
- [ ] Estratégia 2 modelos (Pro código / Flash mecânico) na config
- [ ] Auto-effort v1: heurísticas + roteador Flash + escalada por falha (sem escolha do usuário)
- [ ] `/cost` com taxa de cache-hit + custo por turno/tarefa/subagente
- [ ] Loop de qualidade: sintaxe→lint→testes→review antes do "pronto" (14.5)
- [ ] Evals: cache-hit >70% em sessão típica; auto-effort ≤60% do custo de fixo-high

## Transversal — Português & Visual Aurora *(docs 15/16)*

- [ ] i18n pt-BR canônico + verbos de progresso ("Pensando…", "Escrevendo…") por evento
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
- [ ] Adicionar os demais pacotes de domínio conforme entrarem em uso (`core`, `tools`, `tui`, `knowledge`, `memory`, `voice`)
- [ ] Contratos restantes: eventos core↔UI e interface Tool
- [x] Contrato Provider v1: streaming de texto/raciocínio, finalização, uso e capabilities — 2026-07-22
- [ ] Config em camadas (global → projeto → flags)
- [ ] Spikes: Ink+streaming · DeepSeek tool calling · Ollama swap · node:sqlite FTS5 · tree-sitter WASM · whisper pt-BR · checkpoint git
- [ ] 🏁 `codingpro -p "olá"` respondendo via DeepSeek

## F1 — Loop agêntico mínimo

- [ ] LLM Layer (streaming, tools, retry, custo)
- [ ] Tools: read / write / glob / grep / bash
- [ ] Permissões: ask / allowlist / auto
- [ ] TUI chat + sessões (resume) + compactação
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
