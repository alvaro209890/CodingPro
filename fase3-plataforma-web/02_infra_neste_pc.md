# F3-02 — Infra neste PC (coexistência com o que já roda)

**Regra de ouro (diretriz do Álvaro): nada do que já roda neste PC pode cair.** Este doc existe pra isso.

## O que JÁ roda aqui (inventário conhecido — CONFERIR antes do P0)

| Sistema | Serviços/portas conhecidas |
|---|---|
| Atlas (assistente WhatsApp/Trello) | systemd `atlas-api` / `atlas-worker` / `atlas-web`; **Postgres local** |
| Hermes | gateway `:8642`, bridge WhatsApp `:3000`, xai-oauth `:8645` |
| NexoGeo | backend uvicorn + **Cloudflare Tunnel** → `nexogeo-api.cursar.space` |
| Outros | conferir `ss -tlnp` + `systemctl list-units` + config dos tunnels no P0 |

- [ ] **P0 obrigatório:** gerar inventário real (`ss -tlnp`, `systemctl list-units --type=service --state=running`, `cloudflared tunnel list` + configs) e congelar em `INVENTARIO_PC.md` antes de subir qualquer coisa

## Alocação para o CodingPro (proposta)

| Item | Valor proposto | Nota |
|---|---|---|
| API | `127.0.0.1:8700` | Porta livre a confirmar no inventário |
| Site (Next) | `127.0.0.1:8701` | idem |
| Subdomínios | `codingpro.cursar.space` (site) + `codingpro-api.cursar.space` (API) | Mesmo padrão do NexoGeo |
| Tunnel | **Tunnel próprio novo** (`cloudflared` instância dedicada) | Isolamento: mexer no CodingPro nunca toca o tunnel do NexoGeo. Alternativa (decidir no P0): adicionar hostnames ao tunnel existente — menos processos, mais acoplamento |
| systemd | `codingpro-api.service`, `codingpro-web.service`, `codingpro-tunnel.service` | `Restart=always`, usuário próprio sem sudo, `WantedBy=multi-user.target` |
| Banco | database `codingpro` no **Postgres existente** (o do Atlas) | Usuário Postgres próprio `codingpro` com acesso SÓ a esse database; sem tocar nos databases do Atlas |

Bind **sempre em 127.0.0.1** — nada exposto na LAN; só o tunnel alcança.

## Regras de coexistência

1. Nenhum `apt install`/upgrade de serviço compartilhado (Postgres, Node) sem checar impacto nos outros sistemas.
2. Migrations só no database `codingpro`; usuário do banco sem permissão fora dele (defesa em profundidade).
3. Limites de recursos no systemd: `MemoryMax` (ex. 1G API / 1G site) e `CPUWeight` baixos — se o CodingPro vazar memória, ele morre e reinicia, **os outros sistemas nem sentem**.
4. Deploy = `git pull && build && systemctl restart codingpro-*` — nunca `restart` de serviço que não seja `codingpro-*`.
5. Logs com journald + rotação; disco monitorado (alerta em 85%).

## Backup e recuperação

- [ ] `pg_dump` diário do database `codingpro` (cron) → pasta local + cópia p/ **server-desktop via Tailscale** (PC remoto que o Álvaro já tem) — backup fora da máquina de graça
- [ ] Teste de restauração documentado (rodar 1× antes de abrir cadastro)
- [ ] Segredos em `.env` fora do repo (`/etc/codingpro/env`, root:codingpro 640) — chave DeepSeek de produção, secret de sessão, SMTP

## Realidade de PC residencial (aceita nesta fase)

| Limitação | Postura |
|---|---|
| Queda de luz/internet = plataforma fora | Aceito no beta; Cloudflare devolve erro decente; CLI cai de volta pra "tente depois" (e quem tem chave própria nem percebe) |
| Sem redundância | Beta fechado com aviso; se crescer → migrar API/DB p/ VPS (arquitetura já é portável: systemd+Postgres+tunnel em qualquer lugar) |
| IP/ISP | Irrelevante — tunnel não expõe IP nem exige porta aberta |

## E-mail transacional (verificação de conta)

- [ ] Decidir: reaproveitar padrão do `acompanhamento` (conta Gmail + app password já dominada) p/ beta pequeno, ou Resend/Brevo free tier — decidir no P1
