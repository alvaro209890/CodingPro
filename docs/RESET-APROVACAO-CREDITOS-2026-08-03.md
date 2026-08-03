# Reset operacional e fluxo de aprovação + créditos — 2026-08-03

## Objetivo

Esta operação substitui o acesso automático pelo fluxo oficial do CodingPro:

> cadastro → login → aprovação manual → liberação de créditos → uso até o saldo acabar → nova
> liberação pelo admin.

Não existe verificação de e-mail. Aprovação e créditos são controles manuais do administrador, e os
limites mensal, diário e de RPM continuam como proteções secundárias.

## Reset do backend

- O túnel público foi interrompido antes do wipe para impedir que um cadastro externo se tornasse o
  primeiro administrador.
- Um dump de segurança foi gravado no acer em `~/codingpro-backup-pre-wipe.sql`, modo `0600`.
- O schema `public` foi removido e recriado; a API reaplicou `0001`, `0002`, `0003` e, no deploy,
  `0004_creditos`.
- A contagem de `usuarios` foi confirmada em zero antes da recriação do admin.
- Somente o admin configurado foi recriado, preservando o hash de senha existente. A conferência
  estrutural confirmou uma conta admin ativa.
- O túnel permaneceu desligado durante a implementação e voltou somente depois da migração, dos
  testes e do deploy do novo código.

A migração nova `0004_creditos` adiciona `usuarios.creditos_micro bigint NOT NULL DEFAULT 0` sem
alterar migrações já aplicadas.

## Limpeza do Windows

O desinstalador NSIS foi executado em modo silencioso. Resíduos explícitos foram enviados à Lixeira
e cada alvo foi verificado após a remoção:

- `AppData/Local/Programs/CodingPro`;
- `AppData/Roaming/@codingpro`;
- `~/.codingpro`;
- atalhos do Desktop e menu Iniciar;
- portable `CodingPro-portable-0.1.0.exe` do Desktop;
- entrada de desinstalação HKCU do CodingPro.

As buscas finais por executável no `PATH`, portables fora das pastas protegidas, processos e chaves
de desinstalação retornaram vazias. O repositório e as pastas de trabalho protegidas foram
preservados.

## Contrato implementado

### Cadastro e autenticação

- `POST /api/cadastro` devolve `201`, `status: "pendente"` e `creditosMicro: 0`.
- Login continua permitido para a pessoa acompanhar a conta no site.
- Emissão/uso do token de máquina não concede acesso à IA enquanto a conta não estiver ativa.
- O proxy devolve `403 conta_nao_aprovada` para conta pendente.

### Créditos

- `PATCH /api/admin/usuarios/:id` aceita `creditosMicro` como valor positivo a **somar** ao saldo.
- A liberação gera auditoria `creditos_liberados` com o valor e o saldo resultante.
- Cada registro de uso debita `custo_micro` na mesma transação do evento e do agregado mensal, com
  piso zero.
- Saldo zero devolve `402 creditos_esgotados` com mensagem própria.
- `GET /api/consumo`, respostas públicas de usuário, exportação da conta e lista administrativa
  expõem `creditosMicro`.
- O proxy envia `x-codingpro-creditos-micro` com o saldo observado antes da chamada.

### Operação no painel

1. Localize a conta pendente e clique em **Aprovar**.
2. Clique em **Liberar créditos**.
3. Informe o valor em **Liberar créditos (US$)** e confirme.
4. O saldo exibido é cumulativo; uma nova liberação soma ao valor ainda disponível.

O painel administrativo exige sessão autenticada e permissão `admin`.

### Site e desktop

- O site informa que a conta depende de aprovação **e** créditos, mostra o saldo e avisa quando ele
  chega a zero.
- O provider compartilhado pela CLI e pelo desktop reconhece os códigos públicos
  `conta_nao_aprovada` e `creditos_esgotados` e usa mensagens estáticas claras, sem repassar corpo
  arbitrário do upstream.
- O app continua sendo distribuído sem login embutido: a pessoa instala/abre e entra com a própria
  conta.

## Validação e deploy

Executada no Windows com Node 24:

- Biome nos pacotes alterados: aprovado;
- typecheck API, admin, web e workspace: aprovado;
- testes locais API + provider: 87 aprovados e integrações Postgres puladas por ausência de banco
  local;
- builds API, admin, web, LLM, core e desktop: aprovados;
- empacotamento NSIS + portable 1.1.0: aprovado.

Gate completo no Windows com Node 24:

- 336 arquivos de teste aprovados e 2 pulados;
- 3.858 testes aprovados e 50 pulados;
- cobertura: 89,52% statements, 82,20% branches, 92,35% functions e 89,91% lines;
- builds e smoke do pacote aprovados;
- quatro avisos preexistentes de supressão Biome sem efeito, sem erro de lint.

Integração no `acer` com Postgres real: **94/94 testes aprovados**. O teste operacional protegido
`packages/api/scripts/e2e-producao-aprovacao-creditos.mjs` também passou contra a API de produção
local, cobrindo:

1. login do admin por e-mail e senha;
2. sessão autenticada com acesso ao painel;
3. cadastro nasce pendente e sem créditos;
4. aprovação, liberação e device flow;
5. `403 conta_nao_aprovada` no proxy;
6. chamada real ao DeepSeek e débito do saldo;
7. `402 creditos_esgotados` com saldo zero;
8. recarga e nova chamada real.

O script exige confirmação explícita, aceita somente URL local e remove contas e auditorias
temporárias em `finally`. A conferência posterior mostrou novamente um único usuário no banco: o
admin real, ativo e com saldo zero.

## Artefatos e estado online

Os artefatos foram gerados no Windows, copiados para `CODINGPRO_DOWNLOADS_DIR` no `acer` e
conferidos no servidor:

| Artefato | Bytes | SHA-256 |
|---|---:|---|
| `CodingPro-Setup-1.1.0.exe` | 84.731.192 | `c1b078cbebd22dc0aa7ce8189d4f7f0b22e9d0a85f5d574e17ad2666ccbbc734` |
| `CodingPro-portable-1.1.0.exe` | 84.503.646 | `4b2f67aaa831dac7327b2ce98a60c648e63c64ed07ca5171dd4ae9d94fb9e321` |

Os dois PE foram verificados e estão **sem assinatura Authenticode** (`NotSigned`), portanto o
SmartScreen pode avisar até existir assinatura de código.

Checks públicos com cache-buster em 2026-08-03:

- `https://codingpro-api.cursar.space/saude`: `ok: true`, `banco: true`;
- `https://codingpro.cursar.space/`: HTTP 200;
- Setup 1.1.0: HTTP 200 e 84.731.192 bytes;
- portable 1.1.0: HTTP 200 e 84.503.646 bytes.

As units `codingpro-api`, `codingpro-web`, `codingpro-tunnel` e `codingpro-backup.timer` ficaram
ativas; o timer de backup também permanece habilitado. O código foi publicado no branch `master`
do GitHub. O Segundo Cérebro foi atualizado e commitado como `8b424b5`.

## Recuperação

- O dump pré-wipe fica no acer e pode ser restaurado manualmente em caso de incidente.
- A receita segura para recriar o admin está em `references/admin-password-reset.md`.
- A receita de empacotamento/publicação está em `references/packaging-electron-builder.md`.
