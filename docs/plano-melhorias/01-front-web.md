# 01 — Melhorias do Front (web + desktop)

**Área:** `packages/web`, `packages/admin`, `packages/desktop/src/renderer` · **Status:** ✅ concluído (2026-08-04)
**Meta ligada:** M5 (front à altura) e M1 (custo visível muda comportamento do usuário).

---

## 1. Diagnóstico do front web (`packages/web`)

| Item | Hoje | Problema |
|---|---|---|
| Cliente HTTP | `src/ui/api.ts` — `fetch` direto, `credentials: include` | Sem **timeout**, sem **retry**, sem `AbortController`; uma rede lenta trava a tela sem feedback |
| Rotas | `src/ui/rotas.ts` próprio (`useCaminho`) | OK para o tamanho, mas sem `code splitting` — tudo carrega de uma vez |
| Estados de tela | `Carregando` genérico + `Aviso` | Sem **skeletons**; erro de uma aba não tem botão "tentar de novo" |
| Consumo | `Painel.tsx` aba "Consumo" com 3 métricas + `GraficoDiario` | Dados só no mount (sem atualização); não mostra **custo por sessão/dia em tempo real** nem cache-hit — a métrica que mais importa (doc 06) |
| Dispositivos | Tabela de tokens com "Desconectar" | Sem confirmação inline (ação destrutiva em 1 clique); sem nome amigável da máquina editável |
| Acessibilidade | Tabs com `role` corretos | Falta `aria-live` para avisos; foco não é gerenciado ao trocar de aba |
| Testes | Só `typecheck` (script raiz) | Zero testes de componente/fluxo |
| i18n | pt-BR hardcoded | Aceitável; não priorizar |

## 2. Melhorias propostas — web

| # | Melhoria | Arquivos tocados | Impacto | Esforço | Status |
|---|---|---|---|---|---|
| W1 | **Cliente HTTP resiliente**: timeout 15 s com `AbortSignal.timeout`, 1 retry em falha de rede, mensagens de erro por código | `api.ts` | Alto | 0,5 dia | ✅ |
| W2 | **Skeletons** por cartão do painel + botão "Tentar novamente" em todos os `Aviso` de erro | `componentes.tsx`, `Painel.tsx` | Alto | 0,5 dia | ✅ |
| W3 | **Consumo em tempo real**: polling leve (30 s) na aba ativa + exibir **cache-hit %** e custo médio por requisição | `Painel.tsx`, `consumo.ts`, `repositorio.ts` | Alto | 1 dia | ✅ |
| W4 | **Code splitting** por página (`React.lazy`) + preload da rota provável | `App.tsx` | Médio | 0,5 dia | ✅ |
| W5 | **Confirmação inline** para ações destrutivas + renomear máquina (`PATCH /api/tokens/:id`) | `Painel.tsx`, `componentes.tsx`, `tokens.ts` | Médio | 0,5 dia | ✅ |
| W6 | **Testes de componente** (Vitest + Testing Library) | `packages/web/test/` + script `test` | Médio | 1 dia | ✅ |
| W7 | **A11y pass**: `aria-live`, foco nas abas, contraste do gráfico | `componentes.tsx`, `Painel.tsx`, `estilo.css` | Médio | 0,5 dia | ✅ |
| W8 | Landing: seção "como a IA economiza seus créditos" | `Landing.tsx` | Baixo/Médio | 0,5 dia | ✅ |

## 3. Diagnóstico do front desktop (`packages/desktop/src/renderer`)

| # | Melhoria | Impacto | Esforço | Status |
|---|---|---|---|---|
| D1 | **Custo ao vivo no rodapé**: US$ + **cache-hit %** + turnos | Alto | 1 dia | ✅ |
| D2 | **Cartão por subagente** com modelo/esforço, tokens e custo | Alto | 1 dia | ✅ |
| D3 | **Botão "expandir relatório"** do subagente (resumo vs completo) | Médio | 0,5 dia | ✅ |
| D4 | **Indicador de paralelismo**: N tools rodando ao mesmo tempo | Médio | 0,5 dia | ✅ |
| D5 | **Sugestão de modo econômico** (banner → força `fast`, remove `web_search`) | Médio | 1 dia | ✅ |
| D6 | Diff viewer com **estatística de tokens** do patch + economia de compactação | Baixo | 0,5 dia | ✅ |

## 4. Critérios de aceite

- [x] Nenhuma chamada da API fica pendente > 15 s sem feedback (W1).
- [x] Painel mostra cache-hit % e custo/requisição atualizando sozinho (W3).
- [x] Rodapé do chat desktop mostra custo da sessão + cache-hit % (D1).
- [x] Todo erro de tela tem ação de recuperação (W2).
- [x] `pnpm --filter @codingpro/web test` verde com fluxos críticos cobertos (W6).

## 5. Fora de escopo (registrar para depois)

Roteador com URLs reais por aba (`/painel/consumo`), dark mode explícito no web, PWA/offline, i18n en/es, dashboard admin de custo por usuário (existe no admin, evoluir junto com W3).

## 6. Como validar

```bash
pnpm --filter @codingpro/web test
pnpm --filter @codingpro/web typecheck
pnpm --filter @codingpro/web build
```

API: `GET /api/consumo` agora inclui `cacheHitPercent`, `custoMedioMicro`, `tokensEntrada`, `tokensCache`.  
`PATCH /api/tokens/:id` com `{ "nome": "..." }` renomeia a máquina.
