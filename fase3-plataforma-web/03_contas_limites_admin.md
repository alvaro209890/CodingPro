# F3-03 — Contas, Limites e Painel Admin

## Modelo de dados (Postgres, database `codingpro`)

```
users          id, email (único), senha_hash (argon2id), nome, status (ativo|bloqueado|pendente),
               role (user|admin), email_verificado_em, criado_em
api_tokens     id, user_id, token_hash (sha256 do cp_...), label, criado_em, ultimo_uso_em, revogado_em
limits         user_id (1:1), limite_mensal_usd, limite_diario_usd (opcional),
               rate_rpm, max_concorrencia, override_ate (limite temporário), atualizado_em
usage_events   id, user_id, ts, modelo, tokens_in, tokens_in_cache, tokens_out,
               custo_usd, duracao_ms, origem (cli|desktop), status (ok|erro|cortado)
usage_monthly  user_id + ano_mes (PK), custo_usd_acum, tokens_acum  ← contador rápido p/ pré-checagem
audit_log      id, ator_id, acao (criar_user, mudar_limite, bloquear...), alvo, detalhes_json, ts
```

- `usage_events` é **append-only** (auditável); `usage_monthly` é o contador quente que a pré-checagem lê em 1 query.
- Sem armazenar prompts/código (doc 01) — só números.

## Limites (definidos pelo Álvaro, por usuário)

- Unidade: **US$/mês** (acompanha o custo real DeepSeek; cache-hit barato beneficia o usuário) + limite diário opcional (anti-estouro num dia só).
- **Presets** editáveis: `teste` (ex. US$ 1/mês), `padrao` (US$ 5), `power` (US$ 20), `ilimitado` (só o Álvaro) — e **override individual** por usuário (o requisito: "cada usuário terá um limite definido por mim").
- Comportamento ao atingir: corta com `402` + mensagem clara na CLI ("Seu limite do mês acabou — renova dia 01/08. Fale com o admin p/ aumentar."); avisos automáticos em 80% e 95% (e-mail + banner na CLI via campo no response).
- Renovação: virada de mês (fuso America/Cuiabá).
- Novos cadastros: entram como `pendente` (**aprovação manual do admin no beta**) — o Álvaro controla quem entra.

## Painel admin (`/admin`, role admin + 2FA obrigatório)

| Tela | Conteúdo |
|---|---|
| Usuários | Lista com busca; aprovar pendentes, bloquear, trocar preset, **editar limite individual**, revogar tokens |
| Consumo | Total do mês (US$ na DeepSeek), top usuários, gráfico diário, cache-hit médio da plataforma |
| Saúde | Fila/concorrência atual, erros da API DeepSeek, latência p50/p95, disco/memória do PC |
| Auditoria | `audit_log` navegável |

- Ação de emergência: **kill switch global** (pausa o proxy p/ todo mundo menos admin) — botão único, p/ estouro de custo ou abuso.
- [ ] Alerta proativo pro Álvaro (e-mail ou WhatsApp via Atlas?) quando: gasto global do dia > X, usuário atinge 100%, erro 5xx em sequência

## Segurança

- Senhas argon2id; sessões httpOnly+Secure+SameSite; CSRF no site; 2FA TOTP (obrigatório admin, opcional user).
- Tokens `cp_` opacos, hash no banco, mostrados 1×, revogáveis; escopo único (chat) na v1.
- Rate limit por IP no cadastro/login (anti-abuso) + Cloudflare Turnstile no signup.
- Chave DeepSeek de **produção**: exclusiva da plataforma (não a do Hermes — essa é só dev), em `/etc/codingpro/env`, com **teto de gasto configurado no painel da DeepSeek** como última linha de defesa.
- Headers de segurança no site (CSP, HSTS via Cloudflare).
- LGPD: dados mínimos (e-mail), exportação/exclusão de conta self-service, política em pt-BR.

## Checklist

- [ ] Migrations iniciais + seeds (admin do Álvaro)
- [ ] Testes de carga do proxy com streaming (10 usuários simultâneos no hardware deste PC)
- [ ] Simulação de estouro: usuário a 99% → requisição grande → corte no ponto certo sem cobrar além
- [ ] Ensaiar fluxo completo: cadastro → aprovação → login CLI → uso → 80% → 100% → aumento de limite pelo admin
