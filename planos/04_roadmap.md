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

- [ ] Completar o loop da LLM Layer: execução/aprovação de tools, retry/backoff sem duplicar efeitos e contagem de custo
- [x] F1.1: `packages/core` com `Workspace` (sandbox realpath/O_NOFOLLOW), `ToolRegistry` fail-closed e tools de leitura `read_file`/`list_dir`/`grep` (busca literal) — 2026-07-22
- [ ] Tools de efeito: `write_file`, `bash` (timeout) — F1.2
- [ ] Checkpoint mínimo antes da primeira escrita; até ele existir, toda escrita e todo bash usam `ask`
- [ ] Sistema de permissões: modos `allowlist` (padrão de produto após checkpoint) / `ask` / `auto`; prompt de aprovação na TUI
- [ ] TUI Ink: chat com streaming, render markdown, indicador de tool em execução
- [ ] Identidade visual v1 (doc 16): tokens.ts, tema Aurora escuro, trilho de timeline, spinner, statusline, banner
- [ ] i18n pt-BR (doc 15): strings canônicas, verbos de progresso, comandos com alias
- [ ] Sessões: persistir JSONL, `--continue` / `--resume`
- [ ] Compactação de contexto quando estourar orçamento de tokens
- [ ] System prompt v1 (identidade, regras de tool use, estilo de resposta conciso, diretiva de resposta em pt-BR)
- [ ] **Marco: tarefa real de 5+ passos num projeto de verdade, com aprovação de permissões**

## F2 — Edição segura (1–2 semanas)

- [ ] Tool `edit_file` com blocos search/replace (formato do doc 07) + validação de unicidade
- [ ] Checkpoint git automático antes de cada mudança (incl. repo-sombra p/ pastas sem git)
- [ ] Comando `/undo` (reverte último passo) e `/undo N`
- [ ] Recuperação de falha de match do diff (re-leitura + retry pelo modelo)
- [ ] Diff bonito na TUI antes de aprovar escrita
- [ ] **Marco: refatoração multi-arquivo + undo total em < 2 s sem sujar o staging do usuário**

## F3 — Entendimento de projeto (2 semanas)

- [ ] Indexador tree-sitter: símbolos (funções/classes/exports) por arquivo, cache em SQLite
- [ ] Repo map com ranking (estilo Aider): o que entra no contexto e quanto
- [ ] Invalidação incremental por mtime/hash
- [ ] Detecção de projeto: linguagens, framework, package manager, scripts de teste
- [ ] Arquivo de contexto do projeto (`CODINGPRO.md`) + comando `/init` que o gera
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

- [ ] Empacotar como pacote npm com bins `codingpro` + alias `cpro` (`npm i -g codingpro`) + testar instalação limpa
- [ ] Script `install.sh` estilo vertex-cli (curl | bash: instala Node se faltar, npm i -g, PATH) — os 2 canais de instalação
- [ ] Docs de usuário (README, guia de config, guia de skills/MCP)
- [ ] Hardening: caminhos com espaço, repos gigantes, sem rede, chave inválida
- [ ] Suite de evals mínima rodando no CI (doc 10)
- [ ] **Marco: instalação limpa em máquina nova → tarefa real completa em < 10 min de setup**
