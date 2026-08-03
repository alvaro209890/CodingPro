# Relatório de Testes e Correções — 2026-08-03

**Autor:** Hermes-server (via Álvaro)
**Escopo:** repo CodingPro (`/media/server/HD Backup/Servidores_NAO_MEXA/CodingPro`) — testado no PC `server-desktop` (Linux, Node 24.18.1)
**Resultado:** gate `pnpm check` **verde** (format, lint, typecheck, 770+ testes+cobertura, build, smoke de pacote)

---

## 1. Estado inicial

- Repo local estava **128 commits atrás** do `origin/master` → atualizado (HEAD `0cf1d36`).
- O gate `pnpm check` **estava vermelho no main** em 4 etapas:
  1. `format:check` — 6 arquivos fora do padrão Biome (core + desktop), do commit do W3 desktop.
  2. `lint` — 36 erros `noExplicitAny` (api/cli/desktop/web/tui) + 7 SVGs sem `<title>` + parâmetros não usados.
  3. `typecheck` (web) — 30 objetos de mensagem sem `id` (interface `Mensagem` exige; factory `novaMensagem` existia mas não era usada).
  4. `test:package` — smoke acusava imports externos do modo TUI (Ink ~30MB lazy).

## 2. Correções aplicadas (15 arquivos)

| Arquivo | Correção |
|---|---|
| `packages/api/src/rotas/agente.ts` | 4× `as any` → tipo `RespostaChat` + `Record<string, unknown>`; catch tipado; import `UsoBruto` (caminho `../proxy.js`) |
| `packages/api/src/rotas/cli.ts` | `req.body as any` → `Record<string, unknown>` |
| `packages/api/src/rotas/playground.ts` | 23× `as any` → `Record<string, unknown>`/`RespostaChat`; 5 catch tipados (`instanceof Error`/cast `Error & {stderr?}`) |
| `packages/cli/src/tui-runtime.ts` | tipos reais nas importações dinâmicas (Ink/App) |
| `packages/core/src/tool-groups.ts`, `tools/task.ts` | format Biome |
| `packages/desktop/src/renderer/App.tsx` | `as any` → `{ output?: string }` |
| `packages/desktop/.../FloatingInputDock.tsx` | 5 SVGs com `<title>` (a11y) |
| `packages/desktop/.../Header.tsx` | format Biome |
| `packages/desktop/.../Sidebar.tsx` | 2 SVGs com `<title>` (a11y) |
| `packages/tui/src/app.tsx` | `noNonNullAssertion` removido |
| `packages/web/src/servidor.ts` | parâmetro não usado → `_req` |
| `packages/web/src/ui/paginas/Playground.tsx` | 13× `as any` → tipos; 30 objetos de mensagem → `novaMensagem()` |
| `packages/web/src/ui/paginas/Sidebar.tsx` | `onToggle` não usado removido |
| `scripts/smoke-package.mjs` | externos lazy do TUI permitidos (`ink`, `react`, `ink-gradient`, `ink-big-text`, `react-devtools-core`) — modo `--tui` é opcional/lazy |

## 3. Testes executados (todos com resultado real)

### CLI (Fase 1)
- `--ajuda`, `--versao` (0.1.0), `--doctor` — ✅ (doctor 100% verde com env DeepSeek)
- Replay headless (`-p`) — ✅ respondeu "Olá! Como posso ajudar?"
- **DeepSeek real** `-p` — ✅ resposta "OK"
- **Agente headless** `--agente -p` com tools reais — ✅ listou diretório, tabela, custo US$ 0.0014, cache 48%, sessão salva
- **Chat interativo (PTY)** com DeepSeek real — ✅ banner Aurora, pet/XP, spinner, **criação de arquivo com diff + aprovação `[s/N/sempre]`**, checkpoint `/undo`, cache 97%
- Comandos: `/init` (CODINGPRO.md com detecção correta), `/mapa`, `/index` (SQLite criado), `/tema` (4 temas), `/pet`, `/undo` — ✅
- Fail-closed: chat sem TTY recusa; provider exige seleção explícita — ✅
- Binário global instalado via tarball (`codingpro` + `cpro`) — ✅

### Desktop (Fase 2)
- App Electron abre no Xvfb sem crash, preload API carregado — ✅ (validação em Windows limpo segue pendente — item W3)

### Plataforma (Fase 3) — validada localmente com Postgres 16 em Docker
- Migrations `0001/0002/0003` aplicadas; `/saude` com banco — ✅
- Cadastro (valida nome/senha/termos; admin automático por e-mail), login+cookie, `/api/eu`, tokens `cp_...` — ✅
- **Proxy `/v1/chat/completions` com DeepSeek real** — ✅; allowlist de modelos (gpt-4o → 400); sem token → 401; `/v1/models` — ✅
- Limites: `/api/consumo` medindo custo real, `/api/admin/consumo`, `/api/admin/saude`, `/api/admin/usuarios` — ✅
- TOTP 2FA (iniciar gera otpauth) — ✅
- Playground `/api/vps/chat` com reasoning — ✅
- RBAC: usuário normal bloqueado do admin — ✅

## 4. Notas de operação

- **Fase 3 roda no acer** (Postgres/túneis/systemd de produção ficam lá). O teste acima usou Postgres efêmero em Docker (porta 5432) — nada persistido no repo.
- `pnpm check` final: exit 0 (770+ testes, cobertura, build e smoke incluídos).
- Pitfall do Hermes confirmado: `write_file` corrompe identificadores de credencial — contornado com Python (nada de segredo entrou no repo).

## 5. Pendências (produto/ops, não bloqueiam o gate)

- `npm publish` (passo manual do Álvaro)
- QA visual humano nos 6 terminais
- Fase 2: validação do `.exe` em Windows limpo + auto-updater live
- Fase 3: SMTP/Turnstile/chave de produção/backup — ops no acer
- 107 warnings de lint restantes (regras recomendadas, não bloqueiam)
