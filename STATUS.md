# STATUS do projeto — 2026-08-03

Documento operacional curto. Lacunas plano × código: **[`docs/LACUNAS_FASES.md`](docs/LACUNAS_FASES.md)**.  
Estado Fase 1: [`docs/ESTADO_PROJETO.md`](docs/ESTADO_PROJETO.md).

Último incremento: **[`docs/AUTENTICACAO-SOMENTE-SENHA-2026-08-03.md`](docs/AUTENTICACAO-SOMENTE-SENHA-2026-08-03.md)**
— remoção integral do segundo fator, com login e painel administrativo somente por senha e sessão.
Anterior: [`docs/RESET-APROVACAO-CREDITOS-2026-08-03.md`](docs/RESET-APROVACAO-CREDITOS-2026-08-03.md).

## Fases

| Fase | Status | Próximo foco |
|------|--------|----------------|
| 1 CLI | 🟢 Engenharia v1 completa; `glob`, JSON headless e approve-always persistente entregues | `npm publish`, QA visual, Ink/subprocessos/background/voz pós-1.0 |
| 2 Windows | 🟢 v1.1.0: renderer auditado e refinado, pt-BR, a11y de teclado, sem controles falsos | Auto-updater live e QA visual em Windows limpo |
| 3 Plataforma | 🟢 Produção no acer com aprovação + créditos, LGPD/CSP/limites/backup | Configurar SMTP/Turnstile, testar restore/load e conduzir beta |

## Plataforma (Fase 3) — o que sobe no acer

```bash
git checkout master && git pull
pnpm plataforma:deploy
```

- Site: `codingpro.cursar.space` (`packages/web`)
- API: `codingpro-api.cursar.space` (`packages/api` + admin em `/admin`)
- CLI: `codingpro login` → proxy `/v1/chat/completions` após aprovação e liberação de créditos
- P4 entregue em código: exportar/apagar conta, Termos/Privacidade, CSP, limite diário/`rate_rpm`, SMTP/Turnstile opcionais e backup systemd.
- Login e painel administrativo usam somente e-mail, senha e sessão segura; o segundo fator foi removido do produto em 2026-08-03.
- Produção validada em 2026-08-03: API/site/downloads 1.1.0 online, chamada DeepSeek real e débito
  de saldo aprovados; gate atual com 3.855 testes e integração Postgres 93/93.
- P4 ainda operacional: segredos SMTP/Turnstile, teste de carga, beta fechado e restore.

### Fixes de fluxo

- Device flow atômico (sem tokens órfãos)
- Cookie desktop `cp_sessao`; redirect pós-login com `?voltar=`
- Cadastro nasce `pendente` e com saldo zero; admin aprova e soma créditos pelo painel
- Proxy devolve 403 para conta não aprovada e 402 quando o saldo termina

## Onde o usuário trabalha

**O front de trabalho é o app desktop (Windows) e a CLI — não o navegador.**
O site (`codingpro.cursar.space`) é só conta e informação: cadastro/login, painel de
consumo e limites, autorização de dispositivo, downloads, termos e privacidade.

O **workspace no navegador foi removido** em 2026-08-03 (`/playground` + rotas
`/api/vps/*`): dava a um browser autenticado terminal, escrita de arquivo e git no
servidor, e duplicava o que o app desktop já faz melhor e local-first. Links antigos
para `/playground` caem no painel. Detalhes em
[`docs/RELATORIO-CORRECOES-2026-08-03-B.md`](docs/RELATORIO-CORRECOES-2026-08-03-B.md).
