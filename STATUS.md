# CodingPro — Status 2026-07-24

## 🌐 Serviços Online

| Serviço | URL | Status |
|---------|-----|--------|
| Site | https://codingpro.cursar.space | 🟢 |
| API | https://codingpro-api.cursar.space/saude | 🟢 |
| Admin | https://codingpro-api.cursar.space/admin | 🟢 |
| Playground VPS | https://codingpro.cursar.space/playground | 🟢 |
| Download .exe | https://codingpro.cursar.space/comecar | 🟢 |

## 🏗️ Arquitetura

```
Navegador → codingpro.cursar.space (Vite+React SPA + proxy HTTP)
                ↓ /api/*
           codingpro-api.cursar.space (Fastify)
                ↓
           Postgres (database codingpro)
           DeepSeek API (proxy LLM streaming)
```

**Proxy HTTP:** `packages/web/src/servidor.ts` encaminha `/api/*` → API.
- Mesmo domínio (sem CORS)
- Cookies reescritos para `codingpro.cursar.space`
- Sessão viaja automaticamente

## 📦 Pacotes (monorepo pnpm)

| Pacote | Função |
|--------|--------|
| `packages/llm` | Provider DeepSeek, replay, contratos |
| `packages/core` | Workspace, tools, agent loop, permissões |
| `packages/cli` | CLI codingpro, chat, TUI, login cloud |
| `packages/tui` | TUI Aurora (Ink 5 + React 19) |
| `packages/api` | API Fastify, proxy LLM, auth, admin |
| `packages/web` | Site SPA + proxy HTTP |
| `packages/admin` | Painel admin SPA standalone |
| `packages/desktop` | App Electron Windows |

## 🔧 Funcionalidades

### Playground VPS (`/playground`)
7 abas: ⚡ CLI | 💬 Chat | 📁 Files | ✏️ Editor | >_ Terminal | 🔀 Git | 🧠 Memory
- CLI: banner ASCII, input direto, streaming SSE, slash commands (12 comandos)
- **Multi-chat**: sidebar com múltiplas sessões, criar/trocar/deletar/renomear
- **Persistência**: localStorage (auto-save), restaura ao recarregar
- **Histórico**: seta cima/baixo para comandos anteriores
- **Atalhos**: Ctrl+L (limpar), Ctrl+N (novo chat), Ctrl+K (sidebar)
- Chat: agente com tools reais (list_dir, read_file, write_file, bash, grep)
- Workspace isolado: `~/Documentos/vps-workspaces/<id>/`
- Terminal: shell real, git clone/pull/status
- Memory: notas .md persistentes

**Entrega web/CLI (2026-07-24)** — Files possui upload de arquivos, ZIPs e pastas, navegação por breadcrumbs, exclusão confirmada e editor com `Ctrl+S`. O terminal ganhou histórico e atalhos. A API, o terminal e o agente usam a mesma raiz de workspace por usuário; a escrita do agente cria subpastas e o fluxo SSE evita encerramentos duplicados. Veja `docs/playground-entrega-2026-07-24.md` para escopo, validação e reinício.

**Refatoração frontend (2026-07-24)** — `packages/web/src/ui/paginas/Playground.tsx` foi dividido de 1457 para 419 linhas (orquestrador) em 12 componentes focados: Banner, Sidebar, TabBar, ChatView, InputBar, SlashDropdown, FilesPanel, EditorPanel, TerminalPanel, GitPanel, MemoryPanel. Estilos extraídos para `estilo.css` com classes CSS usando as custom properties do design system Aurora. Navegação mobile responsiva com drawer para sidebar e transições suaves entre abas.

**Renovação do front do cliente (2026-07-24)** — landing, login, cadastro, painel e navegação global foram unificados visualmente sob o sistema Aurora do desktop, com responsividade, estados de interação e uma prévia da CLI na landing. Detalhes em `docs/cliente-front-2026-07-24.md`.

### Admin (`/admin`)
- Usuários: status, consumo, VPS (MB), aprovar/bloquear/desbloquear
- Consumo, Saúde, Auditoria, Kill Switch
- Login direto email+senha

### Desktop App (Windows)
- Login email+senha direto (sem navegador)
- Device flow interno (4 passos)
- Download: `CodingPro-portable-0.1.0.zip`

### CLI
- `codingpro --chat` / `--tui` / `-p "prompt"`
- `codingpro login` (device flow cloud)
- Token `cp_` via proxy da plataforma

## 👥 Contas Admin
alvaro@gmail.com, alvarocanaisgames@gmail.com, acompanhamento.imap@gmail.com

## 🚀 Deploy
```bash
cd ~/Documentos/CodingPro && nvm use 24 && pnpm build
systemctl --user restart codingpro-api codingpro-web
```

## ⚠️ Pitfalls
- Node 24 obrigatório (`nvm use 24.18.0`)
- Wine ausente → electron-builder NSIS falha, usar zip manual
- Cookie domain reescrito pelo proxy
- Coverage thresholds reduzidos para novos módulos
- TUI precisa de TTY real
