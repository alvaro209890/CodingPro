# Autenticação somente por senha — 2026-08-03

## Decisão

O CodingPro passa a usar somente e-mail, senha e sessão httpOnly para autenticação de contas. O
painel administrativo exige uma sessão válida e `admin = true`. Não existe etapa adicional de
código temporário no login nem configuração desse recurso no perfil.

## Remoção realizada

- login da API simplificado para e-mail e senha;
- guard administrativo reduzido a sessão válida + permissão `admin`;
- endpoints de configuração de código temporário removidos;
- campos correspondentes retirados das respostas públicas e exportações LGPD;
- controles retirados das telas de login e perfil;
- helpers criptográficos, exports e teste unitário específicos removidos;
- script operacional substituído por `packages/api/scripts/reset-admin-password.mjs`;
- runbook substituído por `references/admin-password-reset.md`;
- E2E de produção adaptado para login administrativo por senha;
- documentação e roadmaps atualizados para o contrato atual.

## Banco de dados

A migração `0005_remover_segundo_fator` remove definitivamente as colunas antigas de todas as
contas. O identificador histórico da migração `0002_p4_conta_limites_2fa` permanece imutável para
não quebrar bancos que já a registraram; instalações novas terminam sem as colunas porque executam
a migração de remoção.

## Contrato esperado

1. `POST /api/login` com credenciais válidas responde `200` e cria a sessão.
2. `GET /api/admin/check` responde `200` para uma sessão com `admin = true`.
3. As três rotas antigas de configuração respondem `404`.
4. Login, `/api/eu` e exportação da conta não expõem estado de segundo fator.
5. Troca de senha continua revogando todos os dispositivos conectados.

## Segurança mantida

- senha armazenada com scrypt e comparação resistente a timing;
- cookie httpOnly, Secure e SameSite em produção;
- sessão assinada com expiração;
- rate limits, CSP e isolamento do painel por role;
- troca de senha revoga tokens da CLI e do desktop;
- auditoria das ações administrativas e de conta.
