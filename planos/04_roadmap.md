# 04 — Roadmap de Desenvolvimento

Estimativas assumem ~1 dev com assistência pesada de IA, dedicação parcial. Fases são sequenciais no núcleo (F0→F2), depois parcialmente paralelizáveis.

## Visão geral

| Fase | Nome | Entrega principal | Estimativa |
|---|---|---|---|
| F0 | Fundação | Repo, contratos, config, esqueleto CLI | 1 semana |
| F1 | Loop agêntico mínimo | Chat + tools básicas + permissões (MVP usável) | 2 semanas |
| F2 | Edição segura | Diff edits + checkpoints git + undo | 1–2 semanas |
| F3 | Entendimento de projeto | Repo map tree-sitter + busca | 2 semanas |
| F4 | Memória persistente | Memória local + consolidação background | 2 semanas |
| F5 | Multi-agente | Subagentes, background tasks, modo planejamento | 2–3 semanas |
| F6 | Extensibilidade | MCP + skills + hooks | 2 semanas |
| F7 | Voz | STT/TTS local — **PÓS-1.0 (decisão 2026-07-22): vira release 1.1** | (1–2 semanas, fora da v1) |
| F8 | Personalidade | Gamificação/pet, undercover, modo revisão | 1–2 semanas |
| F9 | Release 1.0 | Empacotamento npm + install.sh, docs, hardening | 1–2 semanas |

**Total estimado até a 1.0: ~13–18 semanas** (sem a voz, que vira 1.1; MVP usável no dia-a-dia já ao fim da F2, ~4–5 semanas).

---

## F0 — Fundação (1 semana)

- [x] F0.1: criar workspace pnpm na raiz definitiva + `packages/cli` com bins `codingpro`/`cpro` — 2026-07-22
- [x] Node 24 fixado + TypeScript strict + Biome + Vitest/cobertura configurados — 2026-07-22
- [x] Ajuda/versão em pt-BR + build ESM + CI Linux/macOS — 2026-07-22
- [x] F0.2a: adicionar `packages/llm`, contrato Provider v1 e replay sintético fail-closed — 2026-07-22
- [x] F0.2a: completar `codingpro -p`/`--prompt` com streaming headless offline — 2026-07-22
- [x] F0.2b: adaptador `deepseek-v4-pro` via AI SDK, thinking/effort, usage/cache e abort — 2026-07-22
- [x] F0.2b: testes SSE sem rede + bundle autossuficiente + smoke real opt-in protegido — 2026-07-22
- [x] Executar smoke real DeepSeek e fluxo completo `codingpro -p` com prompt sintético — 2026-07-22
- [ ] Adicionar os demais pacotes quando tiverem responsabilidade real (`core|tui|tools|knowledge|memory|voice`)
- [ ] Especificar o contrato restante de eventos core↔UI — ver doc 02
- [x] F0.2c: config JSONC `~/.codingpro/settings.json` → `.codingpro/settings.json` → ambiente legado → flags — 2026-07-22
- [x] F0.3: tool calling multi-turno no DeepSeek V4 Pro/Flash, reasoning preservado e contrato Tool — 2026-07-22
- [x] F0.4: roteamento interno Pro/Flash por papel (`auto|main|fast`), sem seleção de provider/ID pelo usuário — 2026-07-22
- [ ] Rodar os demais spikes do doc 03
- [x] **Marco: `codingpro -p` responde via DeepSeek real (sem tools)** — 2026-07-22

## F1 — Loop agêntico mínimo (2 semanas)

- [x] F1.3: loop da LLM Layer — `runAgent` executa/aprova tools em multi-turno (efeito só após finish limpo, sem duplicar) e agrega uso de tokens; system prompt v1 — 2026-07-22
- [x] F1.6: contagem de custo — `estimateCost`/`formatCost` (cache-hit + USD por modelo, doc 14.1) em `@codingpro/llm` — 2026-07-22
- [ ] Loop restante: retry/backoff em erro transitório do provider + ligar `/cost` ao statusline/turno
- [x] F1.1: `packages/core` com `Workspace` (sandbox realpath/O_NOFOLLOW), `ToolRegistry` fail-closed e tools de leitura `read_file`/`list_dir`/`grep` (busca literal) — 2026-07-22
- [x] F1.2: tools de efeito `write_file` (O_NOFOLLOW + pai realpath) e `bash` (env mínimo, grupo de processo, timeout/abort, saída saneada) — 2026-07-22
- [x] F1.2: até haver checkpoint (git só na F2), toda escrita e todo bash caem em `ask` — regra embutida em `decidePermission` — 2026-07-22
- [x] F1.2: permissões `allowlist`/`ask`/`auto` (`decidePermission` puro + `PermissionController` de sessão) e `ToolGate`; o prompt de aprovação na TUI liga o `Approver` na fase da TUI — 2026-07-22
- [x] F1.15/F1.16: interface interativa v1 — `codingpro --chat` (readline) com streaming, indicador de ferramenta e aprovação de efeitos; render markdown/Ink fica para o polimento visual (doc 16/F8) — 2026-07-22
- [ ] Identidade visual v1 (doc 16): tokens.ts, tema Aurora escuro, trilho de timeline, spinner, statusline, banner
- [ ] i18n pt-BR (doc 15): strings canônicas, verbos de progresso, comandos com alias
- [x] F1.4: sessões em JSONL (`SessionStore` save/append/load/list, fail-closed) + `runAgent` retoma transcrito sem duplicar system prompt — 2026-07-22
- [x] F1.13/F1.14: sessões ligadas à CLI — auto-save + `--resume <id>` + `--continuar` (última) no `codingpro --agente` — 2026-07-22
- [x] F1.5: compactação de contexto por truncamento (`compactMessages`, preserva system + pareamento tool/result) — 2026-07-22; falta ligar ao loop com orçamento real
- [ ] System prompt v1 (identidade, regras de tool use, estilo de resposta conciso, diretiva de resposta em pt-BR)
- [x] **Marco: tarefa real de 5+ passos num projeto de verdade, com aprovação de permissões** — validado ao vivo com DeepSeek em 2026-07-22 (`--chat`: 10 passos + aprovação de escrita; `--agente`: 6 passos read-only + custo/cache reais)

## F2 — Edição segura (1–2 semanas)

- [x] Tool `edit_file` com blocos search/replace (formato do doc 07) + validação de unicidade — 2026-07-22
- [x] Checkpoint automático antes de cada mudança (uniforme p/ pastas com ou sem git; `.codingpro/checkpoints/`, sem tocar no git do usuário) — 2026-07-22
- [x] Comando `/undo` (reverte último passo) e `/undo N` (+ `/redo [N]`, `/checkpoint`) — 2026-07-22
- [ ] Recuperação de falha de match do diff (re-leitura + retry pelo modelo)
- [x] Diff na aprovação de escrita (prévia antes do `[s/N/sempre]`) — 2026-07-22
- [x] **Marco: refatoração multi-arquivo + undo total em < 2 s sem sujar o staging do usuário** — validado offline (12 arquivos, undo < 2 s; e2e pelo chat) — 2026-07-22

## F3 — Entendimento de projeto (2 semanas)

- [ ] Indexador tree-sitter: símbolos (funções/classes/exports) por arquivo, cache em SQLite
- [ ] Repo map com ranking (estilo Aider): o que entra no contexto e quanto
- [ ] Invalidação incremental por mtime/hash
- [x] Detecção de projeto: linguagens, framework, package manager, scripts de teste — 2026-07-22
- [x] Arquivo de contexto do projeto (`CODINGPRO.md`) + comando `/init` que o gera — 2026-07-22
- [ ] **Marco: em repo médio (ex. Atlas), perguntar "onde X é tratado?" e receber resposta certa sem grep manual do usuário**

## F4 — Memória persistente (2 semanas)

- [ ] Formato de memória Markdown+frontmatter, índice `MEMORY.md`, tipos (user/project/feedback/reference)
- [ ] Tool `remember` + injeção de memórias relevantes no system prompt (FTS5)
- [ ] Consolidador background (pós-sessão): dedupe, merge, poda, links `[[...]]` — ver doc 06
- [ ] Comandos `/memory list|edit|forget`
- [ ] **Marco: correção dada numa sessão é aplicada automaticamente em sessão nova dias depois**

## F5 — Multi-agente (2–3 semanas)

- [ ] Modo subagente (`--agent-mode`, stdio JSON-RPC) com tools restringíveis
- [ ] Orquestrador: spawn N paralelos, coleta de relatórios, timeout/kill
- [ ] Tarefas em background com notificação desktop ao concluir
- [ ] Modo planejamento: subagente arquiteto (reasoning alto) → plano .md → aprovação → execução
- [ ] Tipos de agente configuráveis (`.codingpro/agents/*.md`: perfil `auto|main|fast`, prompt, tools)
- [ ] **Marco: "revise este diff com 3 revisores em paralelo e consolide" funcionando**

## F6 — Extensibilidade (2 semanas)

- [ ] Cliente MCP (stdio primeiro; SSE depois): descoberta e exposição de tools de servidores configurados
- [ ] Skills: `.md` com frontmatter, comando `/skill`, auto-sugestão por descrição
- [ ] Hooks: pre/post tool-use e stop, configurados no settings, com veto de ação
- [ ] **Marco: instalar um servidor MCP de terceiros (ex. Postgres) e usá-lo numa tarefa**

## F7 — Voz (1–2 semanas) — **PÓS-1.0** (decisão 2026-07-22: sai do caminho da v1 e vira o release 1.1)

- [ ] Captura de áudio push-to-talk na TUI → whisper.cpp → prompt
- [ ] TTS Piper lendo resposta final (não o streaming), interrompível
- [ ] Config de voz/modelo Whisper/dispositivo; totalmente opcional
- [ ] **Marco: pedir uma tarefa por voz e ouvir o resumo do resultado, tudo offline**

## F8 — Personalidade e acabamento (1–2 semanas)

- [ ] Gamificação: pet na statusline, XP por marcos reais (testes passando, commits), streaks; desligável
- [ ] Modo undercover: flag/config que omite trailer de IA nos commits (padrão = assinar)
- [ ] Modo revisão: `/review` analisa diff/branch e reporta achados classificados por severidade
- [ ] Polimento visual (doc 16.8): 4 temas completos, detecção de capacidades, teste nos 6 terminais, acessibilidade, QA visual com o Álvaro
- [ ] Revisão completa de pt-BR (doc 15.4): toda string da UI auditada
- [ ] **Marco: sessão de 1h de trabalho real sem nenhum atrito de UX anotado**

## F9 — Release 1.0 (1–2 semanas)

- [x] Empacotar como pacote npm com bins `codingpro` + alias `cpro` + smoke de tarball no CI — 2026-07-23
- [x] Script `install.sh` estilo vertex-cli (curl \| sh) — 2026-07-23
- [x] Docs de usuário (`docs/GUIA-DO-USUARIO.md`) + `doctor` — 2026-07-23
- [x] Hardening offline + evals mínimos no CI — 2026-07-23
- [ ] **Marco: instalação limpa em máquina nova → tarefa real completa em < 10 min de setup** (após `npm publish`, passo do Álvaro)

## F1.x — Pós-núcleo / próximo incremento (CLI já usável)

Itens que **não** bloqueiam o uso diário da Fase 1, mas fecham o ciclo de qualidade e polish:

- [ ] **Auto-correção lint/formatação** (doc 14.5.1 / 07.6): `biome check --write` nos arquivos
  tocados + re-turno do modelo se restar diagnóstico; config `quality.autoFix`; testes + guia
- [ ] Upgrades opcionais: tree-sitter/SQLite, subagente subprocesso, 4 temas, voz (F7 = 1.1)
