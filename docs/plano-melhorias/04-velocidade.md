# 04 — Velocidade (fazer mais por turno, sem gastar mais)

**Área:** `packages/core/src/agent.ts`, `gate.ts`, `registry.ts`, `subagent.ts`, vector/cache · **Status:** 📌 planejado
**Meta ligada:** M2 (−30% no tempo de ponta a ponta) — ganhar tempo **sem** aumentar tokens; idealmente reduzindo (menos turnos = menos re-envio de histórico = menos custo, doc 06).

---

## 1. Onde o tempo se perde hoje

| Gargalo | Evidência | Custo do gargalo |
|---|---|---|
| **Tool calls de um mesmo turno rodam em série** | `agent.ts:415` — `for (const call of calls) { await gate.run(...) }` | Modelo pede 3 leituras independentes → espera 3× latência de disco/rede em fila |
| Subagentes limitados a 3 e no mesmo processo | `SUBAGENTE_MAX_PARALELO = 3` | Exploração ampla fica na fila; CPU ociosa |
| Índices refeitos por sessão | `repo-map.ts`, `vector/` | `repo_map` e `code_search` reindexam no 1º uso de cada sessão |
| 1 requisição por passo, sempre com histórico inteiro | loop `agent.ts:320` | Inerente ao paradigma — mitigar com menos passos (docs 02/05), não com "mais streaming" |
| Auto-effort sobe para `max` com facilidade | `auto-effort.ts` (qualquer falha, contexto > 8 k) | Raciocínio `max` é visivelmente mais lento por turno |
| **Exploração cega sem bússola (caso real 08/05)** | Sessão `7c5976fc` (workspace `C:\`): 34 `bash` + 6 outras tools em **5 min** para achar 1 arquivo (`docs/PROMPT-ZERO-CODINGPRO.md`) | 40 calls para uma pergunta que 1 skill resolveria; cada call reenvia histórico inteiro (doc 06) |

## 2. Propostas

### V1 — Execução paralela de tool calls de leitura ⭐ (maior ganho)

- No `runAgent`, partir o lote de tool calls do turno em dois grupos:
  - `sideEffect: "read"` → `Promise.all` (todas de uma vez);
  - efeitos → seguem sequenciais **na ordem** (semântica atual preservada).
- Falha de uma leitura não cancela as irmãs (cada uma vira seu próprio `tool` result de erro — o registry já isola exceções, `registry.ts:53`).
- **Arquivos:** `agent.ts`, `gate.ts` (expor `sideEffect` por tool), testes em `core/test/agent.test.ts`.
- **Ganho esperado:** turnos de exploração (3–5 leituras) passam de ~3–5× latência para ~1×. Em sessões reais, −20–30% de tempo total.
- **Bônus de custo:** menos wall-time por turno não muda tokens, mas menos turnos de "espera" reduzem a tentação do modelo de refazer leituras (menos duplicatas → doc 06).
- Esforço: **1–2 dias**. Risco: baixo (ordem dos resultados no histórico deve seguir a ordem das chamadas, não a de conclusão).

### V2 — Subagentes com paralelismo real

- Curto prazo: concorrência adaptativa (doc 03, O1) — só config/lógica de fila.
- Médio prazo: **subprocesso** (plano dedicado já existe) — CPU de sobra vira throughput; `Promise.all` de verdade entre processos.
- Esforço: O1 = 1 dia; subprocesso = 5–6 dias (plano próprio).

### V3 — Índices quentes

| # | Item | Como | Esforço |
|---|---|---|---|
| V3a | `repo_map` com cache em disco (`.codingpro/cache/repo-map.json` + invalidação por mtime) — `repo-map-cache.ts` já existe: estender para persistir entre sessões | 1º `repo_map` da sessão passa de segundos para ms | 1 dia |
| V3b | `code_search` (vector store) com **pré-aquecimento em background** ao abrir a sessão (idle time, abortável) | 1ª busca semântica não bloqueia | 1 dia |
| V3c | Índice incremental por **git diff** (só arquivos alterados reindexados) | Reindex após edições ~0 | 1–2 dias |

### V4 — Auto-effort mais fino (velocidade = saber quando NÃO pensar)

- Hoje qualquer falha transitória sobe para `max` (`auto-effort.ts:38`). Refinar:
  - falha de **rede** não deve subir esforço (só retry — já existe em `streamTurnWithRetry`);
  - subir esforço só por falha de **qualidade** (tool call inválida, edição rejeitada);
  - contexto > 8 k com só leituras pode ficar em `high` até a 1ª edição.
- **Ganho:** menos turnos em `max` = respostas mais rápidas e mais baratas, sem perder precisão onde importa (M3). Esforço: 1 dia + evals.

### V5 — Streaming de ferramentas para a UI (percepção)

- Eventos já existem (`tool-call`, `tool-result`, `progress` de subagente). Desktop: mostrar tools de leitura **em andamento em paralelo** (doc 01, D4) — o app parece (e será) mais rápido. Esforço: 0,5 dia junto com V1.

### V6 — Menos turnos (a forma mais barata de ser rápida)

Cada turno reenvia o histórico inteiro — turno economizado é latência **e** custo economizados:
- `read_files` em lote (doc 02, T8);
- verificação com 2 calls (doc 02, P0);
- pipeline de subagentes (doc 03, O6);
- system prompt ensinando a **agrupar chamadas independentes no mesmo turno** (1 linha no `SYSTEM_PROMPT_V1` — custo zero, efeito imediato no comportamento do modelo).

### V7 — Fim da exploração cega (bússola de conhecimento antes de varrer o disco) ⭐

**Caso real (sessão `7c5976fc`, 08/05):** workspace `C:\`, pergunta sobre o Segundo Cérebro → 34 `bash` (dir/findstr/python) em sequência, cada um esperando o anterior. O agente não sabia que o vault está documentado em `docs/PROMPT-ZERO-CODINGPRO.md` nem que existe skill `segundo-cerebro` — então varreu o drive procurando. **Bússola > velocidade de execução.**

- **Semear skills de produto** (`~/.codingpro/skills/`): Segundo Cérebro, Windows-env, IMAP/DLA — o agente passa de "varrer C:\" para "ler a skill" (1 call). Conteúdo, não runtime (detalhe no doc 05 I9).
- **Catálogo de skills no system prompt** (I9b): o agente *sabe* o que existe antes de explorar. +200 tok de prefixo cacheado.
- **Regra de ouro no prompt:** "Se existe skill/docs cobrindo o assunto, LEIA primeiro — não explore o filesystem à toa."
- **Ganho:** sessões de conhecimento caem de 40 calls / 5 min para 2–4 calls / < 1 min. Esforço: 0,5–1 d (conteúdo) + 0,5 d (catálogo).

## 3. Ordem sugerida

| Ordem | Item | Por quê |
|---|---|---|
| 1 | V6 linha no system prompt + `read_files` | Quase grátis, efeito no mesmo dia |
| 2 | V7 bússola de conhecimento (skills) | Mata a exploração cega inteira (caso real) |
| 3 | V1 paralelismo de leitura | Maior ganho/dia de trabalho |
| 4 | V4 auto-effort fino | Corta tempo e custo juntos |
| 5 | V3 índices quentes | Sessões recorrentes ficam instantâneas |
| 6 | V2 subprocesso | Projeto próprio (já planejado) |

## 4. Medição (obrigatória antes/depois)

Benchmark replay: 5 tarefas-fixture (`fixtures/llm/`) cobrindo exploração, edição com teste, revisão multi-subagente. Métricas por tarefa: wall-time, nº de turnos, tokens totais, cache-hit %, custo USD. Rodar no CI a cada mudança de `agent.ts` (suite `test:evals` ampliada).

## 5. Critérios de aceite

- [ ] Turno com 4 leituras independentes executa em ~1× latência da mais lenta (não 4×).
- [ ] Benchmark replay mostra −25% de wall-time mediano sem aumento de tokens > 2%.
- [ ] Nenhuma regressão: ordem dos resultados no histórico = ordem das chamadas; efeitos nunca paralelos entre si.
- [ ] Falha de rede não altera esforço de raciocínio (teste unitário em `auto-effort`).
