# CodingPro — Fase 3: Plataforma Web (contas + limites)

> Planejamento da **Fase 3** (separado das Fases 1 `../planos/` e 2 `../fase2-app-windows/`).
> **Pré-requisito: Fase 1 concluída** (a CLI é o produto); Fase 2 idealmente em beta.

**Status:** 📋 Planejado em 2026-07-22 · revisado em 2026-07-23 (pós-conclusão da Fase 1)

**Pré-requisitos:** a Fase 1 (CLI) está funcional com 3 pacotes (`llm`, `core`, `cli`), 591 testes, 95.5% cobertura. O `packages/llm` define as interfaces `Provider`/`ProviderEvent`/`FinishReason` que o proxy deve espelhar.

## O que é

O **site do CodingPro**: a pessoa entra, **cria uma conta** e passa a usar a CLI (e o app Windows) **sem precisar de chave DeepSeek própria** — as chamadas de IA passam pelo backend do CodingPro, que usa a chave do servidor, **mede o consumo e aplica o limite que o Álvaro definir para cada usuário**.

Componentes:

1. **Site público** — landing institucional pt-BR + cadastro/login (Next.js, SSR-friendly).
2. **Dashboard do usuário** — consumo, % do limite, tokens CLI, gráfico diário (Next.js, área logada).
3. **Painel admin** — **SPA standalone (Vite + React + shadcn/ui)** servido estaticamente pela API. Só o Álvaro acessa. Telas: usuários, consumo, saúde, auditoria, kill switch.
4. **API/Proxy LLM** — backend Fastify que autentica o usuário, repassa as chamadas ao DeepSeek com streaming passthrough, conta tokens e corta quando o limite acaba. O contrato wire é OpenAI-compatible, espelhando a `Provider` interface do `packages/llm` (campos de `usage` já definidos: `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `reasoningTokens`).
5. **Modo de acesso cloud** na CLI/app — `codingpro login` troca a autenticação e o transporte para o proxy; o provider continua DeepSeek e a allowlist permanece V4 Pro/Flash. O modo `access.mode = cloud` (já previsto) altera somente `baseUrl` + headers de autenticação.

## Infra decidida (diretriz do Álvaro)

- **Servidor: este PC (acer)**, exposto via **Cloudflare Tunnel** no **domínio já comprado (`cursar.space`)** — mesmo modelo do NexoGeo (`nexogeo-api.cursar.space`).
- **Regra de ouro: não derrubar nada que já roda aqui** (Atlas, Hermes, NexoGeo, tunnels) — inventário e portas dedicadas no doc 02.
- **Banco:** Postgres **já existente** neste PC (o do Atlas) com **database separado** `codingpro` — sem instalar serviço novo.
- **API DeepSeek para dev/testes:** a mesma do Hermes deste PC — `DEEPSEEK_API_KEY` em `~/.hermes/.env` (**nunca** escrever o valor em docs/repo). Em produção: chave própria dedicada, com teto de gasto.

## Docs desta fase

| Doc | Conteúdo |
|---|---|
| [01_arquitetura.md](01_arquitetura.md) | Arquitetura geral, separação site vs dashboard vs admin, decisão admin SPA standalone |
| [02_infra_neste_pc.md](02_infra_neste_pc.md) | Tunnel, subdomínios, portas, systemd, Postgres compartilhado, coexistência |
| [03_contas_limites_admin.md](03_contas_limites_admin.md) | Modelo de dados, limites por usuário, stack e telas do painel admin, segurança |
| [04_roadmap_checklist.md](04_roadmap_checklist.md) | Fases P0–P4 com checklists (P3 desmembrado: landing, dashboard, admin) |
