# PROMPT DE TRABALHO — CodingPro: reset total, fluxo de aprovação + créditos, deploy e documentação

Você vai trabalhar no projeto **CodingPro** (assistente de IA desktop com conta cloud). Leia este prompt inteiro antes de começar e siga as fases em ordem. No fim, tudo deve estar funcional online, documentado e com o código no GitHub.

---

## 0. CONTEXTO E OBJETIVO

CodingPro é um monorepo pnpm com: API Fastify + Postgres (backend), site estático com página de downloads, painel admin React, app desktop Electron (Windows) e CLI. Hoje o produto permite conta cloud: o usuário cria conta no site, baixa o app, faz login e usa o proxy de IA do servidor (o app **não** precisa vir pré-logado — ele baixa e loga).

**Objetivo desta tarefa:**
1. Apagar TODO o banco de dados e dados do CodingPro no PC backend (acer), via SSH.
2. Apagar TODAS as instalações do app CodingPro neste PC Windows local.
3. Validar e CORRIGIR o fluxo de produto para o seguinte (fonte da verdade):
   > Pessoa entra no site → cria conta → baixa o app → abre o app e **loga com a conta** → **só pode usar após o admin aprovar a conta E liberar créditos no painel admin** → usa normalmente **até acabar os créditos liberados** (quando zera, bloqueia até nova liberação).
4. Deixar tudo funcional online (site + downloads + API), documentado, com código no GitHub (branch `master`) e registro no Segundo Cérebro.

Regra de ouro: **não apague o repositório de código** `C:\GIS\CodingPro` nem `~/Documentos/CodingPro` no acer — é o código-fonte. Apague apenas **instalações/artefatos/dados**, conforme as fases.

---

## 1. ACESSOS (IMPORTANTE — use estes exatos)

- **Backend (acer):** `ssh acer@100.102.202.63` (o atalho "Acesso Linux Pessoal.lnk" na área de trabalho do Windows é só isso). Chave SSH já configurada (id_ed25519). Em SSH não-interativo, Node 24 via **caminho absoluto**: `export PATH="/home/acer/.nvm/versions/node/v24.18.0/bin:$PATH"` (nvm use NÃO funciona em ssh não-login).
- **Repo no acer:** `~/Documentos/CodingPro` (branch `master`).
- **Services (systemd --user):** `codingpro-api` (127.0.0.1:8700), `codingpro-web` (127.0.0.1:8701), `codingpro-tunnel` (Cloudflare), `codingpro-backup.timer` (Postgres, ~03:22).
- **Env (segredos — NUNCA imprima valores):** `~/.config/codingpro/env` no acer. Chaves: `DATABASE_URL`, `SESSION_SECRET`, `DEEPSEEK_API_KEY`, `CODINGPRO_EMAIL_ADMIN`, `CODINGPRO_DOWNLOADS_DIR`, `CODINGPRO_AMBIENTE=producao`.
- **Repo local (Windows):** `C:\GIS\CodingPro` (branch `master`). GitHub: `https://github.com/alvaro209890/CodingPro.git`.
- **Segundo Cérebro:** vault via `ssh sd` (100.65.138.58, user server) em `/home/server/Downloads/Segundo-Cerebro` (ver Fase 6).
- Prefira **vários SSH curtos** em vez de um heredoc longo (timeout em shell remoto).

---

## 2. FASE 1 — APAGAR TODO O BANCO DE DADOS NO BACKEND (acer)

O banco é Postgres (URL em `DATABASE_URL` no env). Apague **todos os dados** (usuários, tokens, eventos de uso, auditoria, config) e deixe as migrações reaplicarem no boot da API.

1. Backup de segurança rápido (opcional, 10s, não atrapalha): `pg_dump "$DATABASE_URL" > ~/codingpro-backup-pre-wipe.sql` (só por precaução).
2. Apagar schema e recriar vazio (as migrações reaplicam sozinhas no boot da API):
   ```bash
   psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   ```
   (Se o usuário do banco não for dono do schema, rode como superusuário do Postgres ou ajuste permissões após recriar.)
3. Reiniciar a API para reaplicar as migrações:
   ```bash
   systemctl --user restart codingpro-api
   sleep 3
   curl -sS http://127.0.0.1:8700/saude
   ```
   Esperado: `{"ok":true,"banco":true,...}` e log com "migrations aplicadas".
4. Confirmar zero dados: `psql "$DATABASE_URL" -c "SELECT count(*) FROM usuarios;"` → 0.

⚠️ **Depois do wipe não existe admin.** Como o primeiro usuário cadastrado vira admin (ou o e-mail de `CODINGPRO_EMAIL_ADMIN`), o fluxo novo nasce com contas `pendente` — então o admin precisa ser garantido. Siga a receita `references/admin-password-reset.md` do repo para criar/ativar o usuário admin **antes** de liberar o site para cadastros, OU garanta que `CODINGPRO_EMAIL_ADMIN` está no env e cadastre esse e-mail (nasce admin). Valide com login por e-mail e senha → `admin:true`.

---

## 3. FASE 2 — APAGAR INSTALAÇÕES DO CODINGPRO NESTE PC WINDOWS

Apague (com confirmação de cada exclusão):

- App instalado: `C:\Users\Usuario\AppData\Local\Programs\CodingPro\` (instalação NSIS do Setup).
- Portable: `C:\Users\Usuario\Desktop\CodingPro-portable-0.1.0.exe` (e qualquer outro portable CodingPro na Área de Trabalho/Downloads).
- Atalhos: `CodingPro.lnk` na Área de Trabalho e em `...\Start Menu\Programs\CodingPro.lnk`.
- Dados do app: `C:\Users\Usuario\AppData\Roaming\@codingpro\` (userData do Electron).
- Credenciais/conta local: `C:\Users\Usuario\.codingpro\` (credenciais.json + memory).
- Entrada de desinstalação do registro: `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\*CodingPro*` (e `HKLM` se existir).

**NÃO apagar:** `C:\GIS\CodingPro` (repo de código), `~/Downloads/CodingPro` e `~/Downloads/codingpro-test` (pastas de trabalho/workspace do usuário), nem qualquer instalação de outro software. Ao final, liste o que restou (ex.: `where codingpro`, verificar Programs/Desktop/Roaming) e confirme que nada de instalado sobrou.

---

## 4. FASE 3 — VALIDAR E CORRIGIR O FLUXO (FONTE DA VERDADE)

### 4.1 Fluxo atual (o que o código faz HOJE — já verificado)
- Cadastro (`packages/api/src/rotas/auth.ts` → `repositorio.ts:69`): grava `status='ativo'` direto. **Não há aprovação de admin.**
- Não existe saldo de créditos. Existem: `limite_mensal_micro` (renova todo mês), `limite_diario_micro`, `rate_rpm` (`packages/api/src/limites.ts`, `checarAcessoLlm`).
- Proxy (`packages/api/src/rotas/proxy.ts`): autentica token `cp_`, **já bloqueia** `status !== 'ativo'` com 403 `conta_nao_aprovada` ("Sua conta ainda não foi aprovada pelo administrador.") — mas isso nunca dispara porque contas nascem ativas. Bloqueia limite mensal com 402 `limite_atingido`.
- Painel admin (`packages/admin/src/telas/Usuarios.tsx` + `packages/api/src/rotas/admin.ts`): admin ajusta `status`, `limiteMicro`, `limiteDiarioMicro`, `rateRpm`, `admin`. Exige sessão autenticada e permissão `admin`.
- Desktop (`packages/desktop/src/main/index.ts`): login por device flow OU login direto email+senha (`codingpro:conta-login-direto`) → token salvo em `~/.codingpro/credenciais.json`. **Já atende "baixa e loga"** — não precisa vir pré-logado.

### 4.2 Correções necessárias (implemente tudo)
1. **Cadastro nasce `pendente`:** em `packages/api/src/repositorio.ts` (`criarUsuario`), trocar `'ativo'` por `'pendente'` (coluna já aceita via CHECK). O primeiro usuário continua admin (`admin=true`), mas `pendente` até aprovação.
2. **Saldo de créditos consumível** (modelo "admin libera → usuário usa até acabar"):
   - Nova migração `0004_creditos` em `packages/api/src/db/migracoes.ts`: `ALTER TABLE usuarios ADD COLUMN creditos_micro bigint NOT NULL DEFAULT 0;` (nunca edite migração já aplicada — acrescente).
   - `checarAcessoLlm` (`limites.ts`): se `creditos_micro <= 0` → 402 `creditos_esgotados` "Seus créditos acabaram. Aguarde o administrador liberar mais." (mantenha kill_switch, rate e limites mensal/diário como proteção secundária).
   - Registrar uso (`registrarUsoDaResposta`): debitar `creditos_micro` pelo `custo_micro` do request (floor em 0) — coluna nova + UPDATE por usuário.
   - Expôr saldo em `/api/consumo` e no `publico()` de auth (campo `creditosMicro`).
3. **Painel admin — aprovar + liberar créditos:**
   - `admin.ts`: no PATCH, aceitar `creditosMicro` (soma ao saldo atual — liberar crédito) além do `status` já existente. Registrar auditoria (`acao: "creditos_liberados"`, detalhe com valor).
   - `packages/admin/src/telas/Usuarios.tsx`: botão "Aprovar" (status pendente→ativo), campo "Liberar créditos (US$)" e exibição do saldo. O valor em US$ vira micro (×1e6).
4. **Site (`packages/web`)**: após cadastro, tela/estado "Conta criada! Aguardando aprovação do administrador para liberar o uso e os créditos." (e login de pendente mostra o mesmo aviso).
5. **Desktop:** tratar e exibir as mensagens do proxy para 403 `conta_nao_aprovada` e 402 `creditos_esgotados` de forma clara na UI (não virar erro genérico). O fluxo de login já está correto.
6. **Proxy (`proxy.ts`)**: a mensagem de `conta_nao_aprovada` já existe — mantenha. Ajuste o header de aviso (`x-codingpro-*`) para incluir o saldo de créditos.

### 4.3 Validação E2E do fluxo (com curl, sem abrir o app)
1. `POST /api/cadastro` (email novo, `termosAceitos:true`) → 201 com `status:"pendente"`.
2. Login → 200 (sessão ok), mas `POST /v1/chat/completions` com token `cp_` → **403 `conta_nao_aprovada`**.
3. Admin autenticado aprova (`status:"ativo"`) e libera créditos (`creditosMicro`) via PATCH → 200.
4. `POST /v1/chat/completions` → **200**.
5. Esgotar créditos (ou zerar manualmente no banco) → próxima chamada → **402 `creditos_esgotados`**.
6. Liberar mais crédito pelo admin → volta a funcionar.

---

## 5. FASE 4 — DEPLOY ONLINE + DOWNLOADS

1. Qualidade antes de subir (local, em `C:\GIS\CodingPro`):
   ```bash
   pnpm exec biome check packages/api packages/admin/src packages/web/src
   pnpm --filter @codingpro/api exec tsc --noEmit -p tsconfig.json
   pnpm --filter @codingpro/admin exec tsc --noEmit -p tsconfig.json
   pnpm exec vitest run packages/api/test
   pnpm --filter @codingpro/api build && pnpm --filter @codingpro/admin build && pnpm --filter @codingpro/web build
   ```
2. **Downloads:** a versão exibida no site é `DESKTOP_VERSAO` em `packages/web/src/ui/downloads.ts` (hoje "1.1.0"). Os artefatos são `CodingPro-Setup-<v>.exe` e `CodingPro-portable-<v>.exe` (~80 MB) gerados em `packages/desktop/.pack/release/` por `pnpm --filter @codingpro/desktop dist`. **O site serve de `CODINGPRO_DOWNLOADS_DIR` no acer** (não de dist-site). Garanta que os `.exe` existam no dir da env do acer e que `DESKTOP_VERSAO` case com eles (senão o botão dá 404). Se o download ficou indisponível, gere/reenvie os artefatos (receita: `references/packaging-electron-builder.md`).
3. Deploy no acer (push primeiro, depois):
   ```bash
   ssh -o BatchMode=yes acer@100.102.202.63 'bash -lc "
   set -e
   export PATH=\"/home/acer/.nvm/versions/node/v24.18.0/bin:\$PATH\"
   cd ~/Documentos/CodingPro
   git stash push -u -m wip-before-deploy || true
   git fetch origin && git pull --ff-only origin master
   pnpm install --frozen-lockfile
   pnpm plataforma:build
   systemctl --user daemon-reload
   systemctl --user restart codingpro-api codingpro-web
   sleep 2
   systemctl --user restart codingpro-tunnel
   sleep 2
   curl -sS http://127.0.0.1:8700/saude; echo
   "'
   ```
4. Health checks (público e local):
   ```bash
   curl -sS https://codingpro-api.cursar.space/saude
   curl -sS -o /dev/null -w "%{http_code}\n" https://codingpro.cursar.space/
   curl -sS -o /dev/null -w "%{http_code}\n" "https://codingpro.cursar.space/downloads/CodingPro-Setup-1.1.0.exe?x=$(date +%s)"   # cache-buster; 200 = ok
   systemctl --user is-active codingpro-api codingpro-web codingpro-tunnel   # no acer
   ```
   ⚠️ Cloudflare cacheia `/downloads/` — use sempre cache-buster para conferir; no localhost do acer (`:8701`) o 404 aparece na hora.

---

## 6. FASE 5 — GIT (branch master) + SEGUNDO CÉREBRO

1. **Commit + push** (branch é **`master`**, não main — o repo não tem main):
   ```bash
   cd /c/GIS/CodingPro
   git add -A && git commit -m "feat(plataforma): reset do banco + fluxo de aprovação e créditos (admin libera, usuário usa até acabar)"
   git push origin master
   ```
   Se o push for rejeitado (outro agente comitou antes): `git fetch && git rebase origin/master && git push`.
2. **Documentação no repo:** atualize `docs/` com um registro desta operação: reset do banco, novo fluxo (aprovação + créditos), endpoints novos, como o admin aprova/libera, e o estado online pós-deploy. Se houver `docs/LACUNAS_FASES.md`, marque o que foi resolvido.
3. **Segundo Cérebro** (vault no server via `ssh sd`, autor `Hermes-windows`):
   - Protocolo obrigatório: leia `AGENTS.md` do vault; **lock antes de editar**; changelog no topo; commit via ferramentas do vault.
   - Arquivo do projeto: `02-projetos/CodingPro.md` (confirme o nome em `INDEX.md`). Atualize: estado pós-reset, fluxo de aprovação + créditos, como o admin opera, URLs online, versão dos downloads.
   - Linha no `06-changelog.md` (mais recente no topo, data ISO, autor Hermes-windows) e commit com mensagem clara.

---

## 7. CRITÉRIOS DE ACEITE (tudo precisa ser verdadeiro ao final)

- [ ] Banco no acer zerado e migrações reaplicadas (`/saude` ok, `usuarios` vazio).
- [ ] Nenhuma instalação/atalho/dado do CodingPro sobrando neste Windows (repo preservado).
- [ ] Cadastro novo nasce `pendente`; proxy bloqueia com 403 `conta_nao_aprovada`.
- [ ] Admin aprova e libera créditos; usuário usa até `creditos_esgotados` (402); nova liberação destrava.
- [ ] App desktop: baixa, instala, loga com a conta (não precisa vir pré-logado) e mostra avisos claros de pendência/créditos.
- [ ] Site + downloads públicos funcionando (HTTP 200 com cache-buster), versão dos artefatos casa com `DESKTOP_VERSAO`.
- [ ] Código commitado e pushado em `origin master`.
- [ ] Segundo Cérebro atualizado (projeto + changelog + commit) seguindo o protocolo do vault.

## 8. PROIBIDO / CUIDADOS

- NUNCA imprimir valores de segredos (`~/.config/codingpro/env`, tokens, chaves). Só nomes/length/prefixo.
- NUNCA embutir `DEEPSEEK_API_KEY` no binário do app (download é público — o proxy do servidor é quem autentica).
- NÃO apagar `C:\GIS\CodingPro` nem `~/Documentos/CodingPro` (código-fonte).
- NÃO editar migrações já aplicadas (0001–0003) — acrescente a 0004.
- NÃO prometer verificação de e-mail (não existe). Aprovação é manual via painel admin.
- Se algo não der certo (ex.: artefato `.exe` faltando ou login do admin), **pare e reporte** em vez de contornar com gambiarra.
