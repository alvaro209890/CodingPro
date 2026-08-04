# CodingPro Desktop (Fase 2)

App Windows Electron que reutiliza o core da CLI (`@codingpro/core` + `@codingpro/llm`) no **main process**, com UI React/Vite (Aurora) no renderer e IPC tipado via `contextBridge`.

## Requisitos

- Node.js 24 (CLI/workspace) — o app em si roda no Node embutido do Electron 34 (Node 20)
- pnpm 10.34.4
- **App instalado:** conta CodingPro Cloud aprovada e com créditos liberados pelo administrador.
- **Somente no desenvolvimento:** `DEEPSEEK_API_KEY` em um destes locais (sem commitar):
  - `.codingpro/.env` na raiz do monorepo
  - `%USERPROFILE%\.config\codingpro\deepseek.env`
  - variável de ambiente

## Comandos

Na raiz do monorepo:

```bash
pnpm desktop:build   # core + llm + desktop
pnpm desktop         # sobe o .exe Electron a partir de dist/
pnpm desktop:dev     # Vite HMR + Electron (VITE_DEV_SERVER_URL)
```

No pacote:

```bash
pnpm --filter @codingpro/desktop build
pnpm --filter @codingpro/desktop start
pnpm --filter @codingpro/desktop dev
```

Smokes (offline / integração):

```bash
node packages/desktop/scripts/smoke-core.mjs
node packages/desktop/scripts/smoke-int.mjs   # usa DeepSeek se houver chave
```

## Arquitetura

```text
packages/desktop/
  src/main/index.ts       # Electron main: sessão, runAgent, permissões, IPC
  src/preload/index.ts    # contextBridge → window.codingproAPI
  src/renderer/           # React UI (chat, terminal, paleta, diff)
  scripts/start.mjs       # launcher produção
  scripts/dev.mjs         # launcher dev
  dist/main|preload|renderer/
```

Contrato de eventos: `@codingpro/core` → `events.ts` (**v1.5.0**), com `requestId`, `previa?`, `usage-updated` e `subagent-event`.

## O que funciona

| Recurso | Status |
| --- | --- |
| Chat com streaming DeepSeek V4 Flash | ✅ |
| Histórico multi-turno (sessão no main) | ✅ |
| Aprovação de efeitos + diff (`write_file`/`edit_file`) | ✅ |
| Cancelar execução (botão / `Ctrl+.` / `/cancelar`) | ✅ |
| Comandos locais `/ajuda` `/abrir` `/pwd` `/limpar` `/custo` `/desfazer` `/refazer` `/checkpoint` | ✅ |
| Checkpoints + `readTracker` (mesma semântica da CLI) | ✅ |
| Escolher pasta do projeto (default Downloads; último path persistido) | ✅ |
| System prompt com raiz do sandbox + detecção de projeto | ✅ |
| Sessões JSONL agrupadas por projeto (listar / carregar / gravar) | ✅ |
| Métricas de contexto/custo e subagentes ao vivo | ✅ |
| Atualização assistida no NSIS e aviso manual no portátil | ✅ |
| Terminal integrado (timeout 60s) | ✅ |
| Paleta `Ctrl+K` | ✅ |
| `code_search` (node:sqlite) | ⚠️ só na CLI Node ≥22.5; omitido no Electron 34 |

## Paridade com a CLI Linux

Na CLI você faz:

```bash
cd ~/Downloads/MeuApp
codingpro --chat
```

No Desktop o equivalente é:

1. Botão **Abrir pasta do projeto…** / **Pasta** / comando `/abrir` (diálogo abre em Downloads)
2. Ou `/abrir C:\Users\…\Downloads\MeuApp`
3. Depois pedir: “liste a estrutura”, “explique o README”, etc.

As tools **só enxergam a pasta aberta** (sandbox do `Workspace`) — se a pasta for o monorepo CodingPro, o agente não “vê” Downloads até você abrir essa pasta. Isso é o mesmo modelo da CLI, não um bloqueio do Windows.

## Bugs corrigidos (2026-07-23)

0. **Preload ESM não carrega (app abre mas não responde)** — com `"type":"module"`, Electron falha no preload `.js` (`ERR_UNSUPPORTED_ESM_URL_SCHEME` / protocol `electron:`). Sem `window.codingproAPI` a UI fica morta. Fix: gerar `dist/preload/index.cjs` (CJS) via `scripts/build-preload.mjs` e apontar `webPreferences.preload` para o `.cjs`. Verificar log: `[codingpro] preload API: object`.

1. **App não abria no Electron** — import estático de `node:sqlite` no core derrubava o main (Electron = Node 20). SQLite passou a ser lazy; `code_search` é omitido no desktop.
2. **UI “travava” / não respondia** — `isRunning` só limpava em eventos; agora também no `finally` do send. Cancelamento com `AbortController` + deny de permissões pendentes.
3. **Sessão sem memória / tools incompletas** — main recria sessão com `readTracker`, `CheckpointStore`, `alwaysAllow` de memória e transcript persistido (antes só `[user]` solto, sem tracker → `edit_file` quebrava).
4. **Permissão sem diff** — prévia `resolverPreviaDeEscrita` enviada no evento e exibida no `PermissionModal` via `DiffViewer`.
5. **Workspace errado** — `process.cwd()` do Electron era frágil; há `selectedWorkspacePath`, diálogo “Pasta” e path no send.
6. **Comandos da paleta eram prompts cegos** — `/limpar`, `/custo`, `/desfazer` etc. tratados no main sem LLM.
7. **Terminal podia ficar em “executando”** — timeout + try/finally no renderer.
8. **Sem script de start** — `pnpm desktop` / `scripts/start.mjs`.
9. **“Não tenho acesso a Downloads”** — o app abria no monorepo CodingPro e o modelo falava como se só existisse essa pasta. Fix W2.5: prompt com raiz explícita, `/abrir`/`/pwd`, default Downloads no diálogo, último workspace salvo, UI de home com botão de abrir projeto.
10. **“Requisição ao provider é inválida” em cascata (Windows)** — após `read_file`, tool results com `

` invalidavam `isChatRequest` no turno seguinte. Fix: `sanitizeToolText` + histórico sanitizado no loop + recovery de `invalid-tool-call`/`invalid-request`.


## W3 (em andamento) — status 2026-07-24

Lacunas detalhadas: [`docs/LACUNAS_FASES.md`](../../docs/LACUNAS_FASES.md).

- [x] **Temas**: aurora/solar/neon/mono + persistência
- [ ] Wizard de onboarding (chave + git)
- [ ] Drag & drop de arquivos (não implementado no renderer)
- [x] **Empacotador `electron-builder`**: portable `.zip` em `release/`; servido pelo site em `/downloads/`
- [ ] Auto-updater + CI Windows
- [ ] Validar preload gerado inclui APIs de conta

### Publicar download no site (VPS)

1. Gerar artefatos: `pnpm desktop:build` (ou copiar `CodingPro-portable-0.1.0.zip` para `packages/desktop/release/`).
2. Garantir `CODINGPRO_DOWNLOADS_DIR` apontando para essa pasta (padrão relativo ao monorepo).
3. `pnpm plataforma:build` + `systemctl --user restart codingpro-web`.
4. Validar: `curl -fsSI https://codingpro.cursar.space/downloads/CodingPro-portable-0.1.0.zip`.

Constantes compartilhadas no front: `packages/web/src/ui/downloads.ts`.

Ver `fase2-app-windows/04_roadmap_checklist.md`.

## Atalhos

| Atalho | Ação |
| --- | --- |
| `Enter` | Enviar |
| `Shift+Enter` | Nova linha |
| `Ctrl+K` | Paleta de comandos |
| `Ctrl+.` | Cancelar execução |
| `Esc` | Fecha paleta / cancela no dock |

## Limitações conhecidas (W3+)

- Sem onboarding visual da API key
- Diff viewer simples (não lado a lado / por bloco)
- Terminal via `exec`/`cmd` (não xterm + node-pty)
- `code_search` vetorial só na CLI até Electron com Node ≥ 22.5 (ou bundling de sql.js)
- Pet visual da CLI sem equivalente GUI

## Segurança

- `contextIsolation: true`, `nodeIntegration: false`
- Credenciais só no main (preload não expõe fs/env)
- Efeitos passam por `PermissionController` (fail-closed)
- Terminal embutido bloqueia multilinha; timeout 60s

## Telas

| Tela | Função |
|---|---|
| Conversa | Chat com streaming, raciocínio recolhível, timeline de ferramentas e subagentes |
| Configurações | Temas, auto-aprovar, reduzir animações, skills, atalhos, versão |
| Terminal | Painel inferior com histórico de comandos, na pasta aberta |

## v1.2.0 — projetos, observabilidade e atualização (2026-08-04)

- Conversas agrupadas por pastas abertas pelo usuário, com troca atômica de workspace/sessão.
- Painel estruturado de subagentes ativos e concluídos, sem expor raciocínio interno bruto.
- Ledger deduplicado e contexto/custo atualizados durante a execução.
- Recuperação DeepSeek normaliza chamadas seguras antes do schema e consolida tentativas inválidas.
- Status detalhado clicável, marca CP Aurora e atualização assistida com duas confirmações.

Relatório: [`docs/CODINGPRO-DESKTOP-1.2.0.md`](../../docs/CODINGPRO-DESKTOP-1.2.0.md).

## v1.1.1 — login Cloud obrigatório no pacote (2026-08-03)

- O executável distribuído ignora `DEEPSEEK_API_KEY` encontrada no computador e exige login.
- Aprovação e créditos passam sempre pelo proxy CodingPro Cloud no produto instalado.
- Chave própria permanece disponível apenas para desenvolvimento no monorepo.
- Tela de login refeita com layout responsivo, campos completos e estados acessíveis.

Relatório: [`docs/CORRECAO-LOGIN-DESKTOP-1.1.1.md`](../../docs/CORRECAO-LOGIN-DESKTOP-1.1.1.md).

## v1.1.0 — auditoria e refino do renderer (2026-08-03)

Relatório completo: [`docs/RELATORIO-DESKTOP-1.1.0.md`](../../docs/RELATORIO-DESKTOP-1.1.0.md).

- **Fila de permissões** — dois pedidos simultâneos (subagentes em paralelo) faziam o segundo
  sobrescrever o primeiro, que nunca era respondido: o turno travava para sempre. Agora é fila.
- **Controles falsos removidos** — botão “+” sem `onClick`, chip de modelo sem ação e “Search”
  que não abria a paleta.
- **Dados inventados removidos** — usuário/plano fixos no código, branch `master` fixa, versão
  `v0.1.0` errada, “Skills: Ativo” sem origem, quatro amostras de tema idênticas.
- **Catálogo de comandos unificado** — dock (15) e paleta (10) divergiam do catálogo real (21);
  `/doctor`, `/skills`, `/memory`, `/index` e `/nova` não apareciam.
- **Conta** — logout no app (antes `contaLogout` nunca era chamado) e auto-aprovar lido do main.
- **Teclado e a11y** — paleta navegável por setas, `Esc` nega a permissão (fail-closed), foco
  visível, `prefers-reduced-motion` + interruptor próprio.
- **Modelo não aparece mais no app** — decisão de produto: nada de provedor/modelo na UI.
- **Token manual acabou** — o padrão é a conta CodingPro Cloud; a emissão é automática pelo
  device flow. `POST /api/tokens` foi removida; a web mostra “Dispositivos” conectados.
