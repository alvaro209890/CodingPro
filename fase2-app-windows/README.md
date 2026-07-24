# CodingPro — Fase 2: App Windows

> Planejamento da **Fase 2** (separado da Fase 1, que vive em `../planos/`).
> **Pré-requisito:** Fase 1 (CLI) funcional.

**Status:** 🟡 **W0–W2 usáveis** · **W3 (distribuição) incompleto** — revisado em 2026-07-24  
Lacunas: [`docs/LACUNAS_FASES.md`](../docs/LACUNAS_FASES.md) · checklist: [`04_roadmap_checklist.md`](04_roadmap_checklist.md)

**App:** [`packages/desktop/`](../packages/desktop/)

## O que é

Aplicativo desktop Windows (Electron) com o mesmo motor da CLI (`packages/core` + `packages/llm`) e UI gráfica Aurora: chat, diffs, aprovações, sessões, workspace.

## Escopo vs realidade (2026-07-24)

| Item | Plano | Realidade |
|------|-------|-----------|
| Chat + permissões + sessões + paleta | ✅ | ✅ |
| Diff visual | Lado a lado + por bloco | 🔶 Viewer simples |
| Terminal | xterm + node-pty + PowerShell | 🔶 Input + `exec`/`cmd` |
| Conta cloud (Fase 3) | Depois | ✅ Device flow / login (cookie `cp_sessao`) |
| Instalador `.exe` + auto-update | ✅ | ❌ Config parcial; builder não nas deps |
| Drag & drop Explorer | ✅ | ❌ Não encontrado no renderer |
| Pet visual | ✅ | ❌ |

## Docs desta fase

| Doc | Conteúdo |
|---|---|
| [01_arquitetura.md](01_arquitetura.md) | Electron + core reaproveitado |
| [02_ui_desktop.md](02_ui_desktop.md) | Aurora no desktop |
| [03_distribuicao.md](03_distribuicao.md) | NSIS / portable / updater (ainda plano) |
| [04_roadmap_checklist.md](04_roadmap_checklist.md) | W0–W3 com status honesto |
