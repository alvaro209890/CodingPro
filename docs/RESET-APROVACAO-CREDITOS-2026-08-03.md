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
- O schema `public` foi removido e recriado; a API reaplicou `0001`, `0002` e `0003`.
- A contagem de `usuarios` foi confirmada em zero antes da recriação do admin.
- Somente o admin configurado foi recriado, preservando o hash de senha e o TOTP existentes. A
  conferência estrutural confirmou uma conta admin ativa com TOTP.
- O túnel permanece desligado durante a implementação e só deve voltar após migração, testes e
  deploy do novo código.

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

O painel administrativo continua exigindo TOTP em produção.

### Site e desktop

- O site informa que a conta depende de aprovação **e** créditos, mostra o saldo e avisa quando ele
  chega a zero.
- O provider compartilhado pela CLI e pelo desktop reconhece os códigos públicos
  `conta_nao_aprovada` e `creditos_esgotados` e usa mensagens estáticas claras, sem repassar corpo
  arbitrário do upstream.
- O app continua sendo distribuído sem login embutido: a pessoa instala/abre e entra com a própria
  conta.

## Validação pré-deploy

Executada no Windows com Node 24:

- Biome nos pacotes alterados: aprovado;
- typecheck API, admin, web e workspace: aprovado;
- testes locais API + provider: 87 aprovados e 48 integrações Postgres puladas por ausência de banco
  local;
- builds API, admin, web, LLM, core e desktop: aprovados;
- empacotamento NSIS + portable 1.1.0: aprovado.

As integrações Postgres, o E2E HTTP, os hashes dos instaladores e os checks públicos serão
registrados nesta página após o deploy.

## Recuperação

- O dump pré-wipe fica no acer e pode ser restaurado manualmente em caso de incidente.
- A receita segura para recriar o admin está em `references/admin-totp-reset.md`.
- A receita de empacotamento/publicação está em `references/packaging-electron-builder.md`.
