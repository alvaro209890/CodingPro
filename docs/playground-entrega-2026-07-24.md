# Entrega do Playground web — 24 de julho de 2026

> **Arquivo histórico.** O Playground e as rotas `/api/vps/*` foram **removidos em 2026-08-03**
> (`92e2ab1`). O front de trabalho passou a ser o **app desktop** e a **CLI**. O site mantém
> conta, painel, device flow e downloads. Ver [`STATUS.md`](../STATUS.md) e
> [`RELATORIO-CORRECOES-2026-08-03-B.md`](RELATORIO-CORRECOES-2026-08-03-B.md).

Este documento consolida a evolução entregue no Playground do site e os procedimentos para publicar a versão no VPS.

## Escopo entregue

### Experiência de CLI e chat

- A aba CLI passou a usar a mesma linguagem Aurora do aplicativo desktop: fundo escuro em camadas, tipografia monoespaçada, cards de início, animações de entrada, cursor de streaming e estados de atividade.
- O usuário pode criar, trocar, renomear, exportar e apagar sessões. As sessões são mantidas no `localStorage` e restauradas ao recarregar a página.
- Os comandos `/clear`, `/new`, `/list`, `/switch`, `/delete`, `/rename`, `/export`, `/history`, `/context`, `/agent`, `/memory` e `/help` permanecem disponíveis pela própria entrada da CLI.
- Foram mantidos os atalhos `Ctrl+L`, `Ctrl+N` e `Ctrl+K`.

### Terminal web

- O terminal agora possui cabeçalho de estado, indicador visual, atalhos para `pwd`, `ls -la` e `git status`, botão de limpar e histórico de comandos da sessão com as setas para cima/baixo.
- Todo comando é enviado ao endpoint `/api/vps/terminal`, que executa no workspace do usuário com limite de tempo e saída.

### Arquivos, editor e uploads

- A aba Files agora tem exploração de diretórios, breadcrumbs, atualização, abertura de arquivos, exclusão confirmada e editor com salvamento por `Ctrl+S`.
- Arquivos, ZIPs e pastas selecionadas no navegador podem ser enviados ao workspace isolado. Estruturas de pasta escolhidas pelo seletor de diretório são preservadas.
- O endpoint `POST /api/vps/upload` recebe `multipart/form-data`, aceita até 1.000 arquivos por envio e limita cada arquivo a 512 MB.

### Backend e agente

- A aba Files, o terminal e o agente usam a mesma raiz de workspace por usuário: `~/Documentos/vps-workspaces/<id>/`.
- O módulo `packages/api/src/workspace.ts` centraliza `raizWorkspace()` e `dirUsuario()` para playground, agente, admin e CLI.
- A variável opcional `CODINGPRO_WORKSPACE_ROOT` permite alterar essa raiz sem editar código.
- `CODINGPRO_CLI_PATH` e `CODINGPRO_NODE_BIN` permitem sobrescrever o binário da CLI e do Node no endpoint `/api/vps/cli`.
- A IA cria automaticamente diretórios-pai ao usar `write_file`.
- A resolução de caminhos bloqueia travessia de diretórios e impede que links simbólicos levem a leituras fora do workspace.
- O fluxo SSE do agente emite uma conclusão única por execução e devolve uma mensagem clara caso a tarefa ultrapasse o limite de cinco iterações.

### Atualização da tarde (24/07)

- **Files**: navegador refinado (contagem, atalho Repos, badges, dropzone recolhível).
- **Chat**: markdown nas respostas da IA; ferramentas expansíveis com saída completa.
- **Git**: clone em `repositorios/<repo>`; lista atualiza e abre Files após clone.
- **Auto-título**: chats `chat-XX` renomeados pela conversa (heurística + IA).
- **Navegação**: botão **← Painel** no topo do workspace (`/painel`).
- **API**: `repositorios/` pasta padrão; fix em `write` para arquivos novos.

### Noite (24/07) — Raciocínio + download Windows

- **Balão de raciocínio**: timeline, progresso, timer e estados live/concluído (`ThinkingBalloon.tsx`, `estilo.css`).
- **Downloads**: `GET /downloads/*` no servidor web (`servidor.ts`); artefatos em `packages/desktop/release/`.
- **Como começar**: links para portable `.zip` e instalador; constantes em `downloads.ts`.

## Arquivos principais alterados

| Área | Arquivo | Responsabilidade |
| --- | --- | --- |
| API | `packages/api/src/workspace.ts` | raiz compartilhada do workspace por usuário |
| API | `packages/api/src/rotas/playground.ts` | arquivos, upload, editor, terminal, Git e memória |
| API | `packages/api/src/rotas/agente.ts` | agente, tools e streaming SSE |
| Web | `packages/web/src/ui/paginas/Playground.tsx` | orquestração de abas e estado |
| Web | `packages/web/src/ui/paginas/FilesPanel.tsx` | explorador e upload |
| Web | `packages/web/src/ui/paginas/TerminalPanel.tsx` | terminal visual e histórico |
| Web | `packages/web/src/ui/estilo.css` | linguagem visual Aurora e responsividade |
| Operação | `docs/playground-workspace.md` | guia de uso e reinício |

## Validação realizada

| Verificação | Resultado |
| --- | --- |
| `pnpm format:check` | aprovado |
| `pnpm lint` | aprovado (avisos `noExplicitAny` legados na API) |
| Typecheck (workspace, web, admin) | aprovado |
| `pnpm test:coverage` | 919 testes aprovados; 40 dependentes de banco ignorados |
| `pnpm build` | aprovado |
| `pnpm --filter @codingpro/web typecheck` | aprovado (chat refactor) |
| `pnpm biome check` (paginas web) | aprovado |

### Correções da sessão de validação (24/07 — manhã)

- **Workspace unificado:** módulo `workspace.ts` remove caminhos hardcoded (`/home/acer/...`) de `admin.ts` e `cli.ts`.
- **SSE do agente:** parser no Playground passou a respeitar blocos `\n\n` do protocolo SSE, evitando JSON truncado.
- **Auto-scroll:** chat rola ao receber mensagens e durante streaming.
- **Acessibilidade:** sessões da sidebar viraram `<button>`, labels de formulário associados, semântica da landing corrigida.
- **Lint:** supressões Biome ajustadas em modais do admin e zonas de drag-and-drop.
- **Windows:** teste de permissão `0o600` em credenciais pula em `win32` (chmod não é confiável no NTFS).

### Chat moderno e correções de stream (24/07 — tarde)

Refatoração do chat do Playground para UX estilo ChatGPT, com correção dos bugs de pensamento, ferramentas e SSE.

#### Bugs corrigidos

| Problema | Correção |
| --- | --- |
| Balão de pensamento ficava para sempre após cada resposta | Estado efêmero (`reasoning`, `tasks`, `stream`) limpo em `done`/`error`/`finally` |
| CSS de thinking/tasks só existia em `@media (max-width: 820px)` | Estilos movidos para o escopo global em `estilo.css` |
| Trocar de chat durante geração poluía a nova sessão | `AbortController` cancela o fetch anterior; mensagens vinculadas ao `sessionId` da requisição |
| Stream sem `done` perdia a resposta parcial | Commit da mensagem do assistente mesmo se a conexão cair antes do evento final |
| Tools sem alvo legível (`d.target` inexistente) | Parser lê `args` do SSE e extrai `path`/`command` |
| Scroll forçava o fim a cada tick | Auto-scroll só se o usuário estiver a ≤96px do fim; botão “↓ Nova resposta” caso contrário |
| Passos de pensamento falsos (“Analisando prompt…”) | Removidos; usa eventos reais `status`, `think`, `tool-start`, `tool-end` |
| Chaves React instáveis nas mensagens | Cada `Mensagem` tem `id` único; raciocínio salvo em `mensagem.thinking` |

#### UX nova

- Coluna de chat centralizada (max ~52rem), bolhas do usuário à direita, assistente em texto limpo.
- Durante a geração: painel compacto “Pensando…” com timer; raciocínio expansível ao vivo.
- Após a resposta: **▸ Pensamento** recolhido dentro da mensagem do assistente.
- Ferramentas executadas em `<details>` por tool, não mais cards duplicados.
- Empty state “Como posso ajudar?” com sugestões.
- Input arredondado, slash dropdown ancorado na área de digitação.

#### Contrato SSE (inalterado)

O frontend continua consumindo `POST /api/vps/agent` com eventos JSON em `data:`:

`status` · `think` · `tool-start` · `tool-end` · `text` · `done` · `error`

#### Arquivos alterados nesta entrega

| Arquivo | Mudança |
| --- | --- |
| `Playground.tsx` | Ciclo SSE, abort, `reasoning`, scroll inteligente, `novaMensagem()` |
| `ChatView.tsx` | Layout de turno único, `ThinkingFold`, jump-to-bottom |
| `ThinkingBalloon.tsx` | Pensamento ao vivo recolhível; `ThinkingFold` para histórico |
| `PlaygroundTypes.ts` | `Mensagem.id`, `Mensagem.thinking`, helper `novaMensagem()` |
| `TaskTrackerCard.tsx` | Labels mais curtas; recolhido por padrão ao terminar |
| `Banner.tsx` | Empty state moderno |
| `estilo.css` | Chat, thinking, tasks e input no desktop e mobile |


O teste visual local tentou usar o navegador automatizado. O servidor de desenvolvimento não permaneceu acessível nesta sessão Windows; o bundle de produção, porém, foi compilado com sucesso. A verificação visual final deve ser feita no endereço publicado após o reinício dos serviços.

## Publicação e reinício no VPS

```bash
cd ~/Documentos/CodingPro
git pull origin master
nvm use 24.18.0
pnpm install --frozen-lockfile
pnpm plataforma:build
systemctl --user restart codingpro-api codingpro-web
systemctl --user --no-pager status codingpro-api codingpro-web
curl -fsS https://codingpro-api.cursar.space/saude
```

Após o retorno de `{"ok":true,...}` na rota de saúde, abra `https://codingpro.cursar.space/playground`, faça login e confirme: envio de arquivo, criação de pasta pela IA, execução de `pwd` e salvamento de um arquivo no editor.

## Histórico de commits

- `ac5f4c8 fix(playground): chat moderno, SSE estável e pensamento efêmero` (no ar antes da remoção)
- `080781f fix: validação completa do playground, workspace unificado e lint`
- `fd32140 feat(playground): add workspace uploads and refined browser UI`
- `5b05936 fix(playground): unify workspace and harden CLI runtime`
- `92e2ab1 feat!: remove o workspace no navegador` — fim do Playground em produção
