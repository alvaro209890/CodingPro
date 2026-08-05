# Plano de Melhorias — Front + IA CodingPro

**Data:** 2026-08-04 · **Atualizado:** 2026-08-05 (caso real `7c5976fc`) · **Área:** transversal (web, desktop, core, llm) · **Status:** 🚧 em execução (01 ✅; 02 ✅; 03–07 planejados; 04/05/06 ganharam itens do caso real 08/05)
**Objetivo:** deixar a IA **mais eficiente, inteligente, precisa e rápida**, com **mais tools e mais subagentes**, **gastando menos tokens** — e melhorar o front (web + desktop) na mesma medida.

---

## 0. Caso real 2026-08-05 — o que a sessão `7c5976fc` ensinou ⭐

No dia 05/08 o usuário perguntou ao desktop (workspace `C:\`): *"estude como funciona o segundo cerebro que os agents de ia desse pc usam"*.

**O que aconteceu:** 40 API calls (34 `bash`), ~1,86M tokens de entrada, ~5 min, e o agente **bateu no limite de exploração** (`maxSteps`) — varreu `.claude/`, `.codex/memories/`, `.gemini/antigravity/brain/` à mão, sofreu com quoting/encoding do cmd, e só no fim achou `docs/PROMPT-ZERO-CODINGPRO.md`. O Hermes (agente irmão) responde a mesma pergunta em **1 chamada** porque tem a skill `segundo-cerebro`.

**Três lições que viraram itens de plano:**

1. **Sem bússola, o agente varre o disco.** Sem skills de produto semeadas (`~/.codingpro/skills/`), todo ambiente é redescoberto do zero → **I9a/I9b, V7, C9**.
2. **Windows é hostil para `bash` ingênuo.** cmd.exe, encoding, PYTHONPATH — o agente repetiu o mesmo comando 4× com variações → **I10a/I10c**.
3. **O teto global de passos corta tarde demais.** Precisa de teto intermediário por fase → **C9**.

Detalhes, custos e aceites em cada doc (05 I9/I10, 04 V7, 06 C9). Replay do transcript: `C:\.codingpro\sessions\2026-08-05T17-12-08-296Z-7c5976fc.jsonl`.

---

## 1. Como é hoje (diagnóstico)

| Peça | Onde | Estado atual | Limitação principal |
|---|---|---|---|
| Loop agêntico | `packages/core/src/agent.ts` | Estável, com retry e auto-correção de tool call | Tool calls de um mesmo turno executam **em sequência** (`agent.ts:415`) |
| Tools | `packages/core/src/tool-groups.ts` | 13 tools (leitura, efeito, memória, `task`) | Sem tools de teste/lint/git/diagnóstico; resultado de tool entra **verbatim** no histórico (`tool.ts:76` só normaliza CRLF) |
| Subagentes | `packages/core/src/subagent.ts`, `agent-types.ts` | 4 tipos (explorer, reviewer, architect, worker), até 8 tarefas, concorrência 3 | Todos usam o **mesmo modelo/esforço**; `criarProvider` por papel existe mas não é usado (`subagent-spawner.ts:51`); sem aninhamento nem tarefas em background |
| Modelo | `packages/llm/src/roles.ts` | Sempre DeepSeek V4 Flash; esforço `high`/`max` por heurística | Heurística de auto-effort simples (`auto-effort.ts`); sem roteamento real por papel |
| Custo | `packages/llm/src/cost.ts` | Tabela com preço de **cache-hit ~120× mais barato** que cache-miss | Compactação é **truncamento burro** (`compaction.ts:38` — resumo por LLM "fica para fase futura") |
| Front web | `packages/web/src/ui/` | SPA React: landing, conta, painel de consumo | ✅ 01 entregue: HTTP resiliente, skeletons, polling, cache-hit, testes |
| Front desktop | `packages/desktop/src/renderer/` | Chat com SubagentPanel, TaskTracker, PlanTracker, DiffViewer | ✅ 01 entregue: custo+cache no rodapé, modo econômico, paralelismo |

## 2. Metas numeradas

| # | Meta | Métrica-alvo |
|---|---|---|
| M1 | **Mais barato** | cache-hit > 70% na sessão típica; custo por tarefa concluída ↓ 40% (medido via `estimateCost`) |
| M2 | **Mais rápido** | tempo de ponta a ponta em tarefas multi-arquivo ↓ 30% (paralelismo de tools + subagentes) |
| M3 | **Mais preciso** | taxa de edições aceitas sem retrabalho ↑; 0 chamadas de tool inválidas por sessão (hoje há budget de 5 correções) |
| M4 | **Mais capaz** | de 13 → ~25 tools; de 4 → ~10 tipos de subagente; subagentes com modelo por papel |
| M5 | **Front à altura** | consumo em tempo real, skeletons, estados de erro consistentes, custo por sessão visível |

## 3. Documentos do plano

| Doc | Tema | Ganho principal | Status |
|---|---|---|---|
| [01-front-web.md](01-front-web.md) | Melhorias do front web/desktop | UX, tempo real, custo visível | ✅ concluído (D7–D11 pós-entrega 📌) |
| [02-mais-tools.md](02-mais-tools.md) | Catálogo de novas tools | Capacidade (M4) | ✅ concluído |
| [03-mais-subagentes.md](03-mais-subagentes.md) | Novos tipos + orquestração + roteamento por papel | Capacidade + custo (M4, M1) | 📌 planejado |
| [04-velocidade.md](04-velocidade.md) | Paralelismo, caches, streaming + **V7 bússola de conhecimento** | Rapidez (M2) | 📌 planejado (+caso real) |
| [05-inteligencia-e-precisao.md](05-inteligencia-e-precisao.md) | Verificação, grounding, memória + **I9 skills de produto + I10 Windows** | Precisão (M3) | 📌 planejado (+caso real) |
| [06-economia-de-tokens.md](06-economia-de-tokens.md) | Compactação com resumo, budgets, dedup + **C9 anti-varredura** | Custo (M1) | 📌 planejado (+caso real) |
| [07-roadmap.md](07-roadmap.md) | Fases, esforço × impacto, critérios de aceite | Execução | 📌 planejado (+caso real) |

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
