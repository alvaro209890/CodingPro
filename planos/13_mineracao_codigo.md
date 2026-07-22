# 13 — Mineração de Código das Referências (análise real)

**Análise feita em 2026-07-22** sobre os clones em `referencias/` (shallow):

| Repo | Commit | Licença | Veredito |
|---|---|---|---|
| `cline/cline` | `045518d` (2026-07-22) | Apache-2.0 | Arquitetura de SDK/runtime + harness de testes de provider |
| `Aider-AI/aider` | `5dc9490` (2026-05-22) | Apache-2.0 | Algoritmo do repo map + 32 gramáticas `.scm` + evidência de formatos de edição |
| `sst/opencode` | `0a601cf` (2026-07-22) | MIT | **Maior fonte de código portável** — CLI TS completa, mesma proposta que a nossa |
| `alvaro209890/Vertex` + `vertex-cli` | clonados 2026-07-22 | próprios do Álvaro | Integração DeepSeek testada em produção (proxy Anthropic-compat, effort→budget) |

> Diretiva do Álvaro: reaproveitar pesado a lógica do Claude Code e das ferramentas open source. Regra mantida: lógica do Claude Code entra por **comportamento público/documentado** (UX, permissões, subagentes, skills, hooks, plan mode — já refletidos nos docs 01–08); **código** entra só das fontes open source abaixo, com crédito em `THIRD_PARTY_NOTICES.md` e anotação de origem (repo+commit+arquivo) no cabeçalho de cada arquivo portado.

---

## 13.0 Vertex (repos do próprio Álvaro) — integração DeepSeek pronta

O Vertex é o wrapper Python + proxy FastAPI **Anthropic-compatível** que o Álvaro já roda com DeepSeek V4 — ou seja, os problemas de integração com o DeepSeek que o CodingPro vai enfrentar **já foram resolvidos uma vez, em produção**. Código próprio, reuso livre.

| Área | Arquivos reais (repo `Vertex`) | O que fazer |
|---|---|---|
| **Effort → thinking budget** | `providers/deepseek/request.py` — tabela `_DEEPSEEK_EFFORT_BUDGETS` (v4-pro: low 4096 / medium 8192 / high 16384 / max 32768; v4-flash: 2048/4096/8192/8192) | **REUSAR os números** como ponto de partida do auto-effort (doc 14.4) |
| **Quirks do DeepSeek via endpoint Anthropic** | `providers/deepseek/request.py` — strip de `reasoning_content` do body nativo, preservação de blocos thinking, schema vazio p/ tools sem params, detecção de server tools (web_search/web_fetch) | **PORTAR a lógica p/ TS** no driver DeepSeek da nossa LLM Layer |
| **Conversão SSE / streaming Anthropic** | `core/anthropic/` (~2,5k linhas: `sse.py`, `thinking.py`, `tokens.py`, `tools.py`, `conversion.py`, `stream_contracts.py`) | Referência de todos os edge cases de streaming com thinking + tool use |
| **Mapeamento de erros e rate limit** | `providers/error_mapping.py`, `providers/rate_limit.py`, `core/rate_limit.py` | Referência p/ retry/backoff e mensagens de erro claras |
| **UX de setup em pt-BR** | `cli/setup_wizard.py`, `cli/process_registry.py`, `cli/session.py` | Inspiração direta p/ nosso wizard de onboarding (doc 08.5) |
| **Instalador + auto-update** | repo `vertex-cli`: `scripts/install-vertex.sh`, checagem de GitHub Releases | Modelo p/ distribuição da F9 |

⚠️ O `vendor/vertex-cli` dentro do repo Vertex é um runtime vendorizado de terceiros — **não é fonte de mineração**; o que reusamos é o código Python do wrapper/proxy, que é do Álvaro. Conclusão estratégica que o Vertex nos dá de graça: **o endpoint `api.deepseek.com/anthropic` funciona bem em produção** e dá controle fino de thinking — por isso ele é o driver preferido no doc 14.1.

## 13.1 sst/opencode (MIT, TypeScript) — prioridade nº 1

É uma CLI local agnóstica de modelo em TS — exatamente a nossa categoria. Caminhos verificados (base: `packages/opencode/src/`):

| Área | Arquivos reais | O que fazer |
|---|---|---|
| **Edição robusta** | `tool/edit.ts` (737 linhas) | **PORTAR.** Cascata de `Replacer`s tentados em ordem: `SimpleReplacer` → `LineTrimmedReplacer` → `BlockAnchorReplacer` → `WhitespaceNormalizedReplacer` → `IndentationFlexibleReplacer` → `EscapeNormalizedReplacer` → `MultiOccurrenceReplacer` → `TrimmedBoundaryReplacer` → `ContextAwareReplacer`, com Levenshtein p/ sugestão e lock por arquivo. Resolve o desafio 11.3 inteiro |
| **Tools completas** | `tool/*.ts` + `*.txt` (read, write, glob, grep, shell/, patch `apply_patch.ts`, task, todo, plan, question, skill, webfetch) | Usar como gabarito da nossa `packages/tools`; os `.txt` são as descrições de tool p/ o LLM — ótimo material de prompt engineering testado em produção |
| **Compactação** | `session/compaction.ts` (562), `session/overflow.ts`, `session/summary.ts` | Estudar/portar a estratégia de compactação e detecção de estouro (nosso F1) |
| **Checkpoints/undo** | `snapshot/index.ts` (807) + `session/revert.ts` | Portar: snapshots git p/ undo — bate com nosso doc 07.2 |
| **Permissões** | `permission/*` + `agent/subagent-permissions.ts` | Portar avaliação de padrões de allowlist + herança de permissões em subagentes |
| **Agentes/subagentes** | `agent/agent.ts`, `tool/task.ts`, `background/` | Referência direta p/ nosso orquestrador (doc 05.3/5.4) |
| **Providers** | `provider/provider.ts`, `transform.ts`, `auth.ts` | Referência p/ capability flags e normalização entre providers |
| **Skills / MCP / worktree** | `skill/discovery.ts`, `mcp/`, `worktree/` | Referência p/ F6 e isolamento por worktree |
| **LSP (bônus não planejado)** | `lsp/` | Avaliar na F3: diagnósticos de LSP pós-edição são alternativa/complemento ao check de sintaxe tree-sitter |

⚠️ Atenção ao portar: o opencode usa Bun + Effect em partes do código — portar a **lógica**, não as dependências (nós somos Node puro).

## 13.2 cline/cline (Apache-2.0, TypeScript)

O repo virou monorepo com SDK em 2026; a estrutura antiga (`src/core/assistant-message`, `integrations/checkpoints`) não existe mais. Caminhos atuais verificados:

| Área | Arquivos reais | O que fazer |
|---|---|---|
| **Harness record/replay de LLM** | `sdk/packages/llms/src/tests/provider-vcr/` | **PORTAR/estudar.** É exatamente o provider `replay` do nosso plano de testes (doc 10.2), já resolvido |
| **Camada de providers** | `sdk/packages/llms/src/providers/{vendors,middleware,routing}/` | Referência de arquitetura p/ nossa `packages/llm` (middleware de retry/custo) |
| **Runtime de agente** | `sdk/packages/core/src/runtime/{orchestration,tools,safety,capabilities}/` | Estudar: separação orquestração × execução de tools × trilhos de segurança |
| **Checkpoints** | `sdk/packages/core/src/session/checkpoint-diff.ts` | Comparar com o snapshot do opencode; escolher a melhor mecânica |
| **Hooks & cron** | `sdk/packages/core/src/{hooks,cron}/` | Referência p/ nossos hooks (F6) |
| **Subagente** | `apps/vscode/src/core/task/tools/subagent/` | Referência p/ protocolo de subagentes |
| **Prompts de erro/recuperação** | `apps/vscode/src/core/prompts/responses.ts` (marcadores `------- SEARCH`) | Material p/ nossas mensagens de erro estruturadas ao modelo |
| **CLI própria** | `apps/cli/src/` (commands, modo interativo, testes E2E interativos) | Referência de como testar TUI interativa em E2E |
| **Ignore de arquivos** | `apps/vscode/src/core/ignore/` | Portar conceito `.clineignore` → `.codingproignore` |

Nota: o tree-sitter saiu do core novo do Cline — as queries `.scm` a usar são as do **Aider** (abaixo).

## 13.3 Aider-AI/aider (Apache-2.0, Python) — conceitos + assets

Python não é portável direto, mas os **assets e algoritmos** são:

| Área | Arquivos reais | O que fazer |
|---|---|---|
| **Gramáticas tree-sitter** | `aider/queries/tree-sitter-language-pack/*.scm` (32 linguagens, incl. typescript, python, java, kotlin?, go, sql…) | **COPIAR os `.scm` direto** p/ `packages/knowledge/queries/` (são dados, não código Python; crédito no NOTICES) |
| **Repo map** | `aider/repomap.py` (867): `get_tags` (extração), `get_ranked_tags` (grafo + PageRank via networkx), `get_ranked_tags_map` (busca binária p/ caber no orçamento de tokens), cache por mtime | **REIMPLEMENTAR em TS** seguindo o algoritmo; espec detalhada a extrair na pré-F0 |
| **Edit blocks** | `aider/coders/editblock_coder.py` (657) + `editblock_prompts.py` | Comparar estratégias de match com as do opencode; aproveitar os prompts de instrução de formato |
| **Arquiteto/editor** | `aider/coders/architect_coder.py` + `architect_prompts.py` | Base do nosso agente `architect` (doc 05.5) |
| **Lint pós-edição** | `aider/linter.py` (304) | Conceito: lint automático dos arquivos editados + devolver erros ao modelo |
| **Compactação** | `aider/history.py` (143) | Comparar com compaction do opencode |
| **Benchmark** | `benchmark/` (polyglot) | Metodologia p/ nossos evals (doc 10.4) |

## 13.4 Lógica do Claude Code (por comportamento público)

Sem código-fonte lícito disponível — replicamos por especificação o que já está distribuído nos docs 01–08:

| Conceito | Onde já está no plano |
|---|---|
| Permissões allowlist incremental ("sim e não perguntar mais") | 05.2 |
| `CLAUDE.md` → `CODINGPRO.md` + `/init` | 06.1 / 07.4 |
| Skills em Markdown + hooks pre/post/stop | doc 03 / F6 |
| Plan mode com aprovação | 05.5 |
| Subagentes nomeados com tools restritas + background tasks | 05.3 / 05.4 |
| Compactação automática + `--continue`/`--resume` | 05.1 / F1 |
| Headless `-p` + output JSON | 08.1 |
| Memória persistente com índice + consolidação | doc 06 |
| Statusline configurável, `!` p/ shell, atalhos | 08.1 |

## 13.5 Plano de porte (ordem de ataque)

- [x] Clonar os 3 repos + confirmar licenças (2026-07-22)
- [x] Mapear caminhos reais de código portável (este doc)
- [ ] Pré-F0: extrair spec do repomap (`repomap.py` → `docs/spec-repomap.md` em TS-pseudocódigo)
- [ ] Pré-F0: estudar `edit.ts` do opencode a fundo e decidir quais Replacers entram na v1 (sugestão: Simple, LineTrimmed, WhitespaceNormalized, IndentationFlexible; resto fase 2)
- [ ] Pré-F0: rodar o provider-vcr do Cline e decidir se portamos ou só imitamos o design
- [ ] F0: copiar `.scm` do Aider p/ o repo novo + `THIRD_PARTY_NOTICES.md` inicial (Aider, Cline, opencode)
- [ ] F2: portar cascata de Replacers + lock de arquivo (opencode `tool/edit.ts`)
- [ ] F2: decidir mecânica de checkpoint (opencode `snapshot/` vs Cline `checkpoint-diff.ts`) via spike comparativo
- [ ] F1: adaptar descrições de tools dos `.txt` do opencode p/ nossos schemas
- [ ] Contínuo: todo arquivo portado leva cabeçalho `// Portado de <repo>@<commit>:<caminho> (licença X)`
