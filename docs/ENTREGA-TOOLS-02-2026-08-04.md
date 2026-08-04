# Entrega — Plano 02 Mais Tools (2026-08-04)

Implementação de `docs/plano-melhorias/02-mais-tools.md` (P0–P2 + E1/E4 + receita MCP P3).

## Núcleo

- **E1:** `applyOutputCeiling` / `truncateToolOutput` no registry (teto 8k tok).
- **P0:** `run_tests`, `get_diagnostics`, `git_status`, `git_diff`, `run_command`.
- **P1:** `read_files`, `find_references`, `edit_symbol`, `apply_patch`.
- **P2:** `http_request`, `todo_list`, `checkpoint_restore`, `web_search` com `recency`.
- **E4:** subagentes ganham tools de verificação; `checkpoint_restore` só no principal.
- **P3:** `docs/MCP-TOOLS-PESADAS.md`.

Catálogo: **24 tools** no `ALL_TOOLS` (antes 13).

## Testes

- `tool-output`, `git-*`, `run-command`, `mais-tools-p1`, `loaders`, `hardening-evals` (plano 02).
- `pnpm typecheck` limpo.

## Próximo

Doc **03-mais-subagentes** (roteamento por papel) e **04** (paralelismo E2).
