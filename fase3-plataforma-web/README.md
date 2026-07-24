# CodingPro — Fase 3: Plataforma Web (contas + limites)

> Planejamento da **Fase 3** (separado das Fases 1 `../planos/` e 2 `../fase2-app-windows/`).
> **Pré-requisito:** Fase 1 concluída.

**Status:** 🟢 **Núcleo P0–P3 funcional** · 🔴 **P4 (hardening/beta) aberto** — revisado em 2026-07-24  
Lacunas: [`docs/LACUNAS_FASES.md`](../docs/LACUNAS_FASES.md) · checklist: [`04_roadmap_checklist.md`](04_roadmap_checklist.md)

**Código:** `packages/api` · `packages/web` · `packages/admin` · CLI cloud em `packages/cli`

## O que é

Site + API do CodingPro: a pessoa cria conta e usa a CLI/app **sem chave DeepSeek própria**. Chamadas passam pelo proxy, que mede consumo e aplica limite por usuário.

## Componentes (plano → realidade)

| Componente | Plano original | Entrega atual |
|---|---|---|
| Site público | Next.js + Tailwind + shadcn | **Vite + React** + CSS próprio (`packages/web`) |
| Dashboard | Next.js área logada | `/painel` na mesma SPA |
| Admin | Vite + shadcn + React Query | **Vite + React** MVP em `/admin` (CSS próprio) |
| API/Proxy | Fastify + Drizzle | Fastify + **SQL/`postgres.js`** |
| CLI cloud | `codingpro login` | ✅ device flow + `credenciais.json` + `CODINGPRO_TOKEN` |

## Domínios / infra

- Site: `https://codingpro.cursar.space`
- API: `https://codingpro-api.cursar.space`
- PC acer + Cloudflare Tunnel dedicado + systemd user units (`deploy/systemd/`)
- Postgres database `codingpro` (validar role/`DATABASE_URL` no host — SETUP_P0)

## Docs desta fase

| Doc | Conteúdo |
|---|---|
| [01_arquitetura.md](01_arquitetura.md) | Arquitetura (alguns trechos ainda descrevem o plano Next/Drizzle) |
| [02_infra_neste_pc.md](02_infra_neste_pc.md) | Tunnel, portas, coexistência |
| [03_contas_limites_admin.md](03_contas_limites_admin.md) | Modelo de contas/limites/admin |
| [04_roadmap_checklist.md](04_roadmap_checklist.md) | P0–P4 com status atualizado |
| [SETUP_P0.md](SETUP_P0.md) | Execução P0 no acer |
| [INVENTARIO_PC.md](INVENTARIO_PC.md) | Inventário do host |

## Deploy no servidor

```bash
git checkout master && git pull
pnpm plataforma:deploy
```
