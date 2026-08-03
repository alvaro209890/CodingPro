# STATUS do projeto — 2026-08-03

Documento operacional curto. Lacunas plano × código: **[`docs/LACUNAS_FASES.md`](docs/LACUNAS_FASES.md)**.  
Estado Fase 1: [`docs/ESTADO_PROJETO.md`](docs/ESTADO_PROJETO.md).

Último incremento: **[`docs/RELATORIO-CORRECOES-2026-08-03-B.md`](docs/RELATORIO-CORRECOES-2026-08-03-B.md)**
— subagentes (timeout, aprovador, diagnóstico), aviso de conta cloud fora da fala da IA,
ferramentas fechadas por padrão no chat, e gate `pnpm check` reprodutível no Windows.

## Fases

| Fase | Status | Próximo foco |
|------|--------|----------------|
| 1 CLI | 🟢 Engenharia v1 completa; `glob`, JSON headless e approve-always persistente entregues | `npm publish`, QA visual, Ink/subprocessos/background/voz pós-1.0 |
| 2 Windows | 🟡 W0–W2 usáveis; preload, `electron-builder`, CI Windows e downloads avançaram | Validar `.exe`/portable em Windows limpo e auto-updater live |
| 3 Plataforma | 🟢 Núcleo P0–P3 + P4 code-complete em 2FA/LGPD/CSP/limites/backup | Configurar SMTP/Turnstile, validar chave DeepSeek prod, load test e beta |

## Plataforma (Fase 3) — o que sobe no acer

```bash
git checkout master && git pull
pnpm plataforma:deploy
```

- Site: `codingpro.cursar.space` (`packages/web`)
- API: `codingpro-api.cursar.space` (`packages/api` + admin em `/admin`)
- CLI: `codingpro login` → proxy `/v1/chat/completions` com limites
- P4 entregue em código: 2FA TOTP, exportar/apagar conta, Termos/Privacidade, CSP, limite diário/`rate_rpm`, SMTP/Turnstile opcionais e backup systemd.
- P4 ainda operacional: segredos SMTP/Turnstile, chave DeepSeek dedicada de produção, teste de carga, beta fechado e restore.

### Fixes de fluxo (mesmo dia)

- Limites também no playground (`/api/vps/agent`)
- Device flow atômico (sem tokens órfãos)
- Cookie desktop `cp_sessao`; redirect pós-login com `?voltar=`

## Playground web (resumo)

Workspace no browser (`/playground`): chat/agente, files, editor, terminal, git, memory.  
Detalhe histórico do redesign: commits do dia e arquivos em `packages/web/src/ui/paginas/`.  
Nota: `CyberBackground` pode existir no tree sem estar montado — a UI atual é o layout limpo pós-refactor.
