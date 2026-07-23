# CodingPro — Fase 2: App Windows

> Planejamento da **Fase 2** (separado da Fase 1, que vive em `../planos/`).
> **Pré-requisito duro: a Fase 1 (CLI) estar 100% funcional.** Nada daqui começa antes.

**Status:** 📋 Planejado em 2026-07-22 · revisado em 2026-07-23 (pós-conclusão da Fase 1)

**Pré-requisito atendido:** a Fase 1 (CLI local) está funcional com 3 pacotes (`llm`, `core`, `cli`), 591 testes, 95.5% de cobertura, e validada ao vivo com DeepSeek.

## O que é

Um **aplicativo desktop para Windows** com a mesma proposta do app desktop do Claude Code: o motor do CodingPro (o mesmo `packages/core` + `packages/llm` da CLI) dentro de uma interface gráfica — janela própria, chat, diffs clicáveis, aprovações com botões, gerenciamento de projetos/sessões — para quem não vive no terminal.

**Por que é viável barato:** o core é desacoplado da TUI (readline) e conversa por **eventos JSON tipados** via `ProviderEvent`/`AgentEvent`/`ToolResult` (já implementados e estáveis). O app Windows é "só" um novo consumidor desses eventos via IPC; **zero reescrita do cérebro** — inclusive o `packages/llm` inteiro é reaproveitado.

## Escopo da Fase 2

- ✅ App desktop Windows (instalador .exe, auto-update)
- ✅ Suporte Windows **nativo** no core (shell PowerShell, paths) — a Fase 1 é Linux/macOS
- ✅ UI gráfica com a identidade Aurora adaptada (mesmos design tokens → CSS)
- ✅ Mesma config/API da CLI (na Fase 2 ainda é chave direta; contas/limites são Fase 3)
- ❌ Site, contas, cobrança, limites → **Fase 3**
- ❌ Versões macOS/Linux do app (o desktop Linux/macOS já é bem servido pela CLI; avaliar depois)

## Docs desta fase

| Doc | Conteúdo |
|---|---|
| [01_arquitetura.md](01_arquitetura.md) | Electron + core reaproveitado, processos, suporte Windows nativo |
| [02_ui_desktop.md](02_ui_desktop.md) | Aurora no desktop: telas, componentes, interações |
| [03_distribuicao.md](03_distribuicao.md) | Instalador, auto-update, assinatura, requisitos de máquina |
| [04_roadmap_checklist.md](04_roadmap_checklist.md) | Fases W0–W4 com checklists |

## API para desenvolvimento/testes

Igual à Fase 1: a chave DeepSeek do Hermes deste PC — `DEEPSEEK_API_KEY` em `~/.hermes/.env` (**referenciar o arquivo, nunca copiar o valor para docs/repo/commits**).
