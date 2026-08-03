# Recriar ou redefinir o admin com TOTP

Use esta receita somente no host da API, depois que as migrações tiverem sido aplicadas. O script
recria ou atualiza o e-mail definido em `CODINGPRO_EMAIL_ADMIN`, marca a conta como `ativo` e
`admin`, ativa TOTP e grava senha/segredo novos em um arquivo local com permissão `0600`.

O script usa scrypt com hash de 32 bytes e o formato `scrypt$sal$hash`. Ele nunca imprime senha,
segredo TOTP, hash ou `DATABASE_URL`.

```bash
set -a
. ~/.config/codingpro/env
set +a
cd ~/Documentos/CodingPro/packages/api
node scripts/reset-admin-totp.mjs
```

Por padrão, as credenciais ficam em `~/.config/codingpro/admin-bootstrap.json`. Abra esse arquivo
somente numa sessão SSH privada, cadastre o `otpauth` no autenticador e remova o arquivo quando o
acesso estiver confirmado.

Validação esperada, sem registrar valores secretos em histórico de shell:

1. `POST /api/login` com e-mail e senha, sem TOTP, responde `401 totp_obrigatorio`.
2. O mesmo login com o código TOTP atual responde `200` e devolve `usuario.admin: true`.
3. O cookie recebido acessa `GET /api/admin/check` com `200` e `admin: true`.

Não passe senha ou segredo como argumento de linha de comando e não copie o arquivo de bootstrap
para o repositório.
