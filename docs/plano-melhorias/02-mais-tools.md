# 02 — Mais Tools para a IA

**Área:** `packages/core/src/tools/`, `packages/core/src/tool-groups.ts` · **Status:** 📌 planejado
**Meta ligada:** M4 (13 → ~25 tools) com M1 (cada tool nova precisa **economizar** tokens, não inflar o histórico).

---

## 1. Regra de ouro para tool nova

> Uma tool só entra no núcleo se **reduzir o número de turnos** que o modelo gastaria para obter o mesmo resultado com as tools atuais. Ferramenta que só devolve texto bruto longo é pior que nenhuma ferramenta.

Hoje o resultado de toda tool entra **verbatim** no histórico (`tool.ts:76` — `sanitizeToolText` só normaliza CRLF). Antes de adicionar tools novas, aplicar o **orçamento de saída por tool** do doc 06 (T6), senão cada tool nova é uma torneira de tokens.

## 2. Inventário atual

| Grupo | Tools |
|---|---|
| Leitura | `read_file`, `list_dir`, `glob`, `grep`, `repo_map`, `code_search`, `web_search`, `web_extract` |
| Efeito | `write_file`, `edit_file`, `bash` |
| Memória | `remember` |
| Orquestração | `task` |

Lacuna evidente: a IA **edita código mas não consegue verificar** (não roda teste, não vê erro de tipo, não vê diff do git). Ela voa às cegas depois de editar — daí retrabalho e tokens queimados.

## 3. Catálogo proposto (priorizado)

### P0 — Verificação (as que mais aumentam precisão por token gasto)

| # | Tool | O que faz | Por que economiza tokens | Esforço |
|---|---|---|---|---|
| T1 | `run_tests` | Roda o teste do projeto (detecta runner via `project-detect.ts`) e devolve **só falhas resumidas** (nome do teste, arquivo:linha, trecho do erro — teto de ~2 k tok) | Hoje: `bash` solto devolve logs inteiros de suíte. Resumo estruturado corta 90% do texto e dá feedback real pós-edição | 2 dias |
| T2 | `get_diagnostics` | Erros de TypeScript/lint dos arquivos tocados (tsc `--noEmit` incremental ou biome, saída parseada: arquivo:linha:código:mensagem, top 20) | Substitui o ciclo "editar → usuário reclamar → reler arquivo". 1 chamada ≈ 500 tok vs. 3–5 turnos de caça | 2 dias |
| T3 | `git_status` / `git_diff` | Estado do working tree e diff (com teto de linhas, `--stat` por padrão) | Ancora a IA no que já mudou; evita reeditar o que já está certo | 1 dia |
| T4 | `run_command` (leitura) | Versão **somente leitura** e com saída limitada (head+tail, teto 4 k tok) de comandos allowlisted (`ls`, `git log`, `cat`, `node -v`…) | `bash` hoje é tudo-ou-nada e sem teto global; uma versão segura e barata libera uso frequente | 1 dia |

### P1 — Escrita cirúrgica e navegação

| # | Tool | O que faz | Esforço |
|---|---|---|---|
| T5 | `apply_patch` (multi-arquivo) | Um único diff unificado aplicado atomicamente a N arquivos | 2 dias — mas **avaliar custo/benefício**: `edit_file` com blocos já cobre quase tudo; prioridade menor |
| T6 | `edit_symbol` | Edita uma função/classe pelo **nome do símbolo** (usa `symbols.ts`), sem o modelo precisar citar o texto exato | 3 dias — reduz falhas de `edit_file` por string não encontrada (hoje gasta budget de correção) |
| T7 | `find_references` | Onde um símbolo é usado (grep semântico via `repo_map`/`symbols` + grep de fallback) | 1 dia |
| T8 | `read_files` (lote) | Lê N arquivos pequenos numa chamada só, com teto total | 0,5 dia — 1 tool call em vez de N |

### P2 — Mundo externo e sessão

| # | Tool | O que faz | Esforço |
|---|---|---|---|
| T9 | `http_request` | GET/POST com allowlist de domínios, teto de resposta, sem cookies | 1 dia (complementa `web_extract` para APIs JSON) |
| T10 | `todo_list` | Checklist persistente da sessão (o agente marca progresso; o desktop já tem `TaskTracker` para exibir) | 1 dia — reduz "esquecimento" em tarefas longas sem inflar o histórico |
| T11 | `checkpoint_restore` explícita | A IA mesma pode desfazer a última edição (hoje `checkpoints.ts` é só interno) | 1 dia |
| T12 | `web_search` recorte por data/fresco | Parâmetro `recency` (hoje já existe search; falta filtro temporal para fatos voláteis) | 0,5 dia |

### P3 — Pesadas (só com orçamento, nunca no caminho feliz)

| # | Tool | Observação |
|---|---|---|
| T13 | `browser_screenshot` / automação | **Não** colocar no núcleo: entra como **servidor MCP** (`mcp.ts` já existe) — custo de manutenção fora do core e opt-in por projeto |
| T14 | `db_query` | Idem: MCP por projeto |
| T15 | `notebook_run` | Idem |

> Decisão de arquitetura: tools específicas de stack (docker, banco, browser) ficam em **MCP/skills**, não no `ALL_TOOLS` — o system prompt e o catálogo enviados ao provider continuam curtos (cache-hit e custo, doc 06).

## 4. Mudanças estruturais que acompanham o catálogo

| # | Mudança | Onde | Ganho |
|---|---|---|---|
| E1 | **Teto de saída por tool** (head+tail com aviso de truncamento) aplicado em `ToolRegistry.run`, não tool por tool | `registry.ts` | Todo resultado novo já nasce barato |
| E2 | **`sideEffect: "read"` como fast-path de paralelismo**: tools de leitura podem rodar em lote (doc 04) | `tool.ts`, `agent.ts` | Velocidade sem risco |
| E3 | Tool que devolve **ID de referência** em vez de conteúdo gigante (ex.: `run_tests` → `runId`; detalhe completo recuperável por 1 chamada extra se o modelo insistir) | padrão novo em `tool.ts` | Histórico magro |
| E4 | Atualizar `SUBAGENT_TOOL_POOL` com T1–T4/T7 | `tool-groups.ts` | Subagentes verificam o próprio trabalho (doc 03) |

## 5. Critérios de aceite

- [ ] Após uma edição, a IA consegue verificar com **no máximo 2 tool calls** (`run_tests` + `get_diagnostics`) sem `bash` bruto.
- [ ] Nenhum resultado de tool excede o teto configurado (default 8 k tok) sem aviso explícito.
- [ ] Suíte de evals (`test:evals`) ganha cenário "editar com erro de tipo" → a IA corrige sozinha em ≤ 2 turnos extras.
- [ ] Catálogo enviado ao provider segue < 3,5 k tokens (medir; hoje ~2,2 k) — acima disso, tool nova precisa justificar no plano.

## 6. Estimativa

| Fase | Conteúdo | Esforço |
|---|---|---|
| P0 | T1–T4 + E1/E2 | ~6 dias |
| P1 | T5–T8 + E4 | ~5 dias |
| P2 | T9–T12 | ~3 dias |
| P3 | via MCP (documentar receita) | 1 dia (docs) |
