# F3-P0 — Setup executado e o que falta

**Executado em:** 2026-07-23 · PC `acer` · ver [INVENTARIO_PC.md](INVENTARIO_PC.md)

## 1. O que já está no ar ✅

| Item | Estado |
|---|---|
| Inventário congelado | `INVENTARIO_PC.md` |
| Tunnel dedicado `codingpro` | `d15b2a56-067d-464f-a60e-77803fc5e661` |
| Config do tunnel | `~/.cloudflared/codingpro-config.yml` (chmod 600) |
| DNS | `codingpro.cursar.space` → :8701 · `codingpro-api.cursar.space` → :8700 |
| Segredos | `~/.config/codingpro/env` (chmod 600) |
| Units systemd (**user**) | `codingpro-api`, `codingpro-web`, `codingpro-tunnel` — enabled + running |
| Pacote `@codingpro/api` | Fastify 5, `GET /saude` + `GET /` + 404 pt-BR |
| Pacote `@codingpro/web` | página "em breve" (tema Aurora), `GET /saude` |
| Nenhum serviço existente reiniciado | conferido: todos ainda no timestamp de boot |

Verificação pública:

```bash
curl https://codingpro-api.cursar.space/saude
# {"ok":true,"servico":"codingpro-api","versao":"0.1.0","ambiente":"producao",...}
curl -I https://codingpro.cursar.space/     # 200
```

### Gotcha do `cloudflared` (versão 2026.3.0 deste PC)

`cloudflared tunnel route dns codingpro <host>` **apontou para o tunnel errado**
(`e759f152…` = `auracore-local-api`) ao resolver pelo *nome*. Corrigido rodando de novo
com o **UUID explícito** e `--overwrite-dns`. **Sempre usar o UUID** ao criar rotas DNS aqui.

## 2. O que falta no P0 ⏳ — precisa do Álvaro

Criar o role + database do CodingPro no Postgres 16 exige **superusuário**, e `sudo` neste PC
pede senha (ao contrário do `server-desktop`, que é NOPASSWD). O usuário `atlas` tem `CREATEDB`
mas **não** `CREATEROLE`, então não dá para fazer sem elevação.

Rode no terminal (troque `SENHA_FORTE` por uma senha gerada, ex. `openssl rand -base64 24`):

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE codingpro LOGIN PASSWORD 'SENHA_FORTE';
CREATE DATABASE codingpro OWNER codingpro;
REVOKE ALL ON DATABASE codingpro FROM PUBLIC;
SQL
```

Defesa em profundidade — impedir que o role `codingpro` enxergue o database do Atlas:

```bash
sudo -u postgres psql -c "REVOKE CONNECT ON DATABASE atlas FROM codingpro;"
```

Depois grave a URL no arquivo de segredos (**nunca** no repo):

```bash
printf 'DATABASE_URL=postgresql://codingpro:SENHA_FORTE@127.0.0.1:5432/codingpro\n' \
  >> ~/.config/codingpro/env
```

Conferir:

```bash
psql "postgresql://codingpro:SENHA_FORTE@127.0.0.1:5432/codingpro" -c "select current_database();"
# codingpro
psql "postgresql://codingpro:SENHA_FORTE@127.0.0.1:5432/atlas" -c "select 1;"
# deve FALHAR (permissão negada) — é o resultado esperado
```

> ⚠️ Nada de `CREATE DATABASE` como `atlas`: o database ficaria com dono errado e
> misturaria os dois sistemas.

## 3. Operação do dia a dia

```bash
# status
systemctl --user status codingpro-api codingpro-web codingpro-tunnel

# deploy (após git pull)
cd ~/Documentos/CodingPro
pnpm install && pnpm --filter @codingpro/api build && pnpm --filter @codingpro/web build
systemctl --user restart codingpro-api codingpro-web   # NUNCA outro serviço

# logs
journalctl --user -u codingpro-api -f
```

As units são **symlinks** para `deploy/systemd/*.service` no repo — editar o arquivo versionado
e rodar `systemctl --user daemon-reload` já aplica.

## 4. Ajustes ao plano original (doc 02)

| Plano original | O que foi feito | Por quê |
|---|---|---|
| Units de **sistema** em `/etc/systemd/system` | Units de **usuário** (`~/.config/systemd/user`) | É o padrão real deste PC (Hermes, NexoGeo, SaldoPro). Zero `sudo`, `linger` já ativo. |
| Segredos em `/etc/codingpro/env` | `~/.config/codingpro/env` (600) | Coerente com units de usuário; evita `sudo` no deploy. |
| Site em Next.js | Servidor Node mínimo ("em breve") | Scaffold Next.js é tarefa do **P3a**. Evita puxar a árvore de deps antes da hora. |
