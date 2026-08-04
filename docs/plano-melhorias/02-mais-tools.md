# 02 — Mais Tools para a IA

**Área:** `packages/core/src/tools/`, `packages/core/src/tool-groups.ts` · **Status:** ✅ concluído (2026-08-04)
**Meta ligada:** M4 (13 → ~25 tools) com M1 (cada tool nova precisa **economizar** tokens, não inflar o histórico).

---

## 1. Regra de ouro para tool nova

> Uma tool só entra no núcleo se **reduzir o número de turnos** que o modelo gastaria para obter o mesmo resultado com as tools atuais.

## 2. Inventário entregue

| Grupo | Tools |
|---|---|
| Leitura | `read_file`, `read_files`, `list_dir`, `glob`, `grep`, `find_references`, `repo_map`, `code_search`, `git_status`, `git_diff`, `get_diagnostics`, `run_command`, `web_search` (+recency), `web_extract`, `http_request` |
| Efeito | `write_file`, `edit_file`, `edit_symbol`, `apply_patch`, `bash`, `run_tests`, `todo_list`, `checkpoint_restore` |
| Memória | `remember` |
| Orquestração | `task` |

**Total no núcleo:** 24 tools (+ MCP opt-in para P3).

## 3. Catálogo — status

### P0 ✅
| # | Tool | Status |
|---|---|---|
| T1 | `run_tests` | ✅ resumo de falhas, `sideEffect: exec` |
| T2 | `get_diagnostics` | ✅ biome + tsc parseado, top 20 |
| T3 | `git_status` / `git_diff` | ✅ |
| T4 | `run_command` | ✅ allowlist + teto de saída |

### P1 ✅
| # | Tool | Status |
|---|---|---|
| T5 | `apply_patch` | ✅ unified diff multi-arquivo |
| T6 | `edit_symbol` | ✅ via `symbols.ts` |
| T7 | `find_references` | ✅ |
| T8 | `read_files` | ✅ lote com teto |

### P2 ✅
| # | Tool | Status |
|---|---|---|
| T9 | `http_request` | ✅ allowlist de hosts |
| T10 | `todo_list` | ✅ `.codingpro/session-todos.json` |
| T11 | `checkpoint_restore` | ✅ só agente principal |
| T12 | `web_search` + `recency` | ✅ |

### P3 ✅ (docs)
Receita MCP em `docs/MCP-TOOLS-PESADAS.md` — browser/db/notebook fora do núcleo.

## 4. Estrutural

| # | Mudança | Status |
|---|---|---|
| E1 | Teto de saída 8k tok em `ToolRegistry.run` (`applyOutputCeiling`) | ✅ |
| E2 | Paralelismo de leitura | 📌 fica no doc 04 |
| E3 | IDs de referência (`runId`) | 📌 parcial / futuro |
| E4 | `SUBAGENT_TOOL_POOL` + `agent-types` com T1–T4/T7 | ✅ (`checkpoint_restore` fora do pool) |

## 5. Critérios de aceite

- [x] Após edição, verificação com `run_tests` + `get_diagnostics` (sem bash bruto).
- [x] Teto 8k tok com aviso de truncamento.
- [x] Evals: cenário diagnostics + catálogo &lt; 3,5k tok + teto (`hardening-evals.test.ts`).
- [x] Catálogo &lt; 3,5k tokens (avaliado no teste).

## 6. Como validar

```bash
pnpm exec vitest run packages/core/test/tool-output.test.ts packages/core/test/mais-tools-p1.test.ts packages/core/test/hardening-evals.test.ts packages/core/test/loaders.test.ts
pnpm typecheck
```
