# F2-02 — UI Desktop (Aurora no Windows)

Mesma identidade da Fase 1 (doc `../planos/16`): gradiente esmeralda→ciano→violeta, trilho de timeline, verbos em pt-BR — agora com o que só uma GUI dá: clique, hover, painéis, imagens.

## Princípio

**Não é um site dentro de uma janela** — é uma ferramenta de trabalho densa, estilo app do Claude Code / VS Code: atalhos de teclado em tudo, tema escuro padrão, latência zero percebida (streaming direto do IPC).

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ⬡ CodingPro      [Projeto: AquiResolve ▾]        ─  □  ✕     │
├───────────┬──────────────────────────────────────────────────┤
│ Sessões   │  ◆ você: corrige o bug do login                  │
│ ● hoje    │  │                                               │
│   ontem   │  ◆ codingpro                                     │
│           │  ●─ Pensando… 12s          [colapsado, clique]   │
│ Projetos  │  ●─ Editando login.ts   ✓  [diff clicável]       │
│ Tarefas ⚙2│  ●─ Testando… ✓ 18/18                            │
│ Memória   │  │  Pronto: era atribuição em vez de comparação. │
│           ├──────────────────────────────────────────────────┤
│           │  ◆ digite… (Ctrl+Enter envia, @ arquivo, / cmd)  │
├───────────┴──────────────────────────────────────────────────┤
│ ⬡ ᶻᶻᶻ │ auto·alto │ v4-pro │ cache 82% │ US$ 0,03 │ ⎇ main   │
└──────────────────────────────────────────────────────────────┘
```

## Componentes além da TUI (o ganho de ser GUI)

| Componente | Especificação |
|---|---|
| **Diff viewer rico** | Lado a lado com scroll sincronizado, seleção de trecho p/ comentar ("mude só isso"), aplicar/rejeitar por bloco |
| **Aprovação de permissão** | Cards com botões (Permitir · Sempre · Negar · Negar e explicar) + preview do comando/arquivo; fila lateral quando subagentes pedem em paralelo |
| **Barra lateral** | Sessões (retomar com 1 clique), projetos recentes, tarefas em background com progresso, memória navegável/editável |
| **Painel de plano** | Modo planejamento vira documento lado a lado com checkboxes ao vivo durante a execução |
| **Arrastar e soltar** | Arquivo/imagem no chat = anexar caminho/conteúdo (imagem só quando provider tiver visão — capability flag) |
| **Terminal integrado** | Aba inferior opcional (xterm.js) — transparência total do que a IA executa |
| **Paleta de comandos** | `Ctrl+K` estilo VS Code: toda ação do app pesquisável em pt-BR |
| **Pet** | Canto da statusline, com animações discretas; conquistas viram toast |

## Regras de tradução Aurora → desktop

- Design tokens do doc 16 viram CSS variables (`--cp-primary: #34D399`…) — **um só lugar de verdade** para as cores nas duas interfaces (pacote `packages/theme` compartilhado).
- Tipografia: fonte de sistema p/ UI; monospace configurável p/ código (Cascadia Code padrão no Windows — já vem com ele).
- Gradiente aurora usado com parcimônia: título da janela, spinner, CTAs — não vira papel de parede.
- Temas: os mesmos 4 da Fase 1 + acompanhar tema claro/escuro do Windows (`prefers-color-scheme`).
- Acessibilidade: navegável 100% por teclado; contraste ≥ 4.5:1; screen reader nos controles principais.

## Checklist

- [ ] Wireframes das 5 telas (chat, diff, plano, sessões, config) p/ aprovação do Álvaro antes de codar
- [ ] Pacote `packages/theme` compartilhado TUI↔desktop
- [ ] Definir stack do renderer: React + Vite + Tailwind (tokens Aurora como preset)
- [ ] Protótipo clicável do fluxo principal (chat + permissão + diff) na W1
