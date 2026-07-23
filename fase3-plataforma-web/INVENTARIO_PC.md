# F3-P0 — Inventário do PC `acer` (congelado)

**Gerado em:** 2026-07-23 · **Host:** `acer-Aspire-A515-45` · **SO:** Ubuntu 24.04 (kernel 7.0.0-28-generic)

> Este documento é o **congelamento pré-P0** exigido pelo doc [02_infra_neste_pc.md](02_infra_neste_pc.md).
> Nada do que está listado aqui pode ser reiniciado, realocado ou alterado pelo CodingPro.
> Comandos usados: `ss -tlnp`, `systemctl list-units`, `systemctl --user list-units`, `cloudflared tunnel list`, `docker ps`.

## 1. Hardware / capacidade

| Recurso | Valor |
|---|---|
| CPU | 16 threads |
| RAM | 11 Gi total · ~2,6 Gi em uso · **8,5 Gi disponíveis** |
| Swap | 7,5 Gi (0 em uso) |
| Disco `/` | 440 G · 230 G usados · **188 G livres (56%)** |

Folga confortável para API + site do CodingPro com `MemoryMax` de 1G cada.

## 2. Portas TCP em escuta (estado congelado)

| Porta | Bind | Processo / dono | Sistema |
|---|---|---|---|
| 22 | `0.0.0.0` | sshd | SSH |
| 53 | `127.0.0.53`, `127.0.0.54`, `10.0.3.1` | systemd-resolved / lxc | Sistema |
| 631 | `127.0.0.1`, `[::1]` | cups | Impressão |
| 1337 | `0.0.0.0` | `python` (pid 1292) | **g4f-api** (user unit `g4f-api`) |
| 3000 | `127.0.0.1` | `node` (pid 3431) | **Hermes bridge WhatsApp** |
| 5432 | `127.0.0.1` | postgres | **Postgres 16.14 (Atlas)** — alvo do database `codingpro` |
| 5433 | `0.0.0.0` | Docker | **`aqui-log-postgres`** (postgres:17-alpine, AquiResolve) |
| 6379 | `0.0.0.0` | Docker | **`aqui-log-redis`** (redis:7-alpine, AquiResolve) |
| 7070 | `0.0.0.0` | — | AnyDesk |
| 8000 | `127.0.0.1` | `python` (pid 1295) | **NexoGeo backend** (uvicorn) |
| 8642 | `127.0.0.1` | `hermes` (pid 1293) | **Hermes gateway** |
| 8645 | `127.0.0.1` | `hermes` (pid 1294) | **Hermes proxy xAI** |
| 8788 | `0.0.0.0` | `node` (pid 1290) | **acer-opencode-proxy** (`~/proxy-acer.js`) |
| 10000 | `127.0.0.1` | `node` (pid 1307) | **SaldoPro backend** |
| 11434 | `*` | ollama | **ollama** (system unit) |
| 20241 / 20242 | `127.0.0.1` | `cloudflared` (pid 1311) | métricas do tunnel saldopro |
| 37047 | `127.0.0.1` | — | efêmera |
| 64633 / 33294 | Tailscale | tailscaled | Tailscale |

**Portas 8700 e 8701 estão LIVRES** → confirmadas para API e site do CodingPro. ✅

## 3. Serviços systemd

### 3.1 Sistema (`systemctl list-units --state=running`)

Relevantes: `cloudflared.service` (tunnel `servidor-ia`, config `/etc/cloudflared/config.yml`), `postgresql@16-main.service`, `docker.service`/`containerd.service`, `ollama.service`, `tailscaled.service`, `ssh.service`, `anydesk.service`, `waydroid-container.service`, `lightdm.service`.
Restante é base do SO (avahi, cups, NetworkManager, udisks2, upower, etc.).

### 3.2 Usuário `acer` (`systemctl --user`) — **é aqui que os projetos rodam**

| Unit | Executa |
|---|---|
| `acer-opencode-proxy` | `node ~/proxy-acer.js` (porta 8788) |
| `g4f-api` | `~/apps/g4f/.venv/bin/python -c "from g4f.api import run_api; run_api()"` (1337) |
| `hermes-gateway` | `~/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run` (8642) |
| `hermes-proxy-xai` | idem `proxy start --provider xai --port 8645` |
| `nexogeo-backend` | `~/Documentos/NexoGeo-Ambiental/.venv/bin/python -m uvicorn api.app:app --port 8000` |
| `saldopro-backend` | `~/.config/saldopro/run-backend.sh` (10000) |
| `saldopro-cloudflared` | `cloudflared tunnel --config ~/.cloudflared/saldopro-config.yml run` |
| `barrier-client` | `barrierc … [PCQUE001IMAP.local]:24800` (mouse compartilhado) |

> **Decisão de arquitetura (ajuste ao doc 02):** o padrão real deste PC é **user units** (`systemctl --user`), não system units.
> O CodingPro seguirá o mesmo padrão — `codingpro-api`, `codingpro-web`, `codingpro-tunnel` como **user units**.
> Vantagens: nenhum `sudo`, nenhum arquivo em `/etc/systemd`, isolamento igual ao dos outros projetos.
> Requer `loginctl enable-linger acer` (verificar; os serviços já sobem no boot, então provavelmente já está ativo).

## 4. Cloudflare Tunnels

Conta com 18 tunnels registrados. **Rodando NESTE PC (apenas 2 processos):**

| PID | Tunnel | Config | Hostnames |
|---|---|---|---|
| 1484 (root) | `servidor-ia` (`86e60118…`) | `/etc/cloudflared/config.yml` | — |
| 1311 (acer) | `saldopro-api` (`0a219227…`) | `~/.cloudflared/saldopro-config.yml` | `saldopro-api`, `saldopro`, `saldopro-admin`, **`nexogeo-api`**, `atlas` (.cursar.space) |

Os demais tunnels da conta (`geoserver-wms`, `pareceres-api`, `alertacar`, `vendafacil-api`, `vortax-api`, `vetorizamat`, `agro-oliveira-api`, `aquiresolve-financeiro`, `nexus-local-api`, `painel-limites`) têm conexões ativas **de outras máquinas** (server-desktop) — não mexer.

**Domínio:** `cursar.space` (já na conta). Credenciais: `~/.cloudflared/cert.pem`.

> ⚠️ O tunnel `saldopro-api` virou um tunnel "guarda-chuva" (serve SaldoPro + NexoGeo + Atlas).
> **Decisão:** o CodingPro terá **tunnel próprio dedicado** (`codingpro`), config `~/.cloudflared/codingpro-config.yml`.
> Mexer no CodingPro nunca toca no config compartilhado do saldopro. Confirma a proposta do doc 02.

## 5. Postgres (alvo do database `codingpro`)

| Item | Valor |
|---|---|
| Versão | PostgreSQL **16.14** (Ubuntu 24.04) |
| Bind | `127.0.0.1:5432` |
| Unit | `postgresql@16-main.service` (system) |
| Roles com login | `postgres` (superuser), `atlas` (CREATEDB, **sem** CREATEROLE) |
| Database existente | `atlas` (usado pelo Atlas — **não tocar**) |

**Bloqueio conhecido:** criar o role dedicado `codingpro` exige superusuário, e `sudo` neste PC **pede senha**
(diferente do server-desktop, que é NOPASSWD). O passo de criação de role/database precisa ser executado
manualmente pelo Álvaro — comando pronto em [SETUP_P0.md](SETUP_P0.md).

## 6. Docker

| Container | Imagem | Portas |
|---|---|---|
| `aqui-log-postgres` | `postgres:17-alpine` | `0.0.0.0:5433→5432` |
| `aqui-log-redis` | `redis:7-alpine` | `0.0.0.0:6379→6379` |

Do AquiResolve. **Não reutilizar** para o CodingPro.

## 7. Alocação reservada para o CodingPro

| Item | Valor | Status |
|---|---|---|
| API (Fastify) | `127.0.0.1:8700` | porta livre ✅ |
| Site (Next.js) | `127.0.0.1:8701` | porta livre ✅ |
| Admin SPA | servido pela API em `/admin` | sem porta extra |
| Tunnel | `codingpro` (novo, dedicado) | a criar |
| Hostnames | `codingpro.cursar.space` · `codingpro-api.cursar.space` | a criar |
| systemd | `codingpro-api` · `codingpro-web` · `codingpro-tunnel` (**user units**) | a criar |
| Banco | database `codingpro` no Postgres 16 da porta 5432 | pendente (superusuário) |
| Segredos | `~/.config/codingpro/env` (chmod 600) — **não** `/etc/codingpro/env`, para evitar sudo | a criar |

## 8. Regras de coexistência (reafirmadas)

1. **Só** `systemctl --user restart codingpro-*`. Nunca reiniciar outro serviço.
2. Nenhum `apt install`/upgrade de Postgres, Node, Docker ou cloudflared.
3. Bind **sempre** em `127.0.0.1`. Nada exposto na LAN.
4. Migrations apenas no database `codingpro`.
5. `MemoryMax=1G` + `CPUWeight=50` nas units do CodingPro — se vazar memória, morre sozinho.
6. Config de tunnel **separado**; nunca editar `~/.cloudflared/saldopro-config.yml` nem `/etc/cloudflared/config.yml`.
