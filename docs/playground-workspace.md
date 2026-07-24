# Playground Workspace no navegador

O Playground é o espaço isolado de cada usuário no CodingPro. Ele reúne conversa com IA, CLI, terminal, Git, memória, editor e arquivos no mesmo fluxo.

## Arquivos

A aba **Files** permite organizar o próprio workspace pelo navegador.

- Arraste arquivos e ZIPs para a área de envio.
- Use **Enviar pasta** para preservar a estrutura de uma pasta selecionada.
- Navegue pelas migalhas de navegação, abra arquivos no editor integrado, salve com `Ctrl+S` e exclua itens quando necessário.
- Cada upload fica no workspace isolado do usuário. O limite é de 512 MB por arquivo e até 1.000 arquivos por envio.

O servidor valida caminhos e bloqueia travessia de diretórios. Arquivos existentes também são resolvidos sem permitir que links simbólicos saiam do workspace.

## CLI, terminal e IA

A aba **CLI** é a entrada principal. Ela mantém conversas no navegador, streaming de respostas, atalhos (`Ctrl+N`, `Ctrl+K`, `Ctrl+L`) e comandos iniciados por `/`. A hierarquia visual, os cards de início, o terminal e as transições seguem o sistema Aurora do aplicativo desktop.

O terminal trabalha no workspace do usuário e guarda o histórico da sessão. A IA usa a mesma raiz de arquivos da aba Files e cria automaticamente subpastas quando escreve um novo arquivo. O fluxo SSE encerra cada execução uma única vez, evitando mensagens duplicadas na interface.

## Operação no servidor

O frontend chama o upload por `POST /api/vps/upload` usando `multipart/form-data`; o proxy same-origin preserva a sessão do usuário. A API, a CLI e a aba Files usam a mesma raiz: `~/Documentos/vps-workspaces/<id>/`.

Para mudar essa raiz de forma explícita, defina `CODINGPRO_WORKSPACE_ROOT` no arquivo de ambiente carregado pelos serviços systemd.

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
