# F3-04 — Roadmap da Fase 3 (Plataforma Web)

**Atualizado:** 2026-07-24 — alinhado ao código real (`packages/api`, `packages/web`, `packages/admin`, CLI cloud).  
Lacunas detalhadas: [`docs/LACUNAS_FASES.md`](../docs/LACUNAS_FASES.md).

Pré-requisito: Fase 1 estável. Stack entregue diverge do plano original em pontos documentados abaixo (Vite no lugar de Next.js, SQL no lugar de Drizzle, etc.) — **funcionalmente** o núcleo P1–P3 está coberto.

Legenda: ☐ pendente · ✅ feito · 🔶 parcial / diferente do plano

## P0 — Inventário e fundação de infra — 🟢

Detalhes: [INVENTARIO_PC.md](INVENTARIO_PC.md) · [SETUP_P0.md](SETUP_P0.md)

- [x] `INVENTARIO_PC.md`: portas, serviços, tunnels
- [x] Portas 8700/8701 reservadas
- [x] Tunnel dedicado + DNS `codingpro.cursar.space` / `codingpro-api.cursar.space`
- [x] Unidades systemd user (`codingpro-api`, `codingpro-web`, `codingpro-tunnel`) + limites Memory/CPU
- [x] Marco hello-world / site servido sem reiniciar serviços alheios
- [ ] Confirmar no PC acer: database/role `codingpro` + `DATABASE_URL` nos segredos (comandos em SETUP_P0 §2) — **validar no servidor**

## P1 — API + proxy LLM — 🟢 núcleo feito

- [x] Fastify + migrations SQL (`postgres.js`; **não** Drizzle — desvio documentado)
- [x] Proxy `POST /v1/chat/completions` streaming passthrough (plano citava `/v1/chat`)
- [x] Medição usage (entrada/saída/cache/reasoning) + `eventos_uso` / `uso_mensal`
- [x] Pré-checagem de limite + `402` pt-BR + avisos 80/95% (headers)
- [x] Rate limit global / por rota proxy (IP/Authorization)
- [x] Kill switch + allowlist Pro/Flash + chave do servidor (nunca o `cp_`)
- [x] Playground `/api/vps/agent` também mede e respeita limite (fix 2026-07-24)
- [x] `rate_rpm` por usuário
- [x] Limite diário opcional
- [ ] Concorrência por usuário + override temporário
- [ ] Reconciliação com painel DeepSeek / teste de carga formal
- [x] **Marco funcional:** CLI via proxy com consumo gravado (testes de integração cobrem o fluxo)

## P2 — Acesso cloud na CLI + auth — 🟢

- [x] Transporte autenticado via `baseUrl` + `Bearer cp_…` (provider DeepSeek)
- [x] `codingpro login` / `logout` / `conta` (device flow) + `~/.codingpro/credenciais.json` 0600
- [x] Também `CODINGPRO_TOKEN` / `CODINGPRO_API_URL` no ambiente
- [x] Tokens `cp_` (emissão, hash, revogação, último uso); device flow atômico
- [x] Cadastro/login no site + status `pendente`/`ativo`/`bloqueado` + aprovação admin
- [x] Verificação de e-mail por código; envio SMTP opcional quando `SMTP_*` estiver configurado
- [x] **Marco:** conta → aprovação → `codingpro login` → uso sem chave própria

## P3a — Landing + cadastro — 🟢 (Vite, não Next.js)

- [x] Site Vite + React (`packages/web`) — **desvio:** não é Next.js/Tailwind/shadcn
- [x] Landing pt-BR + guia `/comecar` (CLI + Windows)
- [x] Cadastro + login
- [x] Aviso de conta pendente no painel
- [x] `/entrar-dispositivo` para device flow
- [ ] Turnstile no cadastro — 🔶 código opcional entregue; falta configurar site key/secret pelo Álvaro
- [ ] Verificação de e-mail automática (SMTP) — 🔶 módulo entregue; envio real depende de `SMTP_*`
- [x] Termos e Privacidade LGPD pt-BR
- [ ] GIF/asciinema real + tabela de preços/planos
- [x] **Marco funcional:** visitante cadastra e aguarda aprovação

## P3b — Dashboard do usuário — 🟢

- [x] Área logada `/painel`: consumo, %, renovação, gráfico diário, tokens, perfil, senha
- [x] Gerar/listar/revogar tokens + instruções `codingpro login`
- [x] 2FA TOTP no perfil
- [x] Exportar dados e apagar conta (LGPD)
- [ ] Recharts (há gráfico próprio)
- [x] **Marco funcional:** usuário aprovado vê consumo e gera token

## P3c — Painel admin — 🟢 MVP (stack simplificada)

### Entregue

- [x] Vite + React SPA servida pela API em `/admin`
- [x] Auth gate `GET /api/admin/check`
- [x] Usuários: busca, aprovar/bloquear, limite, revogar tokens, código de verificação
- [x] Consumo: total do mês (**soma real**, não só top 5), gráfico, top 5, polling
- [x] Saúde: métricas processo + kill switch
- [x] Auditoria: paginação + filtro por ação

### Ainda do plano completo

- [ ] shadcn/Tailwind/TanStack/Recharts/React Query/React Router (URLs profundas)
- [ ] Sort de usuários; filtros de auditoria por ator/período; JSON expandível
- [ ] Disco livre; projeção linear; % cache-hit; custo DeepSeek real
- [ ] Kill switch com rate limit extra + confirmação na reabertura
- [x] 2FA admin obrigatório em produção
- [x] **Marco MVP:** Álvaro administra limites pelo painel sem SSH

## P4 — Endurecimento e beta — 🟡 parcialmente code-complete

- [x] 2FA TOTP (obrigatório admin em produção, opcional user)
- [ ] Turnstile — 🔶 código entregue; falta configurar `TURNSTILE_SITE_KEY`/secret pelo Álvaro
- [x] Header CSP
- [ ] Teste de carga: 10 usuários simultâneos
- [ ] Simulação de estouro de limite (requisição grande perto de 100%)
- [ ] Backup diário `pg_dump` + Tailscale + teste de restore — 🔶 script e timer systemd entregues; falta validar agenda/restore no host
- [ ] Chave DeepSeek de produção dedicada com teto — validar em produção
- [x] Termos + privacidade LGPD pt-BR
- [x] Exportar/apagar conta (LGPD)
- [x] Limite diário + `rate_rpm`
- [ ] SMTP transacional — 🔶 módulo entregue; falta configurar segredos `SMTP_*`
- [ ] Alertas proativos (e-mail/WhatsApp)
- [ ] Beta fechado 3–5 usuários, monitoramento diário
- [ ] **Marco:** mês fechado sem incidente e custo ≤ previsto

## Resumo

| Fase | Status |
|---|---|
| P0 | 🟢 quase completo — validar DB no acer |
| P1 | 🟢 núcleo; `rate_rpm` e limite diário entregues; faltam concorrência/override/carga |
| P2 | 🟢 |
| P3a/P3b/P3c | 🟢 MVP funcional; acabamento do plano original aberto |
| P4 | 🟡 code-complete em 2FA/LGPD/CSP/limites/backup; segredos/ops/beta abertos |

## Riscos (inalterados)

| Risco | Mitigação |
|---|---|
| Derrubar sistema existente | P0 + só restart `codingpro-*` + tunnel dedicado |
| Estouro de custo | Limites + teto DeepSeek + kill switch + alertas (alertas ainda P4) |
| PC residencial fora do ar | Aceito no beta (doc 02) |
| Vazamento da chave do servidor | Só em env do host; nunca no repo |
