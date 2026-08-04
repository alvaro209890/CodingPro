# Login sempre liberado para contas pendentes — 2026-08-03

## Contexto

O Willy (`willydev01@gmail.com`) criou uma conta no CodingPro e tentou logar no
app desktop. O login falhava com:

```
Error invoking remote method 'codingpro:conta-login-direto':
Error: Sua conta ainda não foi aprovada pelo administrador.
```

**Causa raiz:** o passo 3 do login direto (device flow) — `POST /api/device/aprovar` —
rejeitava contas com status `pendente` (403 `conta_nao_aprovada`). O app desktop
executa login → device/iniciar → device/aprovar → device/token em sequência; o
aprovador barrava o fluxo inteiro para quem ainda não tinha sido aprovado pelo admin.

Isso era por design do fluxo original ("só usa depois de aprovação"), mas na prática
impedia o usuário de **entrar** no app — a conta dele nem conseguia abrir o painel
para ver o status.

## Mudança: login nunca é barrado; aviso aparece dentro do app

### API — `packages/api/src/rotas/device.ts`

`POST /api/device/aprovar`: agora **só bloqueia contas `bloqueado`**. Contas
`pendente` aprovam o dispositivo normalmente e recebem o token `cp_` — o login
sempre funciona.

```ts
if (usuario.status === "bloqueado") {
  return erro(resposta, 403, "bloqueado", "Esta conta está bloqueada.");
}
```

### API — `packages/api/src/rotas/proxy.ts`

O proxy LLM (`/v1/chat/completions`) continua exigindo conta `ativo` — o acesso à
IA ainda depende de aprovação + créditos. Só a mensagem ficou mais descritiva:

> "Sua conta está aguardando aprovação do administrador. O acesso à IA é liberado
> assim que a conta for aprovada e receber créditos."

### Desktop — `packages/desktop/src/main/index.ts` + preload + `TelaConta.tsx`

- `conta-login-direto` agora devolve `{ status }` da conta (do corpo do `/api/login`).
- `TelaConta.tsx`: se a conta logada está `pendente`, mostra um aviso amigável
  ("Login feito! Sua conta está aguardando aprovação...") e **conecta mesmo assim** —
  o usuário entra no app e o aviso aparece dentro, não como erro no login.
- Tipos atualizados em `preload/index.ts` e `types/electron.d.ts`
  (`Promise<{ status: string }>`).

### Painel web — já avisava

`Painel.tsx` já exibia o selo "Aguardando aprovação" + aviso para `pendente`.
Sem mudanças necessárias — era só o login (device flow) que travava antes de chegar lá.

## Testes

- `integracao.test.ts`: teste renomeado de "novato só conecta o dispositivo depois
  da aprovação manual" → **"pendente já conecta o dispositivo; bloqueado não"**:
  - pendente aprova o device → 200
  - bloqueado aprova o device → 403 `bloqueado`
- Teste do proxy ("exige aprovação e créditos") mantido — IA continua exigindo `ativo`.
- **36/36 testes de integração passando** (com `DATABASE_URL_TESTE` apontando pro
  Postgres local, schema `teste_w1` isolado).

## Comportamento final

| Situação | Login/device flow | Acesso à IA |
|----------|-------------------|-------------|
| `pendente` | ✅ liberado (entra no app) | 🔒 bloqueado com mensagem clara |
| `ativo`   | ✅ liberado | ✅ liberado (com créditos) |
| `bloqueado` | 🔒 bloqueado | 🔒 bloqueado |

## Deploy

```bash
pnpm build
systemctl --user restart codingpro-api codingpro-web
```

Validação pós-deploy: `curl -s https://codingpro-api.cursar.space/saude`.
