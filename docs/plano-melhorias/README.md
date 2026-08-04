# Plano de Melhorias — Front + IA CodingPro

**Data:** 2026-08-04 · **Área:** transversal (web, desktop, core, llm) · **Status:** 📌 planejado (somente plano, sem desenvolvimento)
**Objetivo:** deixar a IA **mais eficiente, inteligente, precisa e rápida**, com **mais tools e mais subagentes**, **gastando menos tokens** — e melhorar o front (web + desktop) na mesma medida.

---

## 1. Como é hoje (diagnóstico)

| Peça | Onde | Estado atual | Limitação principal |
|---|---|---|---|
| Loop agêntico | `packages/core/src/agent.ts` | Estável, com retry e auto-correção de tool call | Tool calls de um mesmo turno executam **em sequência** (`agent.ts:415`) |
| Tools | `packages/core/src/tool-groups.ts` | 13 tools (leitura, efeito, memória, `task`) | Sem tools de teste/lint/git/diagnóstico; resultado de tool entra **verbatim** no histórico (`tool.ts:76` só normaliza CRLF) |
| Subagentes | `packages/core/src/subagent.ts`, `agent-types.ts` | 4 tipos (explorer, reviewer, architect, worker), até 8 tarefas, concorrência 3 | Todos usam o **mesmo modelo/esforço**; `criarProvider` por papel existe mas não é usado (`subagent-spawner.ts:51`); sem aninhamento nem tarefas em background |
| Modelo | `packages/llm/src/roles.ts` | Sempre DeepSeek V4 Flash; esforço `high`/`max` por heurística | Heurística de auto-effort simples (`auto-effort.ts`); sem roteamento real por papel |
| Custo | `packages/llm/src/cost.ts` | Tabela com preço de **cache-hit ~120× mais barato** que cache-miss | Compactação é **truncamento burro** (`compaction.ts:38` — resumo por LLM "fica para fase futura") |
| Front web | `packages/web/src/ui/` | SPA React: landing, conta, painel de consumo | `api.ts` sem retry/timeout/abort; sem skeletons; sem testes; gráfico de consumo básico |
| Front desktop | `packages/desktop/src/renderer/` | Chat com SubagentPanel, TaskTracker, PlanTracker, DiffViewer | Falta feedback de custo em tempo real e exploração dos subagentes |

## 2. Metas numeradas

| # | Meta | Métrica-alvo |
|---|---|---|
| M1 | **Mais barato** | cache-hit > 70% na sessão típica; custo por tarefa concluída ↓ 40% (medido via `estimateCost`) |
| M2 | **Mais rápido** | tempo de ponta a ponta em tarefas multi-arquivo ↓ 30% (paralelismo de tools + subagentes) |
| M3 | **Mais preciso** | taxa de edições aceitas sem retrabalho ↑; 0 chamadas de tool inválidas por sessão (hoje há budget de 5 correções) |
| M4 | **Mais capaz** | de 13 → ~25 tools; de 4 → ~10 tipos de subagente; subagentes com modelo por papel |
| M5 | **Front à altura** | consumo em tempo real, skeletons, estados de erro consistentes, custo por sessão visível |

## 3. Documentos do plano

| Doc | Tema | Ganho principal |
|---|---|---|
| [01-front-web.md](01-front-web.md) | Melhorias do front web/desktop | UX, tempo real, custo visível |
| [02-mais-tools.md](02-mais-tools.md) | Catálogo de novas tools | Capacidade (M4) |
| [03-mais-subagentes.md](03-mais-subagentes.md) | Novos tipos + orquestração + roteamento por papel | Capacidade + custo (M4, M1) |
| [04-velocidade.md](04-velocidade.md) | Paralelismo, caches, streaming | Rapidez (M2) |
| [05-inteligencia-e-precisao.md](05-inteligencia-e-precisao.md) | Verificação, grounding, memória | Precisão (M3) |
| [06-economia-de-tokens.md](06-economia-de-tokens.md) | Compactação com resumo, budgets, dedup | Custo (M1) |
| [07-roadmap.md](07-roadmap.md) | Fases, esforço × impacto, critérios de aceite | Execução |

## 4. Princípios que regem todo o plano

1. **Token é orçamento, não recurso infinito.** Toda melhoria nova declara quanto custa em tokens e como se paga (ex.: resumo de compactação custa 1 chamada `fast` mas economiza N turnos de histórico).
2. **Cache-hit é a alavanca nº 1 de custo** (preço ~120× menor que cache-miss — `cost.ts`). Prefixos estáveis, nada de texto volátil no system prompt, append-only no histórico.
3. **Modelo certo no papel certo.** Flash `high` para trabalho mecânico; Flash `max` (ou Pro, se um dia entrar) só onde a precisão paga o dobro.
4. **Subagente filtra, o principal decide.** Subagentes devolvem relatórios curtos e estruturados; o contexto caro do agente principal nunca recebe lixo bruto.
5. **Medir antes de otimizar.** Toda fase começa ligando telemetria (tokens, cache-hit, tempo, passos) e termina comparando com a baseline.
6. **Nada quebra o gate.** Novas tools de efeito passam pelo `ToolGate`/permissões como hoje; subagentes seguem fail-closed sem aprovador.

## 5. Sinergia com planos existentes

- [PLANO-SUBAGENTES-SUBPROCESSO.md](../PLANO-SUBAGENTES-SUBPROCESSO.md) — subprocesso + JSON-RPC é **pré-requisito** para paralelismo real e tarefas em background (Fase D dele alimenta nosso doc 03 e 04).
- `docs/LACUNAS_FASES.md` — este plano não substitui as fases; ele as prioriza sob a ótica custo × inteligência.
