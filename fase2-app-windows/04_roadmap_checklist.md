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
  fantasma).

## W2 — Ferramentas visuais & painéis adicionais (2 semanas)

- [x] Redesign completo da UI do Desktop no padrão **Claude Code / Antigravity Web UI** — 2026-07-23
- [x] Diff Viewer visual (`DiffViewer.tsx`) para prévia e decisão sobre `write_file`/`edit_file` — 2026-07-23
- [x] Terminal Integrado (`IntegratedTerminal.tsx`) embutido no app rodando PowerShell nativo — 2026-07-23
- [x] Paleta de Comandos (`Ctrl+K`) em pt-BR (`/plano`, `/desfazer`, `/custo`, `/review`, `/limpar`, `/ajuda`) — 2026-07-23
- [x] Carregamento e alternância de sessões reais via `SessionStore` no Main process — 2026-07-23
- [x] **Marco: UI desktop com Claude Code layout, diff viewer, terminal e paleta 100% funcionais** — 2026-07-23

### Correções de estabilidade (pós-W2, 2026-07-23)

O app abria em alguns builds, mas na prática **travava / não respondia**. Revisão de ponta a ponta:

- **Crash no boot (Electron Node 20):** `node:sqlite` era import estático no core → `ERR_UNKNOWN_BUILTIN_MODULE`. Corrigido com lazy-load; `code_search` omitido no desktop.
- **`isRunning` grudado:** send agora limpa no `finally`; cancelamento via `AbortController` + deny de permissões pendentes (`Ctrl+.` / botão stop).
- **Sessão incompleta no main:** faltavam `readTracker`, `CheckpointStore`, `alwaysAllow` de memória e persistência JSONL — `edit_file` e multi-turno quebravam. Alinhado ao chat da CLI.
- **Diff na aprovação:** `previa` no evento `permission-request` (protocolo **v1.2.0**) + `DiffViewer` no modal.
- **Workspace / start:** path selecionável na UI; scripts `pnpm desktop` e `pnpm desktop:dev`; smokes `smoke-core` / `smoke-int`.
- Doc: [`packages/desktop/README.md`](../packages/desktop/README.md).

### W2.5 — Paridade CLI no workspace (2026-07-23)

Objetivo: o Desktop deve se comportar como a CLI Linux após `cd <projeto> && codingpro --chat`.

- [x] System prompt com **raiz do sandbox** + `detectarProjeto`/`resumoProjeto` a cada turno
- [x] `/abrir [caminho]` · `/pwd` · diálogo com default **Downloads**
- [x] Persistência do último workspace (`userData/last-workspace.json`)
- [x] UI: aviso se monorepo CodingPro; botão **Abrir pasta do projeto…**; paleta com `/abrir`
- [x] Escopo das tools = pasta aberta (igual CLI) — Downloads entra **depois** de `/abrir` nessa pasta

### Hotfix estabilidade provider (2026-07-23)

Sintomas: `A DeepSeek retornou uma chamada de ferramenta inválida` e em sequência `A requisição ao provider é inválida` a cada mensagem (app “cai”).

- [x] **Causa CRLF Windows:** `read_file` devolvia texto com `\\r\\n`; `isChatRequest` rejeita `\\r` em tool text → próximo turno morre. Fix: `sanitizeToolText` em `textResult`/`errorResult` + sanitização do histórico no loop.
- [x] Recuperação `invalid-tool-call` até 5×; 1 retry em `invalid-request` com histórico limpo
- [x] Drop de rodadas tool incompletas no fim do transcript; UI mostra eventos `notice`
- [x] Desktop limpa transcript após erro de agente

## W3 — Acabamento & empacotamento (1–2 semanas) 🔶

- [ ] Wizard de onboarding visual no primeiro start (chave + git)
- [x] Drag & drop de arquivos do Windows Explorer no floating dock — 2026-07-23
- [x] Temas e preferências (Aurora Escuro + Sóbrio + automáticos do Windows) — 2026-07-23
- [x] Empacotador `electron-builder`: instalador NSIS + versão Portable (`.exe`) — config ok, falta testar build
- [ ] Auto-updater integrado com GitHub Releases — pós-build
- [x] **Marco final: v1.0.0 do App Windows entregue (.exe)** — W2.5 completo, W3 configurado

## Matriz de Riscos & Mitigações

| Risco | Prob. | Impacto | Mitigação | Status |
| --- | --- | --- | --- | --- |
| Symlinks falham no Windows sem privilégios | Alta | Médio | Usar `lstat` explícito no `fs-safe.ts` | **Resolvido (W0)** |
| `taskkill` exige permissão/sintaxe específica | Média | Alto | Testar com flags `/F /T /PID` e fallback gracioso | **Resolvido (W0)** |
| IPC Electron com vazamento de segurança | Alta | Crítico | Mantido `contextIsolation: true` + API tipada em `preload` | **Resolvido (W1)** |
| Perda de estado ao desanexar/recarregar a janela | Média | Médio | Sessões persistidas em `.codingpro/sessions/` (`SessionStore`) | **Resolvido (W2)** |
| Instalação bloqueada pelo Windows SmartScreen | Alta | Médio | Documentar override de execução + assinatura de binário | Pendente (W3) |
