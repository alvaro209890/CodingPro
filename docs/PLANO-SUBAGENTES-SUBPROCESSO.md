# Plano — Subagentes via subprocesso + JSON-RPC

**Data:** 2026-08-XX · **Área:** Fase 1 CLI (pós-1.0) · **Status:** 📌 planejado
**Objetivo:** executar cada subagente em um processo Node filho (fork) com comunicação JSON-RPC 2.0 sobre o canal IPC, mantendo o contrato `SubagenteSpawner` atual e a suite de testes verde.

---

## 1. Contexto (como é hoje)

| Peça | Onde | Observação |
|---|---|---|
| `SubagenteSpawner.executar(tipo, prompt, signal)` | `packages/core/src/subagent.ts:202` | Contrato estável; `executarSubagente` (linha 87) roda `runAgent` **no mesmo processo** |
| `criarSpawnerSubagentes` | `packages/core/src/subagent-spawner.ts:69` | Fábrica atual (in-process); usada em `chat-runtime.ts:347,386` e `agent-runtime.ts:93,116` |
| Tool `task` | `packages/core/src/tools/task.ts:91` | Lê `context.subagentes` e chama `executar`; `/review` (`chat-runtime.ts:119`) e `/plan` (`plan-runtime.ts`) também usam o spawner |
| Tipos de agente | `packages/core/src/agent-types.ts` | `architect`, `explorer`, `reviewer`, `worker` + custom `.codingpro/agents/*.md` (`role`, `tools`, `systemPrompt` — tudo serializável) |
| Pool de tools do subagente | `packages/core/src/tool-groups.ts:52` (`SUBAGENT_TOOL_POOL`) | read-only + memória + efeito; **nunca** `task` (sem aninhamento) |
| Eventos | `AgentEvent` (`agent.ts:27`) via `onEvent` | `CORE_UI_EVENT_PROTOCOL_VERSION = "1.4.0"` (`events.ts:13`) existe mas a CLI não usa |
| `child_process` | hooks, MCP, bash, biome | **Não existe `fork` em lugar nenhum** |
| Bundle CLI | `tsdown.config.ts` | `dist/index.mjs` ESM único; o core é **inlineado** (não há import runtime de `@codingpro/core`) |
| Testes atuais | `core/test/subagent.test.ts`, `task-tool.test.ts`, `cli/test/subagent-runtime.test.ts`, `plan-runtime.test.ts` | Providers fakes (`echoProvider`); replay JSONL (`fixtures/llm/ola.jsonl`); **nenhum teste com spawn real** |

## 2. Objetivo e ganhos

- **Isolamento:** crash/loop infinito do subagente não derruba o chat; timeout vira hard-kill do filho.
- **Paralelismo real:** `orquestrarSubagentes` (concorrência 3) passa a usar múltiplos núcleos.
- **Cancelamento confiável:** `AbortSignal` → notificação de cancelamento → `kill()` como rede de segurança.
- **Base para pós:** `/tasks` em background, `--agent-mode`, worktree por agente — mesma interface JSON-RPC (até em outra máquina).

## 3. Arquitetura

```
Agente pai (processo CLI)
  └─ ToolContext.subagentes → SubagenteSpawner (novo: transporte RPC)
       └─ child_process.fork(worker.mjs, [], { stdio })   ← 1 processo por subagente
            └─ loop JSON-RPC 2.0 (canal IPC do fork)
                 └─ executarSubagente()  ← mesmo código atual, agora no filho
```

Decisões de design:

| Tema | Decisão | Justificativa |
|---|---|---|
| Transporte | Canal IPC do `fork` + mensagens com envelope JSON-RPC 2.0 | Sem parsing manual de NDJSON; envelope padrão reutilizável no futuro (`--agent-mode`) |
| Ciclo de vida | 1 fork por execução; kill ao terminar | Simples; pool reutilizável fica como otimização pós (D) |
| Aprovador | **Delegado de volta ao pai** via pedido `subagent.approve` | Aprovador é closure no pai (não serializável); o filho pergunta, o pai decide |
| Provider | Recriado no filho a partir de **config serializada** no handshake (`kind: deepseek\|replay\|...`) | Replay permite testes offline com fork real; sem vazar chaves (config nunca contém chave) |
| Tipos custom | Passados no handshake (objetos serializáveis) | Filho não relê disco; pai é a única fonte da verdade |
| Memória | Fase 1: **sem memória compartilhada** no subagente subprocesso (limitação documentada) | `MemoryScope` é objeto com estado; compartilhar exige backend por arquivo — fica para D |
| Tools | Pool remontado no filho via `SUBAGENT_TOOL_POOL` (stateless) | Mesmo conjunto por construção; efeitos passam pelo aprovador delegado |
| Fallback | Env `CODINGPRO_SUBAGENT_TRANSPORT=inprocess\|subprocess` (default `subprocess` na CLI) | Rollout sem risco; testes antigos do core seguem in-process |
| Path do worker | Entry próprio no tsdown (core e CLI) | Bundle único embute o core; o cli passa `workerPath` explícito no `SpawnerOptions` |

## 4. Protocolo JSON-RPC 2.0

Mensagens trocadas no canal IPC (`process.send`), 1 objeto JSON por mensagem.

| Mensagem | Direção | Tipo | Descrição |
|---|---|---|---|
| `init` | pai → filho | pedido (`id: 0`) | `{ tipos, providerConfig, permissionMode, root }` |
| `init.result` | filho → pai | resposta | `{ ok, versao }` |
| `subagent.execute` | pai → filho | pedido | `{ tipo, prompt, maxSteps?, timeoutMs? }` |
| `subagent.event` | filho → pai | notificação | `{ event: AgentEvent }` (streaming para a UI) |
| `subagent.approve` | filho → pai | pedido | `{ tool, input }` → pai responde `{ decisao: "approve-once"\|"approve-always"\|"deny" }` |
| `subagent.cancel` | pai → filho | notificação | dispara abort interno; grace period → `kill()` |
| `subagent.result` | filho → pai | resposta | `{ relatorio: SubagenteRelatorio }` |

Códigos de erro: `-32000` interno · `-32001` tipo desconhecido · `-32002` timeout · `-32003` cancelado.
`SubagenteRelatorio` (tipo, texto, usage, cost, finishReason, passos, interrompido, motivo) já é serializável — reutilizar como está.

## 5. Etapas e arquivos

### Fase A — worker + cliente RPC no core (testes a cada passo)

- **A1** `packages/core/src/subagent-worker.ts` (novo): loop de mensagens; handshake; executa `executarSubagente`; repassa eventos; trata `subagent.approve` (pede ao pai); responde relatório; encerra.
- **A2** `packages/core/src/subagent-rpc.ts` (novo): `criarSpawnerSubagentesSubprocesso(options)` — `fork(workerPath)`, handshake, `executar()` → pedido com id, correlação de respostas, propagação de `AbortSignal` → `subagent.cancel`, hard-kill no timeout, coleta de stderr do filho. Implementa a mesma interface `SubagenteSpawner`.
- **A3** `packages/core/src/subagent-spawner.ts`: fábrica de transporte (`subprocess` com fallback `inprocess`); `SpawnerOptions.workerPath`.
- **A4** `packages/core/src/index.ts`: exports novos; `packages/core/tsdown.config.ts`: entry `subagent-worker`.

### Fase B — integração na CLI

- **B1** `packages/cli/tsdown.config.ts`: entry `subagent-worker` (bundle separado com o core inlineado) + `dist/subagent-worker.mjs` no `files` do `package.json`.
- **B2** `packages/cli/src/agent-runtime.ts` e `chat-runtime.ts`: trocar para o transporte `subprocess` (default) com `workerPath` resolvido; env para fallback.
- **B3** `packages/cli/src/subagent-runtime.ts`: re-exporta os novos símbolos.
- **B4** `scripts/smoke-subagente.mjs` (novo): e2e real — spawn de `dist/index.mjs` com `--provider replay` e fixture que faz tool call `task`.

### Fase C — robustez, observabilidade e docs

- **C1** Logs do filho com prefixo `[subagente <id>]`; `CODINGPRO_SUBAGENT_DEBUG=1` para payloads.
- **C2** stderr do filho capturado e prefixado (nunca vaza cru no terminal).
- **C3** Atualizar `docs/LACUNAS_FASES.md` (item "Subagentes via subprocesso + JSON-RPC + worktree" → 🔶/✅) e este plano ao final.

### Fase D — fora de escopo agora (documentar como pós)

`/tasks` em background · git worktree por subagente · `--agent-mode` · pool de workers reutilizável · memória compartilhada · worker remoto.

## 6. Testes

| Nível | Arquivo | Cobre |
|---|---|---|
| Unit (fork real) | `packages/core/test/subagent-worker.test.ts` (novo) | Handshake; execução com `ReplayProvider`; relatório correto; tipo desconhecido → `-32001`; cancelamento; timeout → hard-kill; evento repassado; approve delegado (filho só escreve com aprovação do pai) |
| Unit (cliente) | `packages/core/test/subagent-rpc.test.ts` (novo) | Contra um worker fake: correlação de ids, respostas fora de ordem, erro no worker → relatório `motivo:"erro"`, cancelamento propaga, kill no timeout, stderr capturado |
| CLI | `packages/cli/test/subagent-runtime.test.ts` (adaptar) | `workerPath` real com replay; aprovação delegada com aprovador fake; fallback `inprocess` via env |
| E2E | `scripts/smoke-subagente.mjs` + CI | CLI real (spawn) com fixture replay que invoca `task` → relatório no `--output-format json`; adicionar ao `pnpm check` ou workflow |
| Regressão | suite existente (gate 757+ testes) | `pnpm check` verde; testes antigos de core seguem in-process (sem mudança de contrato) |

Fixtures: `fixtures/llm/subagente-*.jsonl` (formato replay atual — 1 linha por turno com `request` exato + `events`), geradas pela mesma ferramenta do `ola.jsonl`.

## 7. Critérios de aceite

- [ ] Tool `task` roda o subagente em processo separado (processo filho visível no SO) e o relatório chega intacto ao pai.
- [ ] Cancelamento (Ctrl+C / Esc) aborta o filho; timeout aplica hard-kill após grace period.
- [ ] Aprovação de efeitos continua funcionando: filho escreve **somente** com aprovação delegada ao pai (fail-closed sem aprovador).
- [ ] Eventos de streaming do subagente aparecem no chat como hoje.
- [ ] Fallback `CODINGPRO_SUBAGENT_TRANSPORT=inprocess` funciona e é o default dos testes antigos.
- [ ] `pnpm check` verde (lint, types, cobertura, build, smoke incluindo o novo e2e).

## 8. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Path do worker no bundle único da CLI | Entry próprio na CLI (`dist/subagent-worker.mjs`) com `workerPath` explícito; teste e2e valida no build |
| Aprovador não serializável | Delegação `subagent.approve` é o design central da Fase A (testada primeiro) |
| Provider com estado/credenciais | Só config serializada no handshake; chaves continuam exclusivas do ambiente; replay cobre testes |
| Windows (desktop) | `fork` de `.mjs` ok no Node 24; validar paths e stderr no CI Windows (`desktop-windows.yml`) |
| Consumo de memória (N processos) | `maxParalelo` padrão 3 mantido; fork por execução (não pool) na fase 1 |
| Duplicação de core no bundle worker | Aceito na fase 1 (simplicidade); otimização: `external` no tsdown em fase D |

## 9. Estimativa

| Fase | Esforço |
|---|---|
| A — worker + RPC + testes | 2–3 dias |
| B — integração CLI + e2e | 2 dias |
| C — robustez + docs | 1 dia |
| **Total** | **5–6 dias** (paralelizável com W3 desktop e P4 plataforma) |
