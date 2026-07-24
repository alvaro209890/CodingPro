# Playground Workspace no navegador

O Playground é o espaço isolado de cada usuário no CodingPro. Ele reúne conversa com IA, CLI, terminal, Git, memória, editor e arquivos no mesmo fluxo.

## Arquivos

A aba **Files** permite organizar o próprio workspace pelo navegador.

- Arraste arquivos e ZIPs para a área de envio.
- Use **Enviar pasta** para preservar a estrutura de uma pasta selecionada.
- Navegue pelas migalhas de navegação, abra arquivos no editor integrado, salve com `Ctrl+S` e exclua itens quando necessário.
- Cada upload fica no workspace isolado do usuário. O limite é de 512 MB por arquivo e até 1.000 arquivos por envio.

O servidor valida caminhos e bloqueia travessia de diretórios. Arquivos existentes também são resolvidos sem permitir que links simbólicos saiam do workspace.

## Chat e agente (SSE)

A aba **Chat** é a entrada principal. Ela mantém conversas no navegador, atalhos (`Ctrl+N`, `Ctrl+K`, `Ctrl+L`) e comandos iniciados por `/`.

### Fluxo de uma mensagem

1. O usuário envia texto ou `/comando`.
2. O frontend faz `POST /api/vps/agent` com `{ prompt }` e lê o corpo como stream SSE.
3. Durante a geração, a UI mostra:
   - status (“Pensando…”, nome da tool);
   - raciocínio do modelo (`think`), expansível;
   - lista de ferramentas em execução (`tool-start` / `tool-end`);
   - texto da resposta (`text`) antes do `done`.
4. Ao receber `done` ou `error`, a mensagem do assistente é gravada na sessão ativa com `content`, `thinking` e `tools`.
5. O estado efêmero (stream, raciocínio ao vivo, tasks) é limpo — nada fica preso na tela.

### Comportamentos importantes

- **Trocar de chat** durante uma geração cancela a requisição anterior (`AbortController`).
- **Scroll:** só acompanha o fim automaticamente se você já estiver perto do final; senão aparece “↓ Nova resposta”.
- **Sessões** ficam em `localStorage` (`cp_playground_sessions`, `cp_playground_active`).
- Cada mensagem tem `id` estável; o raciocínio fica em `mensagem.thinking` e pode ser reaberto com **▸ Pensamento**.

O terminal trabalha no workspace do usuário e guarda o histórico da sessão. A IA usa a mesma raiz de arquivos da aba Files e cria automaticamente subpastas quando escreve um novo arquivo.

## Operação no servidor

O frontend chama o upload por `POST /api/vps/upload` usando `multipart/form-data`; o proxy same-origin preserva a sessão do usuário. A API, a CLI e a aba Files usam a mesma raiz: `~/Documentos/vps-workspaces/<id>/`.

Para mudar essa raiz de forma explícita, defina `CODINGPRO_WORKSPACE_ROOT` no arquivo de ambiente carregado pelos serviços systemd.

Outras variáveis opcionais da API:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `CODINGPRO_WORKSPACE_ROOT` | `~/Documentos/vps-workspaces` | Raiz dos workspaces por usuário |
| `CODINGPRO_CLI_PATH` | `~/Documentos/CodingPro/packages/cli/dist/index.mjs` | Binário da CLI no endpoint `/api/vps/cli` |
| `CODINGPRO_NODE_BIN` | `process.execPath` | Node usado para spawn da CLI |

Depois de atualizar o repositório no VPS, execute:

```bash
cd ~/Documentos/CodingPro
nvm use 24.18.0
pnpm install --frozen-lockfile
pnpm plataforma:build
systemctl --user restart codingpro-api codingpro-web
systemctl --user --no-pager status codingpro-api codingpro-web
curl -fsS https://codingpro-api.cursar.space/saude
```

Os serviços estão definidos em `deploy/systemd/`. Não é necessário reiniciar o aplicativo desktop para publicar mudanças do Playground web.
