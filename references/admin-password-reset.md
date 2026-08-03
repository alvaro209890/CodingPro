# Recriar ou redefinir o administrador

Use esta receita após um reset do banco ou quando for necessário trocar a senha do administrador
configurado. O script ativa a conta, concede `admin` e grava uma senha aleatória em arquivo local
com permissão `0600`.

O comando nunca imprime senha, hash ou `DATABASE_URL`.

```bash
cd ~/Documentos/CodingPro/packages/api
set -a
. ~/.config/codingpro/env
set +a
export PATH="/home/acer/.nvm/versions/node/v24.18.0/bin:$PATH"
node scripts/reset-admin-password.mjs
```

As credenciais ficam em `~/.config/codingpro/admin-bootstrap.json`. Leia o arquivo somente numa
sessão SSH privada e remova-o depois de guardar a senha em local seguro.

Validação:

1. `POST /api/login` com e-mail e senha responde `200`.
2. `GET /api/admin/check` com o cookie da sessão responde `200` e `admin: true`.
3. A conta está `status = 'ativo'` e `admin = true` no banco.
