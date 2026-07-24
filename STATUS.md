# STATUS do Playground — 2026-07-24

## Deploys do dia

| Commit | Descrição | Hash CSS | Hash JS |
|--------|-----------|----------|---------|
| `ad7a814` | Aurora design system — Landing, Cadastro, Login, Painel | `PDypvPj9` | `4JeZcnij` |
| `702f073` | Playground fullscreen (sem header/footer) | `BpFLviwR` | `1i2KlAif` |
| `1343003` | Fix: height 100% (evita sobreposição Windows) | `C2LoRRZm` | `DX_C2qlc` |

## Estrutura atual

```
packages/web/src/ui/
├── App.tsx              # Roteamento — playground em tela cheia (early return)
├── estilo.css           # CSS global + .playground (1951 linhas)
├── api.ts               # fetch wrapper
├── componentes.tsx       # Componentes compartilhados
├── rotas.ts             # Router SPA
└── paginas/
    ├── Playground.tsx    # 830 linhas — TUDO self-contained
    ├── Banner.tsx        # Banner de boas-vindas redesenhado
    ├── ChatView.tsx      # Chat + input + slash commands
    ├── FilesPanel.tsx    # Explorador com upload/drag-drop
    ├── EditorPanel.tsx   # Editor com header + Ctrl+S
    ├── TerminalPanel.tsx  # Terminal com histórico + atalhos
    ├── GitPanel.tsx      # Clone/status/log
    ├── MemoryPanel.tsx   # CRUD de memórias
    ├── Sidebar.tsx       # Sidebar de chats (desktop+mobile)
    ├── TabBar.tsx        # Abas inferiores
    ├── SlashDropdown.tsx # Dropdown de comandos /
    ├── Landing.tsx       # Landing page
    ├── Cadastro.tsx      # Cadastro
    ├── Entrar.tsx        # Login
    ├── Painel.tsx        # Dashboard do usuário
    ├── Comecar.tsx       # Guia de início
    └── EntrarDispositivo.tsx  # Device flow
```

## Funcionalidades implementadas

### Chat (/agent)
- ✅ SSE streaming com campo `type`
- ✅ Tools reais: list_dir, read_file, write_file, bash, grep
- ✅ Animação de streaming (cursor piscando)
- ✅ Log de tools executadas
- ✅ Tratamento de erros descritivo

### Sidebar
- ✅ Múltiplos chats (CRUD completo)
- ✅ Persistência localStorage
- ✅ Renomear inline
- ✅ Mobile: drawer com overlay
- ✅ Email do usuário no footer

### Comandos /
- ✅ 12 comandos: clear, new, list, switch, delete, rename, export, history, context, agent, files, memory, help
- ✅ Dropdown com filtro
- ✅ Histórico de comandos (↑↓)
- ✅ Atalhos: Ctrl+L, Ctrl+N, Ctrl+K

### Files
- ✅ Breadcrumb navigation
- ✅ Upload drag & drop (arquivos + pastas)
- ✅ Deletar arquivo
- ✅ Abrir no editor

### Editor
- ✅ Header com nome do arquivo
- ✅ Salvar (botão + Ctrl+S)
- ✅ Placeholder informativo

### Terminal
- ✅ Header com status dot
- ✅ Botões de atalho (pwd, ls -la, git status)
- ✅ Histórico ↑↓
- ✅ Output scrollável
- ✅ Comando real no workspace

### Git
- ✅ Clone por URL
- ✅ Status, Log, Pull
- ✅ Output em div

### Memory
- ✅ Listar, criar, editar, carregar
- ✅ Arquivos .md no workspace

## Problemas conhecidos

1. **Layout**: playground usa `height: 100%` herdado de html→body→#raiz — funciona mas pode ter gaps em alguns navegadores
2. **CSS inline**: Playground.tsx tem 830 linhas, difícil manutenção — mas é preferência do Álvaro
3. **Sem animações modernas**: glassmorphism, gradients animados, micro-interactions não implementados
4. **API de visão offline**: Groq vision model `llama-4-scout` não disponível — fallback quebrado

## Próximo passo

Redesign completo do frontend com glassmorphism, animações, gradientes — prompt em `~/Área de trabalho/prompt-redesign-codingpro.md`
