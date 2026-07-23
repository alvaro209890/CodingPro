# F3-04 — Roadmap da Fase 3 (Plataforma Web)

Pré-requisito: Fase 1 estável (Fase 2 pode andar em paralelo a partir do P2). **Total revisado: ~7–9 semanas** (com base na velocidade de desenvolvimento da Fase 1 e na adição do admin SPA standalone).

## P0 — Inventário e fundação de infra (1 semana) — 🟢 quase concluído em 2026-07-23

Detalhes da execução: [INVENTARIO_PC.md](INVENTARIO_PC.md) · [SETUP_P0.md](SETUP_P0.md)

- [x] `INVENTARIO_PC.md`: portas (`ss -tlnp`), serviços systemd, tunnels existentes — congelado ANTES de subir qualquer coisa
- [x] Confirmar portas 8700/8701 livres (ou realocar) — ambas livres
- [ ] Criar database `codingpro` + usuário restrito no Postgres existente (sem tocar no Atlas) — **pendente: exige superusuário, comandos prontos em [SETUP_P0.md](SETUP_P0.md) §2**
- [x] Tunnel dedicado + DNS `codingpro.cursar.space` / `codingpro-api.cursar.space` com página "em breve"
- [x] Unidades systemd com MemoryMax/CPUWeight + usuário sem sudo (**user units**, não system — ver SETUP_P0 §4)
- [x] **Marco: hello-world servido pelos 2 subdomínios sem NENHUM serviço existente reiniciado** ✅

## P1 — API + proxy LLM (2 semanas)

- [ ] Fastify + Drizzle + migrations (modelo do doc 03)
- [ ] Proxy `/v1/chat` streaming passthrough (dev com a chave do Hermes: `DEEPSEEK_API_KEY` de `~/.hermes/.env` — valor nunca em repo)
- [ ] Medição de usage (incl. cache-hit) + `usage_events`/`usage_monthly`
- [ ] Pré-checagem de limite + `402` pt-BR + avisos 80/95%
- [ ] Rate limit + concorrência por usuário
- [ ] **Marco: CLI real completando tarefa via proxy com consumo gravado certo (conferido contra o painel DeepSeek)**

## P2 — Acesso cloud na CLI + auth (1–2 semanas)

- [ ] Transporte autenticado via proxy na LLM Layer, preservando o provider DeepSeek e os modelos Pro/Flash
- [ ] `codingpro login`/`logout` (device flow) + credentials 600
- [ ] Tokens `cp_` (emissão, revogação, último uso)
- [ ] Cadastro/login no site + verificação de e-mail + aprovação manual (status pendente)
- [ ] **Marco: pessoa cria conta → aprovada → `codingpro login` → usa sem chave própria**

## P3a — Landing + cadastro (1 semana)

- [ ] Next.js scaffold + Tailwind + shadcn/ui
- [ ] Landing pt-BR: o que é, GIF/asciinema da CLI, downloads (npm + .exe Fase 2), preços/planos (placeholder)
- [ ] Página de cadastro com e-mail + senha + Turnstile
- [ ] Página de login
- [ ] Verificação de e-mail (link mágico ou código)
- [ ] Página "conta pendente de aprovação"
- [ ] **Marco: visitante acessa landing → cadastra → verifica e-mail → vê tela de aguardando aprovação**

## P3b — Dashboard do usuário (1 semana)

- [ ] Área logada no Next.js (middleware de sessão)
- [ ] Dashboard: cards (consumo US$, % do limite, dias até renovação)
- [ ] Gráfico de consumo diário (Recharts)
- [ ] Gerenciar tokens CLI: gerar (mostrar 1×), listar, revogar
- [ ] Instruções de `codingpro login` com código de device flow
- [ ] Perfil: trocar senha, ativar 2FA TOTP
- [ ] **Marco: usuário aprovado faz login → vê consumo → gera token → usa na CLI**

## P3c — Painel admin (Vite SPA standalone) (1,5–2 semanas)

### Scaffold (0,5 semana)

- [ ] Vite + React 19 + TypeScript + Tailwind + shadcn/ui init
- [ ] React Router com 5 rotas + React Query provider
- [ ] `@fastify/static` servindo `dist/` em `/admin` com fallback SPA
- [ ] Auth gate: `GET /api/admin/check` no boot → redireciona se não for admin

### Telas (1–1,5 semanas)

- [ ] **Usuários:** tabela TanStack Table (busca, sort, status badge, ações: aprovar/bloquear/editar limite/revogar tokens) + modal de edição de limite (preset dropdown + override numérico)
- [ ] **Consumo:** cards de totais + gráfico Recharts diário + top 5 usuários (React Query, refetch 60s)
- [ ] **Saúde:** cards com polling 10s (`GET /api/admin/saude`) — requisições ativas, latência p50/p95, erros 5xx, disco, memória, status do proxy
- [ ] **Auditoria:** tabela paginada com filtros (ação, ator, período)
- [ ] **Kill switch:** botão grande + modal de confirmação dupla ("digitar FECHAR") + indicador 🔵/🔴
- [ ] Tratamento de erros (401/403 → redirect login, 429 → toast)
- [ ] **Marco: Álvaro administra limites 100% pelo painel, sem SSH**

## P4 — Endurecimento e beta (1–2 semanas)

- [ ] 2FA TOTP (obrigatório admin, opcional user), Turnstile, headers de segurança (CSP, HSTS)
- [ ] Teste de carga: 10 usuários simultâneos no hardware deste PC
- [ ] Simulação de estouro de limite: usuário a 99% → requisição grande → corte no ponto certo
- [ ] Backup diário pg_dump → server-desktop (Tailscale) + teste de restauração
- [ ] Chave DeepSeek de produção dedicada com teto no painel DeepSeek
- [ ] Termos + privacidade LGPD pt-BR
- [ ] Alertas proativos pro admin (e-mail ou WhatsApp via Atlas?): custo diário > X, usuário a 100%, erro 5xx em sequência
- [ ] Beta fechado: 3–5 usuários convidados, 2 semanas, custo monitorado diariamente
- [ ] **Marco: mês fechado sem incidente e custo real ≤ previsto**

## Opção de aceleração: admin mínimo viável (P3c-min)

Se o objetivo for chegar ao beta mais rápido, o admin pode ser reduzido ao essencial (1 semana):

- [ ] Tabela de usuários (aprovar/bloquear/editar limite numérico)
- [ ] Kill switch
- [ ] Consumo básico (total do mês, 1 gráfico simples)

E deixar saúde, auditoria e alertas como parte do P4 (endurecimento). Isso permite beta com 3-5 usuários enquanto o admin completo evolui em paralelo.

## Resumo das fases

| Fase | O que | Duração | Depende de |
|---|---|---|---|
| P0 | Inventário + infra | 1 sem | — |
| P1 | API + proxy LLM | 2 sem | P0 |
| P2 | Auth CLI + cadastro/login | 1–2 sem | P1 |
| P3a | Landing + cadastro público | 1 sem | P2 |
| P3b | Dashboard do usuário | 1 sem | P2 |
| P3c | Painel admin (SPA standalone) | 1,5–2 sem | P2 |
| P4 | Endurecimento + beta | 1–2 sem | P3a/P3b/P3c |
| **Total** | | **~7–9 semanas** | |

## Riscos específicos da fase

| Risco | Mitigação |
|---|---|
| Derrubar sistema existente mexendo na infra | P0 inventário + regra "só restart codingpro-*" + tunnel dedicado |
| Estouro de custo (bug ou abuso) | Limites por usuário + teto global na DeepSeek + kill switch + alertas diários |
| PC residencial fora do ar | Aceito no beta (doc 02); caminho VPS documentado se crescer |
| Vazamento da chave do servidor | Chave só em `/etc/codingpro/env`; nunca no repo; rotação documentada |
| Streaming via proxy adicionar latência | Passthrough sem buffer + medir p95; meta < 150 ms de overhead |
| Admin SPA quebrar e travar API | `@fastify/static` serve arquivos estáticos — sem impacto no runtime da API; se o bundle não carregar, só o admin some, proxy continua |
