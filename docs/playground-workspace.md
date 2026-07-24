# Playground Workspace no navegador

O Playground é o espaço isolado de cada usuário no CodingPro. Ele reúne a conversa com a IA, CLI, terminal, Git, memória, editor e arquivos no mesmo fluxo.

## Arquivos

A aba **Files** permite organizar o próprio workspace pelo navegador.

- Arraste arquivos para a área de envio, incluindo `.zip`.
- Use **Enviar pasta** para preservar a estrutura completa de uma pasta selecionada no navegador.
- Navegue pelas migalhas de navegação, abra arquivos de texto no editor integrado, salve com `Ctrl+S` e exclua itens quando necessário.
- Cada upload é gravado no workspace isolado do usuário. O limite é de 512 MB por arquivo e até 1.000 arquivos por envio.

O servidor recusa caminhos externos e travessia de diretórios, portanto um usuário não consegue escrever fora do próprio workspace.

## CLI, terminal e IA

A aba **CLI** é a entrada principal e mantém conversas no navegador. Use `/` para descobrir comandos, `Ctrl+N` para um novo chat e `Ctrl+K` para abrir a lista de chats. A resposta em streaming, o cursor e os cards iniciais usam as mesmas referências visuais do aplicativo desktop.

O terminal executa comandos no workspace do usuário. O Git pode clonar repositórios e consultar status, histórico ou atualizações. A aba **Memory** armazena anotações persistentes no mesmo workspace.

## Operação

Para publicar a mudança, construa os pacotes web e API e reinicie os serviços `codingpro-web` e `codingpro-api` no servidor. O frontend chama o upload por `POST /api/vps/upload` usando `multipart/form-data`; o proxy same-origin preserva a sessão do usuário.
