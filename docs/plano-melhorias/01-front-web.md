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

## 6. Bugs descobertos no caso real (2026-08-05, sessão `7c5976fc`) — corrigir

**Sintoma (screenshot do usuário):** sessão com `/plan` de 20 passos; o app mostra **"Plano: 0/20 concluído"** mesmo com subagente finalizado e relatório salvo, itens do plano com **markdown cru** (`**Abrir o PowerShell**`, backticks visíveis), painel "Subagentes · 1 finalizados" com spinner parado, e o final do plano **cortado atrás da barra de input**. O run terminou com "limite de passos atingido" (`maxSteps`).

| # | Bug | Causa raiz (lido no código) | Correção proposta | Esforço |
|---|---|---|---|---|
| D7 | **PlanTracker preso em 0/N** | `salvarEIniciarPlano` emite `plan-task` **1× só com `pending`** (`main/index.ts:1120`) e nada atualiza para `running`/`done` durante a execução — o `session.planoAtivo` existe, mas não há ponte dele para a UI | Conectar `planoAtivo` ao loop: quando o agente toca um passo (via `task`/ferramentas), emitir `plan-task` com status real; ao menos marcar `running` no turno atual e `done` ao concluir/compactar | 1–2 d |
| D8 | **Markdown cru nos itens do plano** | `extrairPassosPlano` guarda o label cru (ex.: `**Abrir o PowerShell**` — `index.ts:1095`) e `PlanTracker.tsx:42` renderiza `{t.label}` sem `renderMarkdown()` | Aplicar o mesmo `renderMarkdown()` usado nos balões do chat ao `plan-tracker-label` (ou sanitizar `*`/backticks na extração) | 0,5 d |
| D9 | **"1 finalizados" + ícone de spinner parado** | `SubagentPanel.tsx:77` usa `agents.length` para o plural ("1 finalizados") e o `.subagent-orbit` só anima com `running > 0`, mas o card mostra 1 arquiteto `done` com aparência de spinner | Plural correto (`1 finalizado` / `N finalizados`) + ícone de estado condizente (✓ quando `running === 0`); CSS `subagent-orbit.running` | 0,5 d |
| D10 | **Conteúdo do feed cortado atrás do input** | O plano de 20 itens estoura o `max-height` do feed e fica encoberto pela `.floating-input-dock` (o padding-bottom do feed não conta o dock quando o PlanTracker está presente) | `padding-bottom` dinâmico no scroll container quando `planTasks.length > 0` (mesma família do root-cause 8 — overflow do dock) | 0,5 d |
| D11 | **Espaço vazio grande entre resposta e plano** | O `ToolSummaryBlock`/PlanTracker é anexado ao fim da lista de mensagens, mas o plano vem do evento `plan-task` assíncrono — o feed posiciona o tracker no rodapé fixo e o plano-texto fica no meio do histórico, criando o vão | Definir posição única (rodapé fixo, como o TaskTracker) e **não** duplicar o plano no histórico da mensagem — ou renderizar o bloco de plano dentro do balão que o gerou | 1 d |

**Nota de produto (não é bug de front):** o run terminou em "limite de passos atingido" porque o plano de 20 passos estourou `maxSteps` antes de terminar — reforça o **C9 (doc 06)**: teto de exploração por objetivo + plano alimentando a execução (o modelo não deve "reexplorar" o que o plano já decidiu).

## 7. Como validar

```bash
pnpm --filter @codingpro/web test
pnpm --filter @codingpro/web typecheck
pnpm --filter @codingpro/web build
```

API: `GET /api/consumo` agora inclui `cacheHitPercent`, `custoMedioMicro`, `tokensEntrada`, `tokensCache`.  
`PATCH /api/tokens/:id` com `{ "nome": "..." }` renomeia a máquina.
