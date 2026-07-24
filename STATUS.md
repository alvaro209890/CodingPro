# STATUS do Playground — 2026-07-24 (Cyber Glassmorphic v2.0 + Bug Fixes)

## Deploys do dia

| Data | Descrição | Status |
|------|-----------|--------|
| `2026-07-24` | Redesign Cyber Glassmorphic 2.0 — Partículas Canvas, Balão de Pensando, Task Tracker Card, CRT Terminal | ✅ |
| `2026-07-24` | Bug fixes: navegabilidade, timestamps, path traversal, memory leak, CSS keyframes, rename sidebar | ✅ |

## Estrutura atual

```
packages/web/src/ui/
├── App.tsx              # Roteamento — playground em tela cheia (early return)
├── estilo.css           # CSS global + Glassmorphic Design System (2800+ linhas)
├── api.ts               # fetch wrapper
├── componentes.tsx      # Componentes compartilhados
├── rotas.ts             # Router SPA
└── paginas/
    ├── Playground.tsx        # Container principal com CyberBackground + drag overlay global
    ├── PlaygroundTypes.ts    # Tipos centrais (Mensagem com timestamp, Session)
    ├── CyberBackground.tsx   # Partículas HTML5 Canvas & Cyber Grid 60 FPS
    ├── ThinkingBalloon.tsx   # Balão de Pensando com timer + raciocínio expansível
    ├── TaskTrackerCard.tsx   # Card de Tarefas igual ao App Desktop (status, ícones, diffs)
    ├── Banner.tsx            # Hero banner com cards de borda giratória (conic-gradient)
    ├── ChatView.tsx          # Chat + ThinkingBalloon + TaskTrackerCard + Slash Dropdown
    ├── FilesPanel.tsx        # Explorador com upload/drag-drop + icons por extensão
    ├── EditorPanel.tsx       # Editor com header + badge de linhas + Ctrl+S
    ├── TerminalPanel.tsx     # Terminal com efeito CRT scanlines + cursor neon + history fix
    ├── GitPanel.tsx          # Clone/status/log/pull/diff
    ├── MemoryPanel.tsx       # CRUD de memórias (.memory/)
    ├── Sidebar.tsx           # Sidebar de chats glassmorphic (desktop + mobile drawer a11y)
    ├── TabBar.tsx            # Abas com navegação por teclado (Arrow/Home/End)
    ├── SlashDropdown.tsx     # Dropdown de comandos slash (12 comandos)
    ├── Landing.tsx           # Landing page
    ├── Cadastro.tsx          # Cadastro
    ├── Entrar.tsx            # Login
    ├── Painel.tsx            # Dashboard do usuário
    ├── Comecar.tsx           # Guia de início
    └── EntrarDispositivo.tsx # Device flow
```

## Backend

```
packages/web/src/
└── servidor.ts    # HTTP server com proxy API + static files + path traversal seguro (sep)
```

## Funcionalidades implementadas

### Redesign & Visual Cyber Glassmorphic
- ✅ **Animated Background**: Partículas e grid cibernético em canvas 60 FPS
- ✅ **Glassmorphism com Blur**: Painéis, sidebar, topbar e modais com `backdrop-filter`
- ✅ **Micro-interações em Todos os Elementos**: Escala, transições, ripple, neon glow
- ✅ **Cards com Rotating Border Gradient**: Gradiente cônico animado
- ✅ **Scrollbar Cyber**: Barra de rolagem estilizada neon

### Chat & IA (/agent)
- ✅ **Balão de Pensando**: Contador de tempo, indicador de raciocínio e passos expansíveis
- ✅ **Card de Tarefas**: Igual ao app Desktop, com badges ✓/…/✗ e diffs
- ✅ **Mensagens com Slide + Fade**: Animações `@keyframes messageSlideFade`
- ✅ **Timestamps reais**: Cada mensagem registra seu horário de criação
- ✅ **Tools Reais**: `list_dir`, `read_file`, `write_file`, `edit_file`, `bash`, `grep`, `task`, `memory`

### Abas & Componentes (7 Abas)
- ✅ **Todas as 7 Abas Mantidas**: `cli`, `chat`, `files`, `editor`, `terminal`, `git`, `memory`
- ✅ **Mobile-First Bottom Nav**: Abas inferiores fixas no mobile com ícones + labels
- ✅ **Terminal CRT**: Efeito retro com scanlines, cursor neon e pending input preservado
- ✅ **Drag & Drop Global**: Upload de arquivos ao arrastar para qualquer área do playground
- ✅ **12 Slash Commands** com dropdown glassmorphic

## Bugs corrigidos nesta sessão

### Frontend

| # | Bug | Arquivo | Severidade |
|---|-----|---------|------------|
| 1 | **CSS keyframes ausentes** (`playgroundFadeIn`, `playgroundMsgIn`, `playgroundBlink`) causando animações silenciosamente quebradas | `estilo.css` | Média |
| 2 | **Memory leak** — `setInterval` do timer do ThinkingBalloon nunca era limpo ao desmontar o componente | `Playground.tsx` | Média |
| 3 | **React anti-pattern** — `setActiveId` chamado dentro de `setSessions` updater, causando conflitos em Concurrent Mode | `Playground.tsx` | Baixa |
| 4 | **Re-upload do mesmo arquivo** falhava — `<input type=file>` não resetava o `value` após seleção | `FilesPanel.tsx` | Média |
| 5 | **Condição redundante** no TaskTrackerCard que sempre avaliava para `tasks.length > 0` | `ChatView.tsx` | Baixa |
| 6 | **Timestamps falsos** — todas as mensagens mostravam a hora atual em vez da hora de criação | `ChatView.tsx`, `Playground.tsx`, `PlaygroundTypes.ts` | Crítica |
| 7 | **onChange + onInput duplos** no textarea de input — handlers redundantes causando re-render desnecessário | `ChatView.tsx` | Baixa |
| 8 | **Rename da sidebar não salva** — `onCancelRename` descartava o valor sem aplicar via `updateSession` | `Playground.tsx` | Crítica |

### Navegabilidade

| # | Melhoria | Arquivo | Tipo |
|---|----------|---------|------|
| 1 | **Navegação por teclado nas abas** — `ArrowLeft/Right/Up/Down + Home/End` para trocar abas via teclado | `TabBar.tsx` | A11y |
| 2 | **Terminal history preserva input pendente** — input não é perdido ao navegar com ↑↓ | `TerminalPanel.tsx` | UX |
| 3 | **Atalhos do terminal focam o input** — clicar em "pwd", "ls -la" etc. dá foco ao campo de comando | `TerminalPanel.tsx` | UX |
| 4 | **Sidebar overlay com ARIA** — `role="presentation"` e suporte a tecla Escape | `Sidebar.tsx` | A11y |

### Backend

| # | Bug | Arquivo | Severidade |
|---|-----|---------|------------|
| 1 | **Path traversal falha no Windows** — check usava `/` hardcoded enquanto `resolve()` retorna `\` no Windows | `servidor.ts` | Crítica |
