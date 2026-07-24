# Entrega do Playground web — 24 de julho de 2026

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
| `pnpm test:package` | aprovado |

### Correções da sessão de validação (24/07)

- **Workspace unificado:** módulo `workspace.ts` remove caminhos hardcoded (`/home/acer/...`) de `admin.ts` e `cli.ts`.
- **SSE do agente:** parser no Playground passou a respeitar blocos `\n\n` do protocolo SSE, evitando JSON truncado.
- **Auto-scroll:** chat rola ao receber mensagens e durante streaming.
- **Acessibilidade:** sessões da sidebar viraram `<button>`, labels de formulário associados, semântica da landing corrigida.
- **Lint:** supressões Biome ajustadas em modais do admin e zonas de drag-and-drop.
- **Windows:** teste de permissão `0o600` em credenciais pula em `win32` (chmod não é confiável no NTFS).

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

- `fd32140 feat(playground): add workspace uploads and refined browser UI`
- `5b05936 fix(playground): unify workspace and harden CLI runtime`
