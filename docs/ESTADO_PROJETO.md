# Estado do projeto CodingPro

**Última atualização:** 2026-07-24  
**Branch:** `master` · **Repo:** https://github.com/alvaro209890/CodingPro  

| Fase | Status |
|------|--------|
| **1 — CLI** | 🟢 Completa no plano de engenharia v1. Empacotamento/CI ok. `npm publish` + QA visual humano ficam com o Álvaro. |
| **2 — Windows** | 🟡 App Electron usável (W0–W2). W3 instalador/auto-update **incompleto**. |
| **3 — Plataforma** | 🟢 Contas, proxy medido, limites, site, admin MVP, `codingpro login`. **P4** (SMTP, backup, beta) aberto. |

**Lacunas detalhadas (plano × código):** [`LACUNAS_FASES.md`](LACUNAS_FASES.md)

---

## Fase 1 — CLI

**Status:** 🟢 CLI 1.0 **completa** no plano de engenharia.  
TUI: experiência completa é **Aurora ANSI** (4 temas + pet/XP). O pacote Ink (`packages/tui`) permanece mínimo — ver lacunas.  
Pós-1.0: voz, tree-sitter AST, background tasks, Ink full, etc.

---

## 1. O que é

**CodingPro** é uma CLI local-first de desenvolvimento assistido por IA, em **português**, com:

- **Provider único de código:** DeepSeek V4 **Pro** + **Flash** (roteamento interno / auto-effort)
- **Node.js 24**, monorepo **pnpm**, bins `codingpro` / `cpro`
- Sandbox de arquivos, permissões, edit/undo, memória, multi-agente, MCP, skills, hooks
- UI **Aurora** (ANSI): chat TTY com autocomplete `/`, status de tokens/custo, Windows CMD friendly

---

## 2. Estrutura do monorepo

```
CodingPro/
├── packages/
│   ├── cli/          # binário codingpro/cpro, chat, config, tema, doctor, login cloud
│   ├── core/         # agent loop, tools, workspace, repo-map, vector, memória
│   ├── llm/          # Provider, DeepSeek, replay, cost
│   ├── tui/          # protótipo Ink (mínimo; UX real = ANSI na cli)
│   ├── desktop/      # App Electron Windows (Fase 2)
│   ├── api/          # Proxy LLM + contas + admin API (Fase 3)
│   ├── web/          # Site + painel + playground (Fase 3)
│   └── admin/        # Painel admin SPA (Fase 3)
├── docs/             # GUIA, ESTADO, LACUNAS_FASES, diário, roteiros QA
├── planos/           # docs 01–16 (Fase 1)
├── fase2-app-windows/
├── fase3-plataforma-web/
└── CHECKLIST_MESTRE.md
```

| Pacote | Responsabilidade |
|--------|------------------|
| `@codingpro/llm` | Contrato Provider, DeepSeek, replay, `estimateCost` / `formatCost` |
| `@codingpro/core` | `runAgent`, tools, permissões, checkpoints, repo map, **vector search**, memória, subagentes |
| `codingpro` (cli) | CLI Commander, chat TTY, headless, config JSONC, tema, doctor, quality |

---

## 3. O que foi entregue (resumo por área)

### 3.1 Fundação e loop agêntico (F0–F1)

- Workspace pnpm, TypeScript strict, Biome, Vitest, CI Linux/macOS Node 24
- Provider DeepSeek + replay fail-closed; config global → projeto → env → flags
- Tools: `read_file`, `list_dir`, `grep`, `write_file`, `edit_file`, `bash`, `repo_map`, `code_search`, `remember`, `task`
- Permissões `ask|allowlist|auto`, aprovação interativa, diff na escrita
- Sessões JSONL, compactação de contexto, retry/backoff, custo/cache

### 3.2 Edição e projeto (F2–F3)

- `edit_file` search/replace atômico + checkpoints `/undo` `/redo`
- Repo map heurístico + `/init` → `CODINGPRO.md`
- **Busca vetorial local** (2026-07-23): SQLite FTS5 + embeddings offline em `.codingpro/vector-index.sqlite`

### 3.3 Memória, multi-agente, extensibilidade (F4–F6)

- Memória markdown + retrieval léxico; `/lembrar`, `/memory`
- Subagentes explorer/worker/architect/reviewer; tool `task`; `/plan` interativo; `/review`
- MCP stdio, skills `.md`, hooks pre/post/stop

### 3.4 Qualidade e release (F8–F9 + pós-núcleo)

- Attribution undercover; Aurora ANSI; autocomplete `/`
- **Auto-correção Biome** (`check --write` + re-turno residual)
- Hardening offline + `pnpm test:evals`; `install.sh`, `doctor`, guia
- Auto-compact (orçamento default 800k / janela DeepSeek **1M**); `/compact`, `/custo` de sessão

### 3.5 UX recente (correções de front)

- Cabeçalho **compacto** (sem arte ASCII larga nem animação que duplicava linhas)
- **Sem** lista de todos os comandos na abertura (só dica + `/ajuda`)
- Spinner com clear-line estável (não apaga o histórico / prompt de forma errática)
- Status de sessão: `$ · ↓↑ · ctx · rest` numa linha

---

## 4. Como usar neste PC

```bash
# Launcher (já aponta para o dist do repo + Node 24 + chave se existir)
codingpro --chat
# ou
cpro --chat

# Rebuild após mudanças
cd ~/Documentos/CodingPro
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
pnpm install --frozen-lockfile
pnpm check    # format, lint, typecheck, testes, build, smoke package
codingpro --chat
```

Chave: `~/.config/codingpro/deepseek.env` (`DEEPSEEK_API_KEY=...`, permissão `0600`).

| Modo | Comando |
|------|---------|
| Chat | `codingpro --chat` |
| Agente headless | `codingpro --agente -p "..."` |
| Prompt simples | `codingpro -p "..."` |
| Doctor | `codingpro --doctor` |
| Replay offline | `codingpro --provider replay --replay-file fixtures/llm/ola.jsonl -p "olá"` |

### Comandos úteis no chat

| Comando | Função |
|---------|--------|
| `/` | Autocomplete de comandos (↑↓ Tab Enter) |
| `/ajuda` | Lista completa |
| `/custo` | Custo/tokens da **sessão** + contexto |
| `/compact` | Compacta histórico agora |
| `/plan <obj>` | Plano interativo (perguntas + ativo na sessão) |
| `/plan clear` | Limpa plano ativo |
| `/index` | Indexa repo (busca vetorial) |
| `/mapa` | Repo map |
| `/review` | Revisa diff |
| `/undo` `/redo` | Checkpoints |
| `/tema [nome]` | Mostra/troca o tema (aurora/solar/neon/mono) |
| `/pet` | Companheiro/XP da sessão |
| `/sair` | Sai |

### Variáveis úteis

| Env | Efeito |
|-----|--------|
| `DEEPSEEK_API_KEY` | Provider DeepSeek |
| `CODINGPRO_TEMA` | Tema visual (aurora/solar/neon/mono) |
| `CODINGPRO_PET` | Liga/desliga o pet (0/1) |
| `CODINGPRO_ASCII=1` | UI ASCII (CMD Windows / SSH legado) |
| `CODINGPRO_QUALITY_AUTOFIX` | Auto biome `--write` (default true) |
| `CODINGPRO_QUALITY_MAX_REPAIR` | Re-turnos IA no lint residual (default 1) |
| `--max-contexto N` | Orçamento de compactação (cap ~999k) |

---

## 5. Arquitetura em uma página

```
Usuário ──► CLI (packages/cli)
              │  config, tema, prompt TTY, doctor
              ▼
         runAgent (packages/core)
              │  system prompt + memória + plano ativo
              │  contextBudget → compactMessages
              ▼
         Provider DeepSeek (packages/llm)
              │  Pro / Flash (auto-effort)
              ▼
         ToolGate → tools (read/write/bash/repo_map/code_search/…)
              │
              ▼
         Workspace sandbox + checkpoints + quality (biome)
```

**Busca de código:** `repo_map` (alto nível) → `code_search` (índice SQLite local) → `read_file`.

---

## 6. Testes e qualidade

```bash
pnpm check          # gate completo offline
pnpm test:evals     # suite hardening (espaços, chave, rede, tetos)
pnpm smoke:deepseek # opt-in, rede + chave (bloqueado no CI)
```

- Vitest monorepo; cobertura global ≥90% linhas (per-file relaxado para ramos SQLite/I/O)
- CI GitHub Actions: Node 24.11/24.18 Linux + 24.18 macOS

---

## 7. Documentação

| Doc | Conteúdo |
|-----|----------|
| [GUIA-DO-USUARIO.md](./GUIA-DO-USUARIO.md) | Instalação, config, comandos, MCP, memória, vector, quality |
| [diario-desenvolvimento.md](./diario-desenvolvimento.md) | Histórico de incrementos |
| [CHECKLIST_MESTRE.md](../CHECKLIST_MESTRE.md) | Progresso F0–F9 |
| [planos/](../planos/) | Specs 01–16 (visão, arch, roadmap, DeepSeek, testes…) |
| **Este arquivo** | Estado consolidado da Fase 1 |

---

## 8. O que falta / pós-1.0

| Item | Dono |
|------|------|
| `npm publish` + setup &lt; 10 min em máquina limpa | Álvaro |
| 1h de uso real sem atrito anotado + QA visual dos 6 terminais | Álvaro |
| F7 Voz (whisper/Piper) | Release 1.1 |
| ~~Pet/XP, 4 temas~~ ✅ **entregues 2026-07-23**; Ctrl+O reasoning colapsado | Pós-1.0 |
| web-tree-sitter / ONNX embeddings densos | Upgrade F3/vector |
| Subagente subprocesso, background tasks | Upgrade F5 |
| Quality no `settings.json` (hoje env) | Melhoria |

Lista completa e cruzada com Fases 2/3: **[`LACUNAS_FASES.md`](LACUNAS_FASES.md)** (2026-07-24).

---

## 9. Commits recentes (linha do tempo da sessão)

| Commit | Entrega |
|--------|---------|
| `d112bcf` | Hardening + evals offline / fechamento F9 |
| `0a0f4bb` | Autocomplete `/` + spinner + banner |
| `d9e3ca0` | Checklist alinhado + plano auto-correção |
| `1e71710` | Auto-correção biome + tema ASCII CMD/SSH |
| `d523b2f` | `/plan` com Q&A e plano ativo na sessão |
| `48bca8c` | Status tokens/custo, `/compact`, auto-compact 1M |
| `6d005c1` | Busca vetorial local SQLite + `code_search` + `/index` |
| `45d6a44` | Front limpo (header, sem dump de comandos, spinner estável) |

---

## 10. Princípios que não abrimos mão

1. **DeepSeek only** para código (Pro/Flash); replay só em teste  
2. **Fail-closed** em paths, config, tools, provider  
3. **Sem shell** com paths do modelo (`execFile` + argv)  
4. **pt-BR** na UI; raciocínio interno do modelo livre  
5. **Local-first** (índice, memória, checkpoints no disco do usuário)  
6. **Nunca** vazar chaves/caminhos absolutos em erros  
