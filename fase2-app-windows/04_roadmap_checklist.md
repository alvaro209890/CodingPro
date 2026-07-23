# F2-04 — Roadmap da Fase 2 (App Windows)

Estimativas revistas em 2026-07-23 com base na velocidade real de desenvolvimento (F0→F9 em ~2 dias de trabalho concentrado). **Total: ~4–6 semanas** (não 6–9 como planejado originalmente).

## W0 — Fundações Windows no core (2 semanas)

- [x] Congelar/versionar o contrato de eventos core↔UI (`events.ts` v1.0.0) — 2026-07-23
- [x] Camada de paths por plataforma (`platform-paths.ts`, `%APPDATA%\CodingPro`, drives, UNC) — 2026-07-23
- [x] Shell adapter PowerShell/CMD + env allowlist estendido + taskkill no Windows — 2026-07-23
- [x] Downloader/resolução de binários por plataforma e tolerância em suíte de testes — 2026-07-23
- [x] Spikes e resiliência: 723 testes Vitest passando 100% nativamente em Windows — 2026-07-23
- [x] **Marco: a própria CLI da Fase 1 rodando nativa no Windows (100% verde)** — 2026-07-23

## W1 — Esqueleto Electron (1–2 semanas)

- [ ] `packages/desktop` no monorepo: Electron + React + Vite + Tailwind (preset Aurora)
- [ ] Core no main process + IPC tipado (contextBridge, isolamento ligado)
- [ ] Chat funcional com streaming + permissões com botões
- [ ] Pacote `packages/theme` compartilhado (tokens → CSS vars)
- [ ] **Marco: tarefa real completada pelo app com aprovações via clique**

## W2 — Ferramentas visuais (2 semanas)

- [ ] Diff viewer lado a lado com aplicar/rejeitar por bloco
- [ ] Barra lateral: sessões, projetos, tarefas background, memória
- [ ] Painel de plano com checkboxes ao vivo
- [ ] Paleta de comandos Ctrl+K em pt-BR
- [ ] Terminal integrado (xterm.js + node-pty)
- [ ] **Marco: wireframes aprovados pelo Álvaro virados app navegável**

## W3 — Acabamento (1–2 semanas)

- [ ] Temas (4 + acompanhar Windows claro/escuro), pet, toasts de conquista
- [ ] Drag-and-drop, atalhos completos, acessibilidade por teclado
- [ ] Onboarding gráfico (wizard da CLI adaptado)
- [ ] **Marco: sessão de 1h de uso real no Windows sem atrito anotado**

## W4 — Distribuição (1 semana)

- [ ] electron-builder NSIS + electron-updater via GitHub Releases
- [ ] CI release-desktop.yml + smoke test em VM
- [ ] Roteiro de QA no PCQUE001IMAP/VM executado
- [ ] Página de download com requisitos e aviso SmartScreen explicado
- [ ] **Marco: instalar → atualizar N→N+1 → desinstalar, tudo limpo**

## Riscos específicos da fase

| Risco | Mitigação |
|---|---|
| Sintaxe PowerShell quebrar heurísticas de comando do modelo | System prompt ganha seção Windows; evals de shell PS dedicados |
| Antivírus/SmartScreen assustando usuário | Beta fechado sem assinatura + certificado antes do público |
| Diferenças de path quebrarem repo map/checkpoints | Suite da lista de tortura rodando em runner Windows no CI desde W0 |
| Electron pesado em máquina fraca | Medir RAM alvo; desligar animações em hardware fraco (tema Sóbrio) |
