# 01 — Melhorias do Front (web + desktop)

**Área:** `packages/web`, `packages/admin`, `packages/desktop/src/renderer` · **Status:** 📌 planejado
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

| # | Melhoria | Arquivos tocados | Impacto | Esforço |
|---|---|---|---|---|
| W1 | **Cliente HTTP resiliente**: timeout 15 s com `AbortSignal.timeout`, 1 retry em falha de rede, mensagens de erro por código | `api.ts` | Alto (menos telas mortas) | 0,5 dia |
| W2 | **Skeletons** por cartão do painel + botão "Tentar novamente" em todos os `Aviso` de erro | `componentes.tsx`, `Painel.tsx` | Alto (percepção de velocidade) | 0,5 dia |
| W3 | **Consumo em tempo real**: polling leve (30 s) na aba ativa + exibir **cache-hit %** e custo médio por requisição (a API já registra por request — `api/src/rotas/consumo.ts`) | `Painel.tsx`, `componentes.tsx` | Alto (M1: usuário vê onde gasta) | 1 dia (depende de expor cache-hit na API) |
| W4 | **Code splitting** por página (`React.lazy`) + preload da rota provável | `App.tsx` | Médio (TTFB do painel) | 0,5 dia |
| W5 | **Confirmação inline** para ações destrutivas (desconectar máquina, excluir conta já usa `confirm` — padronizar com componente) | `Painel.tsx`, `componentes.tsx` | Médio | 0,5 dia |
| W6 | **Testes de componente** (Vitest + Testing Library) dos fluxos críticos: login, painel consumo, dispositivos | `packages/web/test/` (novo) + script no raiz | Médio (protege W1–W5) | 1 dia |
| W7 | **A11y pass**: `aria-live="polite"` nos avisos, gerenciar foco nas abas, contraste do gráfico | `componentes.tsx`, `Painel.tsx` | Médio | 0,5 dia |
| W8 | Landing: seção "como a IA economiza seus créditos" (cache-hit, subagentes baratos) — marketing do diferencial de custo | `Landing.tsx` | Baixo/Médio | 0,5 dia |

## 3. Diagnóstico do front desktop (`packages/desktop/src/renderer`)

O chat desktop já tem `SubagentPanel`, `TaskTracker`, `PlanTracker`, `DiffViewer`, `CommandPalette` — boa base. Lacunas:

| # | Melhoria | Impacto | Esforço |
|---|---|---|---|
| D1 | **Custo ao vivo no rodapé do chat**: tokens, cache-hit % e US$ da sessão (dados já existem: `AgentResult.cost`/`usage` — só renderizar) | Alto (M1/M5) | 1 dia |
| D2 | **Cartão por subagente** com modelo/esforço usado, tokens e custo individual (hoje `SubagentPanel` mostra progresso, não custo) | Alto (torna o roteamento por papel do doc 03 visível) | 1 dia |
| D3 | **Botão "expandir relatório"** do subagente: relatório completo vs. resumo que foi ao contexto (educar sobre economia) | Médio | 0,5 dia |
| D4 | **Indicador de paralelismo**: N tools rodando ao mesmo tempo (quando o doc 04 parallel-tool-exec entrar) | Médio | 0,5 dia |
| D5 | **Sugestão de modo econômico**: quando a sessão passar de X% do limite diário, banner oferecendo "modo econômico" (força esforço `high`, desativa web_search — config que a CLI já suporta por papel) | Médio (M1) | 1 dia |
| D6 | Diff viewer com **estatística de tokens economizados** por compactação ("histórico resumido: −12 k tok") | Baixo | 0,5 dia |

## 4. Critérios de aceite

- [ ] Nenhuma chamada da API fica pendente > 15 s sem feedback (W1).
- [ ] Painel mostra cache-hit % e custo/requisição atualizando sozinho (W3).
- [ ] Rodapé do chat desktop mostra custo da sessão ao final de cada turno (D1).
- [ ] Todo erro de tela tem ação de recuperação (W2).
- [ ] `pnpm --filter @codingpro/web test` verde com fluxos críticos cobertos (W6).

## 5. Fora de escopo (registrar para depois)

Roteador com URLs reais por aba (`/painel/consumo`), dark mode explícito no web, PWA/offline, i18n en/es, dashboard admin de custo por usuário (existe no admin, evoluir junto com W3).
