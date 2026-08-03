# F3-03 — Contas, Limites e Painel Admin

## Modelo de dados (Postgres, database `codingpro`)

```
users          id, email (único), senha_hash (argon2id), nome, status (ativo|bloqueado|pendente),
               role (user|admin), email_verificado_em, criado_em
api_tokens     id, user_id, token_hash (sha256 do cp_...), label, criado_em, ultimo_uso_em, revogado_em
limits         user_id (1:1), limite_mensal_usd, limite_diario_usd (opcional),
               rate_rpm, max_concorrencia, override_ate (limite temporário), atualizado_em
usage_events   id, user_id, ts, modelo, tokens_in, tokens_in_cache, tokens_out,
               custo_usd, duracao_ms, origem (cli|desktop), status (ok|erro|cortado)
usage_monthly  user_id + ano_mes (PK), custo_usd_acum, tokens_acum  ← contador rápido p/ pré-checagem
audit_log      id, ator_id, acao (criar_user, mudar_limite, bloquear...), alvo, detalhes_json, ts
```

- `usage_events` é **append-only** (auditável); `usage_monthly` é o contador quente que a pré-checagem lê em 1 query.
- Sem armazenar prompts/código (doc 01) — só números.

## Limites (definidos pelo Álvaro, por usuário)

- Unidade: **US$/mês** (acompanha o custo real DeepSeek; cache-hit barato beneficia o usuário) + limite diário opcional (anti-estouro num dia só).
- **Presets** editáveis: `teste` (US$ 2/mês — mínimo), `padrao` (US$ 5), `power` (US$ 20), `ilimitado` (só o Álvaro) — e **override individual** por usuário (o requisito: "cada usuário terá um limite definido por mim").
- Comportamento ao atingir: corta com `402` + mensagem clara na CLI ("Seu limite do mês acabou — renova dia 01/08. Fale com o admin p/ aumentar."); avisos automáticos em 80% e 95% (e-mail + banner na CLI via campo no response).
- Renovação: virada de mês (fuso America/Cuiabá).
- Novos cadastros: entram como `pendente` (**aprovação manual do admin no beta**) — o Álvaro controla quem entra.

---

## Stack do painel admin (Vite + React standalone)

| Camada | Escolha | Justificativa |
|---|---|---|
| Bundler | Vite 6 | Dev server instantâneo, build estático sem complexidade |
| UI Framework | React 19 | Mesmo ecossistema do Next.js; Álvaro já conhece (AquiResolve) |
| Componentes | shadcn/ui (Tailwind) | Leve, copia source, sem dependência pesada; funcional, não bonito |
| Tabelas | TanStack Table | Lista de usuários com sort/busca client-side |
| Gráficos | Recharts | Gráfico de consumo diário, cache-hit; leve e declarativo |
| Fetch | Fetch nativo + React Query (TanStack Query) | Cache de leituras, refetch em intervalo p/ consumo em tempo real |
| Auth | Sessão httpOnly do site + endpoint `/api/admin/check` | O admin valida sessão + role no boot; sem token separado |
| Build output | `dist/` estático servido pelo Fastify (`@fastify/static`) | Mesmo processo da API (porta 8700), zero sistema extra |
| Roteamento | React Router (ou TanStack Router) | SPA com 5 rotas; sem necessidade de file-based routing |

### Por que não integrado ao Next.js

Ver justificativa completa no [01_arquitetura.md](01_arquitetura.md). Em resumo: admin é single-user, não indexável, não precisa de SSR. SPA standalone = build independente, deploy independente, menos CPU/memória no PC compartilhado, iteração mais rápida.

### Diretriz de UI

> **Funcional > bonito.** Componentes shadcn/ui default, validação de formulários com `useState` (sem React Hook Form + Zod se não for necessário), sem animações, sem modo escuro dedicado (herda `prefers-color-scheme`). O admin é ferramenta de trabalho — se cumprir a função com clareza, está pronto.

---

## Telas do painel admin (`/admin`, role admin obrigatório)

### 1. Usuários (`/admin/usuarios`)

**Componentes:** TanStack Table + busca + badges de status + dropdown de ações.

| Coluna | Descrição |
|---|---|
| Email | Com busca textual |
| Nome | — |
| Status | Badge: `ativo` (verde), `pendente` (amarelo), `bloqueado` (vermelho) |
| Preset | Badge: `teste` / `padrao` / `power` / `ilimitado` / `custom` |
| Limite individual | US$/mês (só aparece se ≠ preset) |
| Gasto do mês | US$ atual + % do limite |
| Ações | Dropdown: aprovar pendente, bloquear/desbloquear, editar limite, revogar todos os tokens |

**Modal de edição de limite:** dropdown de preset + campo numérico de override (US$). Se override = preset, mostrar "usando preset padrao (US$ 5/mês)". Botão salvar com feedback de sucesso/erro.

**Ações em lote:** (futuro) selecionar múltiplos e aplicar preset.

### 2. Consumo (`/admin/consumo`)

**Componentes:** Cards + Recharts + tabela de top usuários.

| Elemento | Descrição |
|---|---|
| Card: Total do mês | US$ acumulado no mês atual (todos os usuários) |
| Card: Projeção | Projeção linear até o fim do mês |
| Card: Custo real DeepSeek | Valor cobrado pela DeepSeek (conferir contra painel deles) |
| Card: Cache-hit | % média de tokens economizados por cache |
| Gráfico diário | Barras: custo US$ por dia, linha sobreposta: teto diário |
| Top 5 usuários | Tabela: email, custo, % do limite individual |

Dados puxados via React Query com refetch a cada 60s.

### 3. Saúde (`/admin/saude`)

**Componentes:** Cards com polling a cada 10s (sem WebSocket).

| Indicador | Fonte |
|---|---|
| Requisições ativas | Contador em memória no Fastify (incrementa no início do stream, decrementa no fim) |
| Fila/Concorrência | idem, valor instantâneo |
| Latência p50/p95 | Calculada pelo Fastify com médias móveis dos últimos 5 min |
| Erros DeepSeek 5xx | Contador de erros nas últimas 24h |
| Disco livre | `fs.statfsSync` no endpoint `/api/admin/saude` |
| Memória livre | `os.freemem()` / `os.totalmem()` |
| Status do proxy | 🔵 aberto / 🔴 fechado (kill switch) |

Endpoint `GET /api/admin/saude` expõe todas as métricas em um JSON só. Admin faz polling.

### 4. Auditoria (`/admin/auditoria`)

**Componentes:** TanStack Table paginada + filtros.

| Coluna | Descrição |
|---|---|
| Data/hora | Timestamp formatado (fuso Cuiabá) |
| Ator | Email de quem executou a ação |
| Ação | `criar_user`, `mudar_limite`, `bloquear_user`, `revogar_token`, `kill_switch`... |
| Alvo | Email do usuário afetado |
| Detalhes | JSON expandível (ex: `{"limite_antes": 5, "limite_depois": 20}`) |

Filtros: por ação (dropdown), por ator (busca), por período (range de datas).

### 5. Kill switch (`/admin/kill-switch`)

**Componentes:** Botão grande vermelho + modal de confirmação dupla + indicador de status.

- Indicador: "Proxy: 🔵 Aberto — todas as requisições de usuários estão passando" ou "🔴 Fechado — requisições de usuários estão bloqueadas"
- Botão "Fechar proxy": abre modal "Tem certeza? Todos os usuários (exceto admin) serão bloqueados. Isso NÃO afeta quem usa chave própria."
- Confirmação: digitar "FECHAR" + botão confirmar
- Endpoint: `POST /api/admin/kill-switch` (só admin, rate limit 1 req/s)
- Reabertura: mesmo fluxo com botão "Reabrir proxy"

---

## Auth do admin: guarda dupla

1. **No boot do SPA:** `GET /api/admin/check` valida sessão httpOnly + role=admin → se falhar, redireciona para `/login`.
2. **Em toda rota `/api/admin/*`:** middleware Fastify valida a sessão e a role — independe do front-end. Mesmo que alguém descubra o endpoint, sem sessão de admin não passa.
3. **Kill switch:** endpoint com rate limit extra (1 req/s) + confirmação textual.

---

## Checklist de implementação do painel admin

### Scaffold e infra

- [ ] `npm create vite@latest admin -- --template react-ts` + Tailwind + shadcn/ui init
- [ ] React Router com 5 rotas: `/`, `/usuarios`, `/consumo`, `/saude`, `/auditoria`, `/kill-switch`
- [ ] React Query provider + `queryClient`
- [ ] `@fastify/static` servindo `admin/dist/` na rota `/admin` (fallback `index.html` p/ SPA routing)

### Telas

- [ ] **Usuários:** tabela TanStack Table com busca, sort, dropdown de ações, modal de edição de limite
- [ ] **Consumo:** cards de totais + gráfico Recharts diário + top 5 usuários
- [ ] **Saúde:** cards com polling 10s + indicador de status do proxy (aberto/fechado)
- [ ] **Auditoria:** tabela paginada com filtros (ação, ator, período)
- [ ] **Kill switch:** botão grande + modal de confirmação dupla ("digitar FECHAR") + indicador de status atual

### Integração com API

- [ ] `GET /api/admin/check` — auth gate no boot do SPA
- [ ] `GET /api/admin/usuarios` — lista com busca e paginação
- [ ] `PATCH /api/admin/usuarios/:id` — atualizar status/limite
- [ ] `GET /api/admin/consumo` — totais + diário + top usuários
- [ ] `GET /api/admin/saude` — métricas do sistema e proxy
- [ ] `GET /api/admin/auditoria` — log paginado com filtros
- [ ] `POST /api/admin/kill-switch` — abrir/fechar proxy
- [ ] Tratamento de erro 401/403 (sessão expirada → redirecionar para login)
- [ ] Tratamento de erro 429 (rate limit do kill switch → toast)

### Qualidade

- [ ] Build de produção (`vite build`) → `dist/` sem erros
- [ ] Teste manual: fluxo completo aprovar pendente → definir limite → ver consumo → kill switch → reabrir

---

## Segurança

- Senhas com scrypt; sessões httpOnly+Secure+SameSite; CSRF no site; troca de senha revoga dispositivos.
- Tokens `cp_` opacos, hash no banco, mostrados 1×, revogáveis; escopo único (chat) na v1.
- Rate limit por IP no cadastro/login (anti-abuso) + Cloudflare Turnstile no signup.
- Chave DeepSeek de **produção**: exclusiva da plataforma (não a do Hermes — essa é só dev), em `/etc/codingpro/env`, com **teto de gasto configurado no painel da DeepSeek** como última linha de defesa.
- Headers de segurança no site (CSP, HSTS via Cloudflare).
- LGPD: dados mínimos (e-mail), exportação/exclusão de conta self-service, política em pt-BR.

## Checklist de backend

- [ ] Migrations iniciais + seeds (admin do Álvaro)
- [ ] Testes de carga do proxy com streaming (10 usuários simultâneos no hardware deste PC)
- [ ] Simulação de estouro: usuário a 99% → requisição grande → corte no ponto certo sem cobrar além
- [ ] Ensaiar fluxo completo: cadastro → aprovação → login CLI → uso → 80% → 100% → aumento de limite pelo admin
