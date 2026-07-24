# STATUS do projeto — 2026-07-24

Documento operacional curto. Lacunas plano × código: **[`docs/LACUNAS_FASES.md`](docs/LACUNAS_FASES.md)**.  
Estado Fase 1: [`docs/ESTADO_PROJETO.md`](docs/ESTADO_PROJETO.md).

## Fases

| Fase | Status | Próximo foco |
|------|--------|----------------|
| 1 CLI | 🟢 Engenharia v1 completa | `npm publish`, QA visual, pós-1.0 |
| 2 Windows | 🟡 W0–W2 usáveis | W3: `electron-builder`, `.exe`, CI Windows |
| 3 Plataforma | 🟢 Núcleo P0–P3 | P4: 2FA, SMTP, backup, beta |

## Plataforma (Fase 3) — o que sobe no acer

```bash
git checkout master && git pull
pnpm plataforma:deploy
```

- Site: `codingpro.cursar.space` (`packages/web`)
- API: `codingpro-api.cursar.space` (`packages/api` + admin em `/admin`)
- CLI: `codingpro login` → proxy `/v1/chat/completions` com limites

### Fixes de fluxo (mesmo dia)

- Limites também no playground (`/api/vps/agent`)
- Device flow atômico (sem tokens órfãos)
- Cookie desktop `cp_sessao`; redirect pós-login com `?voltar=`

## Playground web (resumo)

Workspace no browser (`/playground`): chat/agente, files, editor, terminal, git, memory.  
Detalhe histórico do redesign: commits do dia e arquivos em `packages/web/src/ui/paginas/`.  
Nota: `CyberBackground` pode existir no tree sem estar montado — a UI atual é o layout limpo pós-refactor.
