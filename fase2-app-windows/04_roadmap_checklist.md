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

- [x] `packages/desktop` no monorepo: Electron + React + Vite + CSS Aurora — 2026-07-23
- [x] Core no main process + IPC tipado (contextBridge, isolamento ligado) — 2026-07-23
- [x] Chat funcional com streaming + permissões com botões interativos — 2026-07-23
- [x] Estilos e tokens Aurora integrados em `aurora.css` — 2026-07-23
- [x] **Marco: esqueleto completo do app desktop compilado e integrado** — 2026-07-23

### Correções pós-marco (revisão de 2026-07-23)

O esqueleto compilava e abria, mas a revisão encontrou 4 bugs que quebravam o produto na prática
(nenhum aparecia no `tsc`, só rodando o fluxo de ponta a ponta):

- **`vite build` apagava o main/preload compilados.** `tsc` e `vite build` escreviam em `dist/`
  com `emptyOutDir: true`; o segundo passo do script `build` apagava o primeiro. O app empacotado
  não tinha `dist/main/index.js` (o `main` do `package.json`). Corrigido: renderer agora sai em
  `dist/renderer`, main/preload seguem em `dist/main`/`dist/preload`.
- **Aprovação de permissão nunca resolvia.** O main gerava um `requestId` para correlacionar a
  resposta da UI, mas o evento `permission-request` não o carregava — a UI inventava outro id ao
  exibir o modal, então a resposta nunca batia com a promessa pendente no main. Qualquer tool com
  efeito (`write_file`, `bash`, `edit_file`) travava o app para sempre no aviso de aprovação.
  Corrigido: `requestId` entrou no contrato `events.ts` (v1.1.0, mudança aditiva) e a UI ecoa o
  id recebido em vez de gerar o seu.
- **Conversa sem memória entre mensagens.** Cada `send-message` criava workspace/registry/gate do
  zero e mandava só `[mensagemDoUsuario]` para o `runAgent` — sem o histórico dos turnos
  anteriores. "Sempre permitir" também não durava além de uma mensagem pelo mesmo motivo. Corrigido:
  o main mantém uma sessão de chat (workspace/gate/histórico) por diretório de projeto, reaproveitada
  entre turnos, no mesmo padrão do chat da CLI.
- **Chave de API com fallback silencioso.** `DEEPSEEK_API_KEY ?? "dummy-dev-key"` gerava erro
  confuso de rede em vez de avisar que faltava configurar. Corrigido: mesma checagem clara da CLI
  antes de instanciar o provider.
- Lint/format zerados no pacote (`useButtonType`, `noArrayIndexKey`, import de tipo, dependência
  desnecessária de `useEffect`) e um `import` morto em `events.ts`.

## W2 — Ferramentas visuais (2 semanas)

- [x] Primeira fatia da barra lateral: seletor de pasta do projeto (`dialog.showOpenDialog`),
      substitui o `process.cwd()` fixo do Electron — 2026-07-23
- [ ] Restante da barra lateral: sessões, tarefas background, memória
- [ ] Diff viewer lado a lado com aplicar/rejeitar por bloco
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
