# 05 — Inteligência e Precisão (acertar de primeira, gastando menos)

**Área:** `packages/core/src/system-prompt.ts`, `agent.ts`, `memory*`, `repo-map*`, `vector/`, evals · **Status:** 📌 planejado
**Meta ligada:** M3 (0 tool calls inválidas, edições sem retrabalho) — e o insight econômico central: **precisão é a maior economia**. Cada erro evitado poupa turnos inteiros de re-histórico (doc 06).

---

## 1. Onde a IA erra hoje (e quanto custa cada erro)

| Falha | Custo em tokens | Causa raiz |
|---|---|---|
| Tool call inválida (schema errado) | Budget de 5 correções/turno (`agent.ts:29`); cada correção reenvia o histórico inteiro + schema | Modelo erra formato quando há muitas tools parecidas |
| `edit_file` com `old_string` que não casa | Turno perdido + releitura do arquivo | Modelo cita de memória, não do arquivo lido |
| Afirmar sem verificar | Retrabalho do usuário = nova sessão | Prompt diz "inspecione antes", mas nada **força** |
| Editar e entregar sem verificar | Bug vai para o usuário; correção custa 5–10× a verificação | Não existe `run_tests`/`get_diagnostics` (doc 02) |
| Esquecer decisão tomada há 20 turnos | Refazer exploração | Compactação por truncamento joga contexto fora (`compaction.ts`) |
| Responder fora do estilo pedido | Turnos de re-prompt do usuário | System prompt curto demais para casos de borda |

## 2. Propostas (por alavanca)

### I1 — Verificação embutida no loop ⭐

> Regra de produto: **nenhuma edição é entregue sem verificação automática quando o projeto tem como verificar.**

- Após o 1º `edit_file`/`write_file` do turno, o loop injeta (lado código, não lado modelo) um lembrete de verificação: "edição aplicada — rode `run_tests` e/ou `get_diagnostics` antes de responder".
- Se o projeto não tiver runner detectável (`project-detect.ts`), o lembrete não aparece (não gasta tokens à toa).
- Opcional (flag): **verificação automática** — o próprio runtime roda `get_diagnostics` pós-edição e anexa o resumo; o modelo decide se precisa corrigir. Custo: ~500 tok por edição; economia: evita entrega de código quebrado (5–10× mais caro).
- Esforço: 1–2 dias (depende das tools T1/T2 do doc 02).

### I2 — Grounding obrigatório antes de editar

- `edit_file` exige que o arquivo tenha sido lido **nesta sessão** (o runtime sabe — `read_file` registra). Se não foi, devolve erro "leia o arquivo antes de editar" em vez de aplicar às cegas.
- Custo: zero (é uma checagem de estado, não de LLM). Elimina a classe inteira de "old_string alucinada".
- Esforço: 0,5–1 dia (`edit-file.ts` + tracking de leituras no `ToolContext`).

### I3 — Compactação com resumo (a memória de longo prazo barata)

- Hoje: truncamento — os turnos antigos **somem** (`compaction.ts:38` admite: "Resumo estruturado por LLM fica para uma fase futura").
- Proposta: ao passar do orçamento, os turnos descartados viram um **resumo estruturado** (decisões, arquivos tocados, pendências) gerado por 1 chamada Flash `high` (~1–2 k tok), inserido como mensagem de sistema auxiliar estável.
- Custo por compactação: ~US$ 0,0002 (2 k tok Flash). Economia: o agente nunca mais "reexplora" o que já decidiu — em sessões longas, dezenas de milhares de tokens.
- Detalhe de cache: o resumo vai **depois** do system prompt fixo e **antes** do sufixo recente — o prefixo permanece estável (cache-hit preservado).
- Esforço: 2 dias. Detalhado no doc 06 (C1).

### I4 — Memória que trabalha sozinha

- Hoje `remember` é manual (o modelo decide lembrar). Adicionar:
  - **Recall automático**: no 1º turno da sessão, injetar as memórias relevantes do workspace (top-k por similaridade — embeddings já existem em `vector/`). Custo: ~300 tok/sessão; economia: não repetir descobertas entre sessões.
  - **Sugestão de skill**: quando o mesmo padrão de edição se repete 3× na sessão, sugerir salvar skill (o system prompt já menciona; falta o detector).
- Esforço: 2 dias.

### I5 — Repo map como âncora de precisão

- Injetar `repo_map` **resumido** (orçamento 1,5 k tok — o tool já aceita `maxTokens`) no 1º turno de tarefas que mencionam arquivos/símbolos, em vez de esperar o modelo pedir.
- Símbolo citado pelo usuário → `find_references` (doc 02, T7) antes de qualquer edição: a IA vê todos os pontos de impacto de uma vez.
- Esforço: 1 dia.

### I6 — Robustez de tool call (precisão de formato)

| # | Ação | Custo/benefício |
|---|---|---|
| I6a | **Few-shot de 1 exemplo** correto por tool complexa (`edit_file`, `task`) no system prompt | +400 tok de prefixo (cacheado — custo marginal ~0 após o 1º turno) vs. eliminar a maioria das 5 correções por sessão |
| I6b | Reparo de JSON antes de rejeitar (extrair `{...}` balanceado, corrigir aspas) — camada determinística, sem LLM | 0 tok; derruba chamadas inválidas triviais |
| I6c | Quando houver correção, reenviar **só o schema da tool errada** (já faz parcialmente — `agent.ts:357`) + mensagem curta | Já existe; medir e apertar o texto |

### I7 — Planner/critic sob demanda (não por padrão)

- Tarefas marcadas como difíceis (auto-effort `max` + > N arquivos tocados): 1 subagente `architect` gera plano → worker executa → `reviewer` critica. Hoje isso é manual via `task`; I7 é só o runtime sugerir/montar o pipeline (doc 03, O6).
- **Nunca** ligar planner/critic por padrão: dobra o custo de tarefas simples. É ferramenta de precisão para tarefa cara, não hábito.
- Esforço: 1 dia (sobre O6).

### I8 — Evals como bússola (medir inteligência, não torcida)

- Ampliar `test:evals` com um **grid de cenários de precisão**: símbolo renomeado, import faltando, teste quebrado, requisito ambíguo (deve perguntar, não adivinhar), arquivo gigante (deve ler trecho, não tudo).
- Cada cenário com orçamento de tokens: passar **e** gastar ≤ teto. Regressão de custo falha o CI igual regressão de qualidade.
- Esforço: 2 dias iniciais + manutenção contínua.

## 3. Priorização custo × ganho

| Ordem | Item | Ganho de precisão | Custo extra de tokens | Esforço |
|---|---|---|---|---|
| 1 | I2 grounding antes de editar | Altíssimo | **negativo** (evita releituras) | 0,5–1 d |
| 2 | I6b reparo de JSON | Alto | zero | 0,5 d |
| 3 | I6a few-shot no prefixo | Alto | ~0 (cacheado) | 0,5 d |
| 4 | I1 verificação embutida | Altíssimo | ~500 tok/edição (se paga) | 1–2 d |
| 5 | I3 resumo na compactação | Alto (sessões longas) | ~2 k tok/compactação (se paga com folga) | 2 d |
| 6 | I5 repo map âncora | Médio/Alto | 1,5 k tok/sessão | 1 d |
| 7 | I4 memória automática | Médio | ~300 tok/sessão | 2 d |
| 8 | I7 planner/critic sob demanda | Alto em tarefa cara | só quando invocado | 1 d |
| 9 | I8 evals | bússola | custo de CI | 2 d |

## 4. Critérios de aceite

- [ ] Eval "renomear símbolo com 5 referências" passa sem nenhuma leitura duplicada e sem tool call inválida.
- [ ] Taxa de tool calls inválidas < 0,5% dos turnos no benchmark replay (hoje: orçamento de 5 correções é usado com frequência — medir baseline primeiro).
- [ ] 100% das edições em projeto com runner são seguidas de verificação antes da resposta final.
- [ ] Sessão de 60+ turnos compactada mantém as decisões iniciais no resumo (teste de unidade da compactação).
- [ ] Nenhuma melhoria aumenta o custo mediano por tarefa > 5% (gate do benchmark).
