# 07 — Roadmap Consolidado

**Área:** transversal · **Status:** 🚧 em execução — **F1 ✅, F3 parcial, F4 parcial, F5 parcial** (ver §2)
**Como ler:** cada fase é independente e entrega valor sozinha. Dentro de cada fase, itens ordenados por (ganho ÷ esforço). Totais ≈ **6 semanas** de trabalho (paralelizável em 2 frentes: core/IA e front).

---

## 1. Visão de uma linha

| Fase | Tema | Duração | Entrega principal |
|---|---|---|---|
| F0 | Medição | 2–3 dias | Benchmark replay + telemetria de tokens (baseline) |
| F1 | Quick wins de custo | 1 semana | Teto por tool, reparo JSON, few-shot, grounding de edição |
| F2 | Verificação (precisão) | 1 semana | `run_tests`, `get_diagnostics`, verificação pós-edição |
| F3 | Velocidade | 1 semana | Tools de leitura em paralelo, auto-effort fino, índices quentes |
| F4 | Subagentes | 1,5 semana | Roteamento por papel, 6 tipos novos, relatórios com teto |
| F5 | Memória longa | 1 semana | Compactação com resumo, dedup, memória automática |
| F6 | Front | 1 semana (paralela) | HTTP resiliente, consumo em tempo real, custo no desktop |
| F7 | Avançado | contínuo | Subprocesso (plano próprio), background tasks, pipeline declarativo |

## 2. Detalhe por fase

### F0 — Medição (pré-requisito de tudo)

| Item | Doc | Esforço |
|---|---|---|
| Benchmark replay com 5 tarefas-fixture + métricas (wall-time, turnos, tokens, cache-hit, custo) | 04 §4 | 2 d |
| Log de tokens por resultado de tool | 06 M-b | 0,5 d |

> Sem F0, nenhuma meta (M1–M3) é verificável. Bloqueia as demais.

### F1 — Quick wins (custo e precisão imediatos) ✅ (2026-08-05)

| Item | Doc | Esforço | Ganho |
|---|---|---|---|
| C2 teto de saída por tool no registry | 06 | 1 d | −100–250 k tok/sessão ✅ (já existia) |
| C7 teste de prefixo byte-idêntico | 06 | 0,5 d | protege cache-hit ✅ `b26c351` |
| I6b reparo de JSON de tool call | 05 | 0,5 d | mata correções triviais ✅ `465666a` |
| I6a few-shot por tool complexa | 05 | 0,5 d | −tool calls inválidas 📌 |
| I2 grounding: editar só depois de ler | 05 | 1 d | mata alucinação de `old_string` ✅ (já existia) |
| Linha "agrupe chamadas independentes" no system prompt | 04 V6 | 0,1 d | −turnos ✅ (já existia) |
| **I9a semear skills de produto + I10a bloco Windows no prompt** | 05 | 0,5–1 d | **mata exploração cega (caso real 08/05: 40 calls → ~3)** ✅ `a9ed642` |

### F2 — Verificação (a IA para de entregar cego)

| Item | Doc | Esforço |
|---|---|---|
| T1 `run_tests` (resumo de falhas) | 02 | 2 d |
| T2 `get_diagnostics` | 02 | 2 d |
| I1 lembrete/verificação pós-edição | 05 | 1 d |
| T3 `git_status`/`git_diff` | 02 | 1 d |
| T4 `run_command` seguro | 02 | 1 d |

### F3 — Velocidade (parcial ✅)

| Item | Doc | Esforço |
|---|---|---|
| V1 paralelismo de leitura no loop | 04 | 1,5 d ✅ `3b11ebe` |
| V4 auto-effort fino | 04 | 1 d ✅ `e84ec01` |
| T8 `read_files` em lote | 02 | 0,5 d ✅ (já existia) |
| V3 cache de índices (repo_map persistido, pré-aquecer vector) | 04 | 2 d 📌 |
| V7 bússola de conhecimento (catálogo de skills no prompt) | 04 | 0,5 d ✅ `a9ed642` |

### F4 — Subagentes (parcial ✅)

| Item | Doc | Esforço |
|---|---|---|
| R1 ligar `criarProvider` por papel | 03 | 1 d ✅ (desktop já ligava; CLI provider único aceitável) |
| O2 formato/teto de relatório | 03 | 1 d ✅ `a9ed642` (12 k chars head+tail) |
| Tipos `tester` + `verifier` | 03 | 1 d ✅ `a9ed642` |
| O1 concorrência adaptativa | 03 | 1 d 📌 |
| O3 cache de exploração | 03 | 1 d 📌 |
| Tipos `refactor`, `docs`, `security`, `debugger` | 03 | 2 d ✅ `a9ed642` |
| O4 síntese de N relatórios | 03 | 1 d 📌 |

### F5 — Memória longa (parcial ✅)

| Item | Doc | Esforço |
|---|---|---|
| C1/I3 compactação com resumo | 06/05 | 2 d ✅ `9a8bb91` (v1 determinístico sem LLM) |
| C3 dedup de resultados | 06 | 1 d ✅ `44e8135` |
| I4 recall automático de memória | 05 | 2 d ✅ `6624f49` |
| C9 orçamento de exploração por pergunta (anti-varredura) | 06 | 1 d ✅ `a9ed642` |
| I9c eval de ecossistema (replay da sessão `7c5976fc`) | 05 | 0,5 d 📌 |
| I5 repo_map âncora + T7 `find_references` | 05/02 | 1,5 d 📌 |

### F6 — Front (paralela ao F2–F4, pessoa/fluxo separado)

| Item | Doc | Esforço |
|---|---|---|
| W1 HTTP resiliente + W2 skeletons/erros | 01 | 1 d |
| W3 consumo em tempo real + cache-hit (API + painel) | 01 | 1 d |
| D1 custo ao vivo no chat desktop | 01 | 1 d |
| D2 cartão por subagente com custo | 01 | 1 d |
| W6 testes de componente web | 01 | 1 d |
| W4/W5/W7 splitting, confirmações, a11y | 01 | 1,5 d |
| D5 modo econômico (banner + flag) | 01/06 | 1 d |
| **D7–D11 bugs do PlanTracker (caso real 08/05: 0/20, markdown cru, corte no input)** | 01 §6 | 2–3 d |

### F7 — Avançado (backlog ordenado)

1. **Subagentes via subprocesso** — plano próprio já aprovado ([PLANO-SUBAGENTES-SUBPROCESSO.md](../PLANO-SUBAGENTES-SUBPROCESSO.md), 5–6 d). Desbloqueia:
2. O5 tarefas em background (`/tasks`) — 3 d.
3. O6 pipeline declarativo worker→verifier→reviewer — 2 d.
4. T5 `apply_patch`, T6 `edit_symbol` — 5 d (avaliar se ainda valem após I2/I1).
5. R2 catálogo de modelos por papel em config; R3 Pro gated — 2 d.
6. P3 tools pesadas via MCP (receita documentada) — 1 d.

## 3. Matriz de dependências

```
F0 ──► F1 ──► F2 ──► F4 (tester/verifier precisam de run_tests/get_diagnostics)
 │      │       └────► F3 V4 (mede falhas com mais precisão)
 │      └─────────────► F5 C3 (dedup usa infra de hash do C2)
 └────► F6 (front: independente, só D2/D5 dependem de F4/C8)
Subprocesso (plano próprio) ──► O5/O6 (F7)
```

## 4. Riscos globais e mitigações

| Risco | Mitigação |
|---|---|
| Resumo de compactação perde detalhe crítico | Slots fixos + fallback para truncamento + eval de sessão longa no benchmark |
| Paralelismo de leitura muda ordem do histórico | Resultados inseridos na ordem das **chamadas**; teste de regressão dedicado |
| Mais tools → catálogo incha → custo sobe | Gate de 3,5 k tok no catálogo (06 C6) + tools pesadas só via MCP |
| Roteamento por papel rebaixa qualidade do explorer | Evals por tipo de subagente antes de ligar `high` por padrão; flag para voltar |
| Medir custo com preço estimado do Flash | Tabela centralizada em `cost.ts`; recalibrar quando sair preço oficial |
| Escopo crescer ("só mais uma tool") | Regra do doc 02 §1: toda tool nova precisa mostrar economia de turnos |
| Skills semeadas ficam desatualizadas (endereço do vault muda, etc.) | Skills apontam para fonte canônica (AGENTS.md/INDEX.md do vault); revisão trimestral; data de validade no cabeçalho |

## 5. Métricas de sucesso do plano inteiro (revisão após F5)

| Meta | Baseline (F0) | Alvo |
|---|---|---|
| Custo mediano por tarefa do benchmark | medir | **−40%** |
| cache-hit mediano | medir | **≥ 70%** |
| Wall-time mediano do benchmark | medir | **−30%** |
| Tool calls inválidas / turno | medir | **< 0,5%** |
| Tools disponíveis | 13 | **~25** (núcleo ~19 + MCP/skills) |
| Tipos de subagente | 4 | **10** |
| Cobertura de verificação pós-edição | 0% | **100%** (projetos com runner) |
