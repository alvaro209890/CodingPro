# Lacunas das Fases 1, 2 e 3 — auditoria 2026-07-24

**Data:** 2026-07-24  
**Método:** cruzamento dos planos (`planos/`, `fase2-app-windows/`, `fase3-plataforma-web/`) com o código em `packages/*`.  
**Objetivo:** deixar explícito o que está **entregue**, o que é **versão simplificada** e o que **ainda falta** — sem confundir claim de checklist com implementação real.

Legenda: ✅ feito · 🔶 parcial / simplificado · ❌ não feito · 📌 pós-1.0 / diferido de propósito

---

## Visão rápida

| Fase | Núcleo do produto | Status real |
|------|-------------------|-------------|
| **1 — CLI** | Loop agêntico, DeepSeek, Aurora ANSI, empacotamento npm | 🟢 Completa no **plano de engenharia v1**; vários itens do plano original ficaram 🔶 ou 📌 |
| **2 — App Windows** | Electron + chat + permissões + sessões | 🟡 W0–W2 usáveis; **W3 (instalador/auto-update) incompleto** |
| **3 — Plataforma web** | Contas, proxy medido, limites, `codingpro login`, admin | 🟢 Núcleo P0–P3 **funcional** (stack diferente do plano); **P4 / hardening ainda aberto** |

Documento irmão: [ESTADO_PROJETO.md](ESTADO_PROJETO.md) (Fase 1), roadmaps em `fase2-app-windows/04` e `fase3-plataforma-web/04`.

---

## Fase 1 — CLI (`planos/`)

### O que está de fato entregue

- Pacotes `llm` / `core` / `cli`; bins `codingpro` / `cpro`
- DeepSeek V4 Pro/Flash + replay de teste; streaming; custo/cache
- Tools: `read_file`, `list_dir`, `grep`, `write_file`, `edit_file`, `bash`, `repo_map`, `code_search`, `remember`, `task`
- Sessões, checkpoints `/undo`/`/redo`, permissões, MCP stdio, skills, hooks
- Chat Aurora ANSI: 4 temas, pet/XP, autocomplete `/`, quality Biome com auto-correção
- Busca vetorial local (SQLite); `doctor`; `install.sh`; hardening offline no CI

### Lacunas / parcialidades relevantes

| Item do plano | Situação | Notas |
|---|---|---|
| TUI Ink full-screen (markdown/Shiki, tools, agente) | 🔶 | UX real é **ANSI/readline** (`chat-runtime`); `packages/tui` é mínima e sem tools |
| Temas Ink vs ANSI | 🔶 | CLI: aurora/solar/neon/mono; pacote `tui` ainda lista outras paletas |
| Subagentes via subprocesso + JSON-RPC + worktree | ❌ | Só in-process; sem `--agent-mode` |
| Background `/tasks` + notificação desktop | ❌ | Tool `task` espera resultado |
| Auto-effort completo (roteador Flash, `/effort`, níveis) | 🔶 | Heurística `fast`/`auto` simples |
| Quality loop com testes + reviewer automático | 🔶 | Biome pós-edição; sem suite automática |
| Repo map tree-sitter + PageRank | 🔶 | Heurística/regex + cache JSON |
| Memória FTS5 + consolidador LLM | 🔶 | Markdown + retrieval léxico |
| Tool `glob`, edit fuzzy, parse check pós-edit | ❌ | |
| Allowlist “esperta” persistente no settings | 🔶 | Padrão runtime é `ask`; approve-always não grava settings |
| `/plan` com aprovação formal + checklist vivo | 🔶 | Gera/salva plano; sem editor/`$EDITOR` formal |
| Compactação por resumo semântico | 🔶 | Truncamento estruturado, não resumo LLM |
| Onboarding wizard primeira execução | ❌ | Há `doctor` / login |
| Undercover completo (commits + estilo) | 🔶 | Diretriz no prompt; sem fluxo de commit |
| `codingpro -p --output-format json` | ❌ | |
| Voz local (whisper/Piper) | 📌 | Explicitamente pós-1.0 |
| `npm publish` + QA visual humano (6 terminais) | 📌 | Manual do Álvaro |

### Contradição a lembrar

Docs dizem “TUI finalizada”. A experiência completa está no **chat ANSI da CLI**, não no pacote Ink. Tratar `packages/tui` como protótipo/experimental até nova rodada.

---

## Fase 2 — App Windows (`fase2-app-windows/`)

### O que está de fato entregue

- `packages/desktop`: Electron + React + Vite; core no main; IPC; chat streaming
- Permissões com modal; sessões; paleta; cancel; workspace `/abrir`
- Temas Aurora no desktop; conta cloud (device flow / login direto após fix do cookie `cp_sessao`)
- Paths Windows + `taskkill`; CI ainda **não** valida Windows

### Lacunas / parcialidades relevantes

| Item do plano | Situação | Notas |
|---|---|---|
| Shell adapter PowerShell nativo (tool `shell`) | 🔶 | Tool continua `bash` + `shell: true`; terminal desktop usa `cmd`/`exec` |
| Diff lado a lado + aplicar/rejeitar por bloco | 🔶 | Viewer simples (linhas “depois”) |
| Terminal `xterm.js` + `node-pty` | ❌ | Input React + `exec` |
| Drag & drop do Explorer | ❌ | Claim antigo nos checklists; **não há handlers** no renderer |
| Pet visual GUI | ❌ | |
| Wizard onboarding (chave + git) | 🔶 | Tela de conta; sem wizard completo |
| `code_search` / `/index` no Electron | ❌ | Omitido (sem `node:sqlite` no Electron) |
| Árvore rica de subagentes na UI | 🔶 | Painel simples |
| **electron-builder / NSIS / portable testado** | 🔶 | Config no `package.json`; **`electron-builder` não está nas deps**; artefato `.exe` não verificável neste repo |
| Auto-updater + workflow Windows + Releases | ❌ | |
| Preload gerado (`build-preload.mjs`) vs source | 🔶 | Risco de APIs de conta ficarem fora do preload gerado — validar no build |

### Correção de narrativa (W3)

O marco “v1.0.0 .exe entregue” no roadmap antigo estava **adiante do código**. Status honesto: **app usável em dev**; distribuição Windows ainda é trabalho aberto.

---

## Fase 3 — Plataforma web (`fase3-plataforma-web/`)

### O que está de fato entregue (núcleo)

| Área | Implementação |
|------|----------------|
| Infra P0 | Tunnel `codingpro` / `codingpro-api`, systemd user units, portas 8700/8701 (ver `SETUP_P0.md`) |
| API | Fastify + SQL/`postgres.js` (não Drizzle); migrations; auth cookie `cp_sessao` |
| Proxy | `POST /v1/chat/completions`; allowlist Pro/Flash; medição; `402`; avisos 80/95%; kill switch |
| CLI cloud | `codingpro login`/`logout`/`conta`; `credenciais.json`; `CODINGPRO_TOKEN` |
| Site | Vite + React (`packages/web`): landing, cadastro, login, painel, device flow, playground |
| Admin | Vite SPA (`packages/admin`) em `/admin`: usuários, consumo, saúde, auditoria, kill switch |

### Desvios intencionais (não são “falta”, são stack diferente)

| Plano | Código |
|-------|--------|
| Next.js + Tailwind + shadcn (site) | Vite SPA + CSS próprio |
| Drizzle | SQL direto + `postgres.js` |
| argon2id | scrypt nativo |
| `/v1/chat` | `/v1/chat/completions` (OpenAI-compatible) |
| Admin shadcn + React Query + Router | CSS próprio + abas + fetch |
| Recharts | Gráfico próprio |

### Lacunas de produto / P4

| Item | Situação |
|---|---|
| 2FA TOTP (user + admin obrigatório) | ❌ |
| Turnstile no cadastro | ❌ |
| CSP / WAF rules documentadas | ❌ / parcial (HSTS em prod na API) |
| SMTP + verificação de e-mail automática | ❌ (código manual / visível ao admin) |
| Termos + privacidade LGPD | ❌ |
| Exportar/apagar conta (LGPD) | ❌ |
| Limite diário, `rate_rpm` / concorrência **por usuário** | ❌ |
| Override temporário de limite | ❌ |
| Cache-hit % e projeção no admin | ❌ |
| Alertas e-mail/WhatsApp | ❌ |
| Backup diário `pg_dump` + restore | ❌ |
| Chave DeepSeek de produção dedicada + teto | ❌ (docs pedem; validar no PC) |
| Teste de carga 10 usuários | ❌ |
| Beta fechado monitorado | ❌ |
| Preços/planos + asciinema real na landing | 🔶 |
| Confirmar DB/role `codingpro` no Postgres do acer | 🔶 (comandos em SETUP_P0; docs misturam feito/pendente) |

### Já corrigido em 2026-07-24 (não listar como lacuna)

- Playground passou a respeitar/gravar **limites** (`limites.ts` + agente)
- Device flow **atômico** (sem tokens órfãos)
- Cookie desktop `cp_sessao`
- Redirect pós-login (`?voltar=`)
- Total admin = soma real do mês (não só top 5)

---

## Prioridades sugeridas

1. **Fase 3 P4** — e-mail/2FA/Turnstile/backup/chave produção (se for abrir beta).  
2. **Fase 2 W3** — dependência `electron-builder`, build `.exe` verificável, CI Windows, corrigir preload gerado.  
3. **Fase 1 pós-1.0** — voz, tree-sitter, background tasks, Ink real (não bloqueia plataforma).

---

## Onde atualizar quando o status mudar

| Documento | Papel |
|-----------|--------|
| Este arquivo (`docs/LACUNAS_FASES.md`) | Fonte da verdade das lacunas |
| `fase2-app-windows/04_roadmap_checklist.md` | Checkboxes W0–W3 |
| `fase3-plataforma-web/04_roadmap_checklist.md` | Checkboxes P0–P4 |
| `docs/ESTADO_PROJETO.md` | Resumo Fase 1 + link para lacunas |
| `CHECKLIST_MESTRE.md` | Fase 1 detalhada + ponte para F2/F3 |
| `README.md` | Tabela das 3 fases (status resumido) |
