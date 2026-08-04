# Entrega — Plano 01 Front Web/Desktop (2026-08-04)

Implementação completa de `docs/plano-melhorias/01-front-web.md` (W1–W8 + D1–D6).

## Web (`packages/web`)

- HTTP com timeout 15 s, 1 retry em falha de rede, mensagens por status.
- Skeletons, `Aviso` com “Tentar novamente”, confirmação inline e renomear dispositivo.
- Painel de consumo com polling 30 s, **cache-hit %** e custo médio/req.
- Code splitting (`React.lazy`) + preload; landing com seção de economia de créditos.
- A11y: `aria-live`, foco nas abas, contraste do gráfico.
- Testes: `pnpm --filter @codingpro/web test` (10 testes).

## API

- `GET /api/consumo` → `cacheHitPercent`, `custoMedioMicro`, `tokensEntrada`, `tokensCache`.
- `PATCH /api/tokens/:id` → `{ nome }` renomeia máquina.

## Desktop

- Rodapé: US$ + cache-hit % + turnos.
- SubagentPanel: modelo/esforço, custo no resumo, expandir relatório.
- Indicador “N ferramentas em paralelo”.
- Banner de modo econômico (esforço `fast`, sem `web_search`).
- DiffViewer: tok do patch + economia de compactação do histórico.

## Validação local

```bash
pnpm --filter @codingpro/web test
pnpm --filter @codingpro/web typecheck
pnpm --filter @codingpro/web build
```
