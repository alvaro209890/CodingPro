# 03 — Mais Subagentes e Orquestração Inteligente

**Área:** `packages/core/src/agent-types.ts`, `subagent.ts`, `subagent-spawner.ts`, `tools/task.ts` · **Status:** 📌 planejado
**Meta ligada:** M4 (4 → ~10 tipos) + M1 (roteamento por papel: modelo/esforço barato onde dá) + M2 (paralelismo real).
**Pré-requisito arquitetural:** [PLANO-SUBAGENTES-SUBPROCESSO.md](../PLANO-SUBAGENTES-SUBPROCESSO.md) (isolamento por processo libera paralelismo real e background).

---

## 1. Diagnóstico

| Item | Hoje | Limitação |
|---|---|---|
| Tipos | `explorer`, `reviewer`, `architect`, `worker` (`agent-types.ts`) | Cobrem ler/revisar/planjar/trabalhar — faltam especialistas de **verificação, refatoração, testes e docs** |
| Modelo | Todos DeepSeek Flash; `role` só muda esforço (`high`/`max`) | `criarProvider(role)` existe (`subagent-spawner.ts:51`) mas **ninguém usa** — reviewer profundo e explorer raso custam o mesmo |
| Concorrência | 3 fixos (`SUBAGENTE_MAX_PARALELO`), teto 8 tarefas (`task.ts:13`) | Não adapta à tarefa; fila simples sem prioridade |
| Aninhamento | Proibido (`SUBAGENT_TOOL_POOL` sem `task`) | Certo para custo — manter |
| Relatório | Texto livre, tamanho livre | Relatório longo infla o histórico do agente principal — sem formato nem teto |
| Reuso | Nenhum | 3 explorers procurando o mesmo símbolo refazem trabalho |
| Background | Não existe | Tarefa longa bloqueia o turno principal |

## 2. Novos tipos de subagente (de fábrica)

| Tipo | Role/esforço | Tools | Missão (relatório curto e estruturado) |
|---|---|---|---|
| `explorer` ✅ (existe) | fast/`high` | leitura | Como hoje |
| `reviewer` ✅ (existe) | main/`max` | leitura | Como hoje |
| `architect` ✅ (existe) | main/`max` | leitura | Como hoje |
| `worker` ✅ (existe) | auto | leitura+efeito | Como hoje |
| 🆕 `tester` | auto | leitura + `run_tests` + `bash` | Escreve/roda testes, devolve: `{cobriu, falhas, arquivos_criados}` |
| 🆕 `verifier` | fast/`high` | `run_tests`, `get_diagnostics`, `git_diff` | **Só verifica**: depois de um worker editar, confirma build/teste/lint e devolve veredito de 10 linhas — barato por definição |
| 🆕 `refactor` | main/`max` | leitura + efeito + `run_tests` | Renomear/extrair/mover com rede de segurança (roda testes antes e depois) |
| 🆕 `docs` | fast/`high` | leitura + `write_file` | README/JSDoc/changelog — texto fluente não precisa de raciocínio `max` |
| 🆕 `security` | main/`max` | leitura | Caça segredos, injeção, deps vulneráveis; relatório por severidade (reusa formato do reviewer) |
| 🆕 `debugger` | auto | leitura + `run_tests` + `run_command` | Reproduz falha, isola causa, propõe correção mínima (não edita) |

> Tipos custom via `.codingpro/agents/*.md` já existem — os de fábrica acima são o "mínimo de série". Ganho imediato sem código novo: publicar 4–5 `.md` de exemplo no repositório (custo zero de tokens de runtime).

## 3. Roteamento por papel (a maior alavanca de custo deste doc)

| # | Mudança | Onde | Economia |
|---|---|---|---|
| R1 | **Ligar `criarProvider(role)` de verdade**: `fast` → Flash `high`; `main` → Flash `max`; deixar `auto` com o auto-effort | `subagent-spawner.ts`, `agent-types.ts` | Explorer/docs/security-scan passam a custar fração do reviewer — estimativa: −30–50% no custo de orquestrações típicas |
| R2 | **Catálogo de modelos por papel** (config `.codingpro/config`, allowlist — nunca ID arbitrário) | `llm/roles.ts` | Usuário avançado pode rebaixar `main` para `high` em projeto simples |
| R3 | Se um dia entrar DeepSeek Pro na allowlist: reservar **só** para `architect`/`reviewer` em tarefa marcada "difícil" | futuro | Pro custa ~10× o Flash; gated por flag, nunca default |

## 4. Orquestração mais inteligente

| # | Mudança | Ganho | Esforço |
|---|---|---|---|
| O1 | **Concorrência adaptativa**: `maxParalelo` = min(6, nº de tarefas de leitura); efeitos seguem ≤ 2 | Explorer em massa fica 2× mais rápido sem disputar escrita | 1 dia |
| O2 | **Formato de relatório com teto**: cada tipo declara `formatoRelatorio` (ex.: verifier → máx. 15 linhas); o spawner trunca com aviso antes de devolver ao pai | Histórico do agente principal magro (M1) | 1 dia |
| O3 | **Cache de exploração por sessão**: chave `(tipo, hash do prompt normalizado)` → reusa relatório idêntico dentro da sessão | Elimina explorers duplicados (padrão comum do modelo) | 1 dia |
| O4 | **Resumo de N relatórios**: quando `tarefas.length > 3`, o pai recebe síntese de 1 chamada `fast` + relatórios completos sob demanda | 8 relatórios não entram crus no contexto | 1 dia |
| O5 | **Tarefas em background** (`/tasks`): explorer/security longos rodam após a resposta e notificam no próximo turno | UX de velocidade (M2); depende do plano de subprocesso (Fase D dele) | 3 dias |
| O6 | **Pipeline declarativo** na tool `task`: `pipeline: [{worker} → {verifier} → {reviewer}]` — saída de um vira entrada do próximo | Padrão "edita → verifica → revisa" vira 1 chamada, com verificação embutida (M3) | 2 dias |
| O7 | Manter **proibição de aninhamento** e documentar o porquê (explosão combinatória de custo) | Proteção de custo | docs |

## 5. Front ligado a este doc

- Desktop: `SubagentPanel` ganha custo/tempo por subagente (doc 01, D2) — sem isso o usuário não confia na orquestração.
- Badge do tipo de subagente e do esforço usado (Flash·high / Flash·max) — transparência de custo.

## 6. Critérios de aceite

- [ ] `task` aceita os 6 novos tipos; relatórios respeitam teto de formato.
- [ ] Mesma orquestração de revisão (1 reviewer + 2 explorers) custa **≥ 30% menos** que hoje (medir com `estimateCost` agregado dos filhos).
- [ ] Pipeline worker → verifier falha a tarefa com relatório claro quando o teste quebra (em vez de entregar edição cega).
- [ ] Nenhum subagente consegue chamar `task` (teste de regressão).
- [ ] Eval novo: "bug escondido em módulo X" → orquestração encontra com ≤ 60 k tokens totais.

## 7. Estimativa

| Fase | Conteúdo | Esforço |
|---|---|---|
| S1 | R1 + O2 + novos tipos `tester`/`verifier` + E4 do doc 02 | 3 dias |
| S2 | O1, O3, O4 + tipos `refactor`/`docs`/`security`/`debugger` | 4 dias |
| S3 | O6 pipeline + R2 config | 3 dias |
| S4 | O5 background (após plano de subprocesso) | 3 dias |
