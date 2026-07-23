# F3-04 — Roadmap da Fase 3 (Plataforma Web)

Pré-requisito: Fase 1 estável (Fase 2 pode andar em paralelo a partir do P2). **Total revisado: ~5–7 semanas** (com base na velocidade de desenvolvimento da Fase 1).

## P0 — Inventário e fundação de infra (1 semana)

- [ ] `INVENTARIO_PC.md`: portas (`ss -tlnp`), serviços systemd, tunnels existentes — congelado ANTES de subir qualquer coisa
- [ ] Confirmar portas 8700/8701 livres (ou realocar)
- [ ] Criar database `codingpro` + usuário restrito no Postgres existente (sem tocar no Atlas)
- [ ] Tunnel dedicado + DNS `codingpro.cursar.space` / `codingpro-api.cursar.space` com página "em breve"
- [ ] Unidades systemd com MemoryMax/CPUWeight + usuário sem sudo
- [ ] **Marco: hello-world servido pelos 2 subdomínios sem NENHUM serviço existente reiniciado**

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

## P3 — Site + dashboards (2 semanas)

- [ ] Landing pt-BR (o que é, demo asciinema, downloads)
- [ ] Dashboard do usuário (consumo, % do limite, tokens da CLI)
- [ ] Painel admin completo (doc 03: usuários, limites individuais, consumo, saúde, auditoria, kill switch)
- [ ] Alertas proativos pro admin (custo diário, 100% de usuário, 5xx)
- [ ] **Marco: Álvaro administra limites 100% pelo painel, sem SSH**

## P4 — Endurecimento e beta (1–2 semanas)

- [ ] 2FA, Turnstile, headers, teste de carga (10 simultâneos), simulação de estouro de limite
- [ ] Backup diário pg_dump → server-desktop (Tailscale) + teste de restauração
- [ ] Chave DeepSeek de produção dedicada com teto no painel DeepSeek
- [ ] Termos + privacidade LGPD pt-BR
- [ ] Beta fechado: 3–5 usuários convidados, 2 semanas, custo monitorado diariamente
- [ ] **Marco: mês fechado sem incidente e custo real ≤ previsto**

## Riscos específicos da fase

| Risco | Mitigação |
|---|---|
| Derrubar sistema existente mexendo na infra | P0 inventário + regra "só restart codingpro-*" + tunnel dedicado |
| Estouro de custo (bug ou abuso) | Limites por usuário + teto global na DeepSeek + kill switch + alertas diários |
| PC residencial fora do ar | Aceito no beta (doc 02); caminho VPS documentado se crescer |
| Vazamento da chave do servidor | Chave só em `/etc/codingpro/env`; nunca no repo; rotação documentada |
| Streaming via proxy adicionar latência | Passthrough sem buffer + medir p95; meta < 150 ms de overhead |
