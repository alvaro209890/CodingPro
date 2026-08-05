---
name: segundo-cerebro
description: Vault central compartilhado dos agentes deste PC (Markdown + git, protocolo lock+changelog)
tags: [vault, memoria, conhecimento, git]
---

# Segundo Cérebro — vault compartilhado

Vault de conhecimento central que os agentes de IA deste PC usam para memória de longo prazo de projetos e decisões.

## Onde fica

- **Servidor:** `ssh sd` (100.65.138.58, usuário `server`)
- **Caminho:** `/home/server/Downloads/Segundo-Cerebro`
- **Participantes:** Hermes-windows (este PC), Hermes-server, outros agentes

## Estrutura

- `INDEX.md` — índice geral do vault
- `02-projetos/<projeto>.md` — estado/notas de cada projeto (ex.: `02-projetos/geoforest.md`)
- `06-changelog.md` — histórico de mudanças (sempre no topo, data ISO + autor)

## Protocolo obrigatório (nunca pular)

1. **Ler `AGENTS.md` do vault antes de qualquer coisa** (regras canônicas).
2. **Lock antes de editar** — o vault exige trava para evitar conflito entre agentes.
3. **Changelog no topo** — toda edição adiciona entrada com `data ISO` + `autor` em `06-changelog.md`.
4. **Commit pelo próprio vault** — o git do vault é gerenciado pelo protocolo; não commitar por fora.

## Uso típico

- **Registrar:** fim de tarefa → resumo local (rollout/memória do agente) + atualizar vault (com lock + changelog).
- **Ler:** início de tarefa → consultar `INDEX.md` / `02-projetos/<projeto>.md` para retomar contexto.
- **Modelo mental:** "markdown versionado com git + snapshots automáticos" — não é banco vetorial.

## Não confundir com

- Memórias locais por agente: `.codex/memories/`, `.claude/projects/<proj>/memory/`, `.gemini/antigravity/brain/<uuid>/`.
- Essas são por agente; o vault é o **central compartilhado**.
