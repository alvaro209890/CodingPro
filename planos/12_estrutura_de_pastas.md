# 12 — Estrutura de Pastas Proposta

## Repositório da CLI

```
codingpro/
├── package.json                 # raiz do workspace pnpm
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── THIRD_PARTY_NOTICES.md       # créditos/licenças de código portado
├── CODINGPRO.md                 # contexto do próprio projeto p/ a CLI (dogfooding)
│
├── packages/
│   ├── cli/                     # entrypoint: bin, commander, wiring geral
│   │   └── src/
│   │       ├── index.ts         # bin `codingpro`
│   │       ├── commands/        # doctor, maintenance, voice-setup, mcp...
│   │       └── config/          # load/merge de settings
│   │
│   ├── core/                    # coração — SEM dependência de UI
│   │   └── src/
│   │       ├── agent/           # loop agêntico, turno, interrupção
│   │       ├── session/         # persistência JSONL, resume, compactação
│   │       ├── permissions/     # modos, allowlist, deny-list, risco
│   │       ├── orchestrator/    # subagentes, background tasks, JSON-RPC
│   │       ├── plan/            # modo planejamento
│   │       └── events.ts        # contrato de eventos core→UI
│   │
│   ├── llm/                     # camada de providers
│   │   └── src/
│   │       ├── provider.ts      # interface Provider + capability flags
│   │       ├── providers/       # deepseek, ollama, openai-compat genérico, replay
│   │       └── tokens.ts        # contagem/orçamento/custo
│   │
│   ├── tools/                   # tools nativas
│   │   └── src/
│   │       ├── registry.ts      # interface Tool + registro + schemas
│   │       ├── fs/              # read, write, edit(diff), glob, grep
│   │       ├── shell/           # bash (execa, timeout, sandbox futuro)
│   │       ├── git/             # checkpoints, undo, commit (undercover)
│   │       └── mcp/             # cliente MCP → tools dinâmicas
│   │
│   ├── knowledge/               # entendimento do projeto
│   │   └── src/
│   │       ├── repomap/         # tree-sitter, grafo, ranking, orçamento
│   │       ├── queries/         # *.scm por linguagem (origem: Cline, com créditos)
│   │       └── detect/          # detecção de linguagem/framework/scripts
│   │
│   ├── memory/                  # memória persistente
│   │   └── src/
│   │       ├── store.ts         # CRUD markdown+frontmatter, MEMORY.md
│   │       ├── index-db.ts      # SQLite FTS5
│   │       ├── retrieval.ts     # seleção p/ contexto
│   │       └── consolidator/    # job de consolidação (extract/merge/prune)
│   │
│   ├── tui/                     # interface Ink
│   │   └── src/
│   │       ├── app.tsx
│   │       ├── components/      # chat, toolcard, permission, diffview, statusline
│   │       ├── pet/             # gamificação (isolada — fácil de remover)
│   │       └── headless.ts      # modo -p
│   │
│   └── voice/                   # opcional, lazy
│       └── src/                 # stt (whisper.cpp), tts (piper), audio i/o
│
├── evals/                       # benchmark de edição, retrieval, consolidador
├── fixtures/                    # conversas gravadas p/ replay (sanitizadas)
├── docs/
│   ├── roteiros-qa/             # roteiro manual por fase
│   └── ...                      # guias de usuário na F9
└── .github/workflows/           # ci.yml (lint+unit+replay), e2e.yml, evals.yml
```

## Estado em runtime (máquina do usuário)

```
~/.codingpro/                    # global
├── settings.json                # config global (JSONC)
├── memory/  + MEMORY.md         # memória global
├── skills/                      # skills globais (*.md)
├── agents/                      # tipos de agente globais
├── sessions/<hash-projeto>/     # históricos JSONL por projeto
├── index.db                     # SQLite (FTS5 memória, cache repomap)
├── pet.json                     # estado da gamificação
└── bin/                         # binários baixados (ripgrep, whisper, piper)

<projeto>/.codingpro/            # por projeto (memory/ gitignored por padrão)
├── settings.json                # overrides do projeto
├── memory/  + MEMORY.md
├── skills/   agents/   plans/   tasks/
└── shadow-git/                  # só se o projeto não tiver git

<projeto>/CODINGPRO.md           # contexto do projeto (versionável, gerado por /init)
```

## Esta pasta de planejamento (`~/Documentos/CodingPro`)

```
CodingPro/
├── README.md                    # índice geral do plano
├── CHECKLIST_MESTRE.md          # progresso consolidado
├── planos/01..12_*.md           # os planos (este arquivo é o 12)
└── referencias/                 # (F0) clones de cline, aider, sst/opencode p/ mineração
```

O desenvolvimento começou em 2026-07-22 **nesta raiz**, que já é o repositório definitivo
`alvaro209890/CodingPro`. Não será criada uma subpasta `codingpro/`. Os pacotes entram
incrementalmente quando ganharem responsabilidade real; o F0.1 iniciou por `packages/cli`.
