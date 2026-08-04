# 06 — Economia de Tokens (o plano de gastar pouco)

**Área:** `packages/core/src/compaction.ts`, `agent.ts`, `tool.ts`, `system-prompt.ts`, `packages/llm` · **Status:** 📌 planejado
**Meta ligada:** M1 — cache-hit > 70%, custo por tarefa ↓ 40%. Esta é a espinha dorsal financeira do plano: tudo nos docs 02–05 ou **economiza** tokens ou **declara** quanto custa.

---

## 1. Anatomia do custo hoje

Preço Flash (`llm/src/cost.ts:23`): entrada cache-miss US$ 0,0435/1M · entrada **cache-hit US$ 0,00036/1M (~120× mais barato)** · saída US$ 0,087/1M.

Fatos do código que definem o custo:

| Fato | Onde | Consequência |
|---|---|---|
| Histórico inteiro reenviado a cada turno | loop `agent.ts:320` | Cada turno paga o histórico de novo — cache-hit é o que torna isso viável |
| Resultado de tool entra **verbatim** | `tool.ts:76` (sem truncamento global) | Um `read_file` de 256 kB (`read-file.ts:6`) vira ~65 k tok permanentes no histórico |
| Compactação = **truncamento** | `compaction.ts` | Joga fora contexto que custou caro; o modelo reexplora e paga de novo |
| Prefixo do system prompt é estável | `system-prompt.ts` (comentário: "mudanças aqui invalidam o cache") | ✅ Correto — preservar |
| Cache-hit reportado pelo provider | `usage.cacheReadInputTokens` | Métrica já existe; falta **dirigir o design por ela** |

## 2. As 8 alavancas (ordenadas por economia esperada)

### C1 — Compactação com resumo em vez de truncamento ⭐

- Turnos descartados → resumo estruturado (1 chamada Flash `high`, ~1–2 k tok) com slots fixos: `Decisões`, `Arquivos tocados`, `Pendências`, `Fatos do projeto`.
- Posição no transcrito: `[system fixo] [resumo] [sufixo recente]` — prefixo estável → cache do sufixo se invalida a cada turno de qualquer forma; o prefixo (a parte cara) segue cacheado.
- **Economia:** sessões longas deixam de reexplorar; medir no benchmark: alvo −25–40% de tokens em sessões > 40 turnos.
- Fallback: se o resumo falhar, trunca como hoje (nunca pior que o status quo).
- Esforço: 2 dias (é o I3 do doc 05 — mesmo item, aqui na ótica custo).

### C2 — Orçamento de saída por tool (teto + head/tail) ⭐

- Teto default **8 k tok** por resultado: mantém cabeça + cauda com marcador `…(N bytes omitidos)…`.
- Aplicado **uma vez**, em `ToolRegistry.run` (`registry.ts:40`) — toda tool, atual e futura, nasce barata.
- Exceções conscientes: `edit_file`/`write_file` (resultado é curto), `remember`.
- **Economia:** um único `read_file` de arquivo grande hoje custa até ~65 k tok × todos os turnos seguintes; com teto, ~8 k. Em sessão com 5 leituras grandes: −150–250 k tok.
- Esforço: 1 dia.

### C3 — Dedup de resultados idênticos

- Se a mesma tool com o mesmo input produzir resultado idêntico na sessão (hash), a 2ª ocorrência vira referência curta: `read_file("src/x.ts") → mesmo conteúdo da leitura #3 (sem alteração)`.
- **Economia:** modelo adora reler arquivo antes de editar "por garantia" — padrão observável de 10–20% dos turnos. Esforço: 1 dia.
- Cuidado: invalidar o cache quando `edit_file`/`write_file` tocar o arquivo.

### C4 — Roteamento por papel nos subagentes

(Detalhado no doc 03, R1.) Explorer/docs em Flash `high`, reviewer em `max`. **Economia:** −30–50% no custo de orquestrações. Esforço: 1 dia.

### C5 — Auto-effort fino = menos raciocínio desperdiçado

(Detalhado no doc 04, V4.) Raciocínio é cobrado como **output** (o preço mais caro). Cortar turnos `max` desnecessários ataca o item mais caro da conta. Esforço: 1 dia.

### C6 — Catálogo de tools enxuto por contexto

- Cada tool declarada no request custa tokens de schema **em todo turno** (~2,2 k tok hoje, medido por `definitions()`).
- Propostas:
  - skills/MCP sob demanda (doc 02, P3) — catálogo base fixo e pequeno;
  - **não** adicionar tool nova sem medir o delta do catálogo (gate: catálogo ≤ 3,5 k tok);
  - alias pt/en nas tools (`tarefas`/`tasks` em `task.ts`) é redundância paga todo turno — manter só o que o modelo realmente usa (medir em logs).
- Esforço: 0,5 dia de instrumentação + decisões.

### C7 — Higiene do prefixo de cache

- Regra escrita + teste: nada volátil antes da 1ª mensagem do usuário (sem data/hora, sem cwd, sem contadores no system prompt).
- Teste unitário: o 1º turno de duas sessões consecutivas na mesma workspace deve produzir prefixo **byte-idêntico**.
- Esforço: 0,5 dia. (Hoje já é quase assim; o teste impede regressão.)

### C8 — Modo econômico (flag de sessão)

- `codingpro --economico` / toggle no desktop: força esforço `high`, desativa `web_search`/`web_extract`, aperta tetos (tool 4 k, contexto 60%), `maxParalelo` 2.
- Exposto no desktop quando consumo > X% do limite (doc 01, D5). Esforço: 1 dia.

## 3. Telemetria (sem ela nada disso se prova)

| # | Métrica | Onde |
|---|---|---|
| M-a | cache-hit % por sessão e por turno | já vem no `usage`; agregar no `/cost` e no painel web (doc 01, W3/D1) |
| M-b | tokens por resultado de tool (top 5 vilões) | log estruturado no `ToolRegistry.run` |
| M-c | tokens por fase: exploração × edição × verificação | marcação de fase no loop |
| M-d | custo por tarefa concluída (benchmark replay) | CI (doc 04, §4) |

## 4. Projeção de economia (ordem de grandeza, sessão típica de 30 turnos)

| Alavanca | Tokens economizados | Observação |
|---|---|---|
| C2 teto por tool | 100–250 k | depende de leituras grandes |
| C1 resumo | 50–150 k | só sessões longas |
| C3 dedup | 20–60 k | padrão de releitura |
| C4 roteamento | 30–50% do custo de subagentes | em orquestrações |
| C5 esforço fino | 10–30% dos output tokens | output = preço maior |
| **Soma conservadora** | **−35–45% de custo/sessão** | bate a meta M1 com folga |

## 5. Critérios de aceite

- [ ] Benchmark replay: custo mediano por tarefa −40% vs. baseline de 2026-08-04, sem queda de taxa de sucesso nos evals.
- [ ] cache-hit mediano ≥ 70% (já é a meta declarada em `auto-effort.ts:12` — agora com mecanismo e medição).
- [ ] Nenhum resultado de tool > 8 k tok sem marcador de omissão.
- [ ] Prefixo de cache byte-idêntico entre sessões (teste).
- [ ] Modo econômico reduz custo do benchmark em ≥ 25% adicional quando ligado.

## 6. Estimativa total

| Fase | Conteúdo | Esforço |
|---|---|---|
| E1 | C2 + C7 + telemetria M-b/M-c | 2 dias |
| E2 | C1 resumo + C3 dedup | 3 dias |
| E3 | C4 + C5 (junto com docs 03/04) | incluído lá |
| E4 | C6 catálogo + C8 modo econômico | 1,5 dia |
