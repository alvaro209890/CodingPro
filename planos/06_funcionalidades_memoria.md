# 06 — Memória Persistente e Consolidação

Objetivo: a CLI lembra do usuário, dos projetos e do feedback recebido **entre sessões**, tudo em
arquivos locais legíveis. Estado e orquestração da consolidação são locais; a inferência usa
exclusivamente DeepSeek V4 Flash.

## 6.1 Camadas de memória

| Camada | Onde vive | Conteúdo | Entra no contexto |
|---|---|---|---|
| Contexto do projeto | `CODINGPRO.md` na raiz do repo | Arquitetura, comandos, convenções (gerado por `/init`, editado pelo usuário) | Sempre, integral |
| Memória global | `~/.codingpro/memory/*.md` + `MEMORY.md` (índice) | Quem é o usuário, preferências, feedback, fatos entre projetos | Índice sempre; arquivos sob demanda |
| Memória do projeto | `.codingpro/memory/*.md` | Fatos do projeto que não estão no código (decisões, gotchas, credenciais → só referência, nunca valor) | Índice sempre; arquivos por relevância |
| Sessões | `~/.codingpro/sessions/<projeto>/*.jsonl` | Histórico bruto de conversas | Só via `--resume`/`--continue` |
| Índice de busca | SQLite FTS5 (`~/.codingpro/index.db`) | Texto das memórias + metadados | Usado pelo retrieval, nunca direto |

## 6.2 Formato de memória (1 arquivo = 1 fato)

```markdown
---
name: slug-curto
description: resumo de uma linha (usado no retrieval)
type: user | feedback | project | reference
created: 2026-07-22
updated: 2026-07-22
strength: 3        # reforçada a cada uso/confirmação
---
Corpo do fato. Links para memórias relacionadas com [[outro-slug]].
Para feedback: **Por quê:** ... **Como aplicar:** ...
```

Justificativa: formato idêntico ao que o Álvaro já usa com Claude Code/Hermes — legível, versionável, editável na mão.

## 6.3 Escrita de memória

- Tool `remember(fato, tipo, escopo)` disponível ao modelo — o system prompt instrui a salvar: correções do usuário, preferências reveladas, decisões de projeto, gotchas descobertos.
- Antes de criar, buscar arquivo existente que cubra o assunto → **atualizar em vez de duplicar**.
- Comandos manuais: `/remember <texto>`, `/memory list`, `/memory edit <slug>` (abre $EDITOR), `/memory forget <slug>`.

## 6.4 Retrieval (o que entra no contexto)

1. `MEMORY.md` global + do projeto entram sempre (são só índices de 1 linha por fato).
2. No início do turno, busca FTS5 com termos do prompt + arquivos citados → top-K memórias completas (orçamento de tokens fixo, ex. 2k).
3. Não há embeddings: melhorar consulta, ranking e métricas do FTS5 antes de ampliar o mecanismo.

- [ ] Definir orçamento de tokens de memória e política de corte
- [ ] Métrica simples de acerto de retrieval para os evals (doc 10)

## 6.5 Consolidador (o "sonho" da CLI)

Job local que roda **ao fim da sessão** (ou via `codingpro maintenance`), usando DeepSeek V4 Flash:

1. **Extração:** varre a sessão encerrada e propõe fatos novos que o modelo esqueceu de salvar.
2. **Deduplicação/merge:** encontra memórias sobrepostas (FTS5 + similaridade) e funde, preservando a mais recente como verdade.
3. **Poda:** fatos com `strength` baixa e idade alta viram candidatos a arquivo morto (`memory/_archive/`), nunca deleção direta.
4. **Linkagem:** sugere links `[[...]]` entre memórias relacionadas.
5. **Reindexação:** regenera `MEMORY.md` e o índice SQLite.

Regras de segurança:
- Consolidador **nunca roda com tools de escrita fora de `memory/`**.
- Toda fusão/poda fica registrada em `memory/_changelog.md` — auditável e reversível.
- Roda com timeout e teto de custo; se falhar, não bloqueia nada (memória bruta continua válida).

- [ ] Prompt do consolidador (extração/merge/poda) — especificar e testar com sessões reais
- [ ] Gatilho: fim de sessão com >N turnos, ou explícito; nunca daemon
- [ ] Definir limiar de similaridade para propor merge

## 6.6 Privacidade

- Tudo local; nada de memória sai da máquina exceto o que for injetado em prompts para a API do LLM (inevitável e documentado).
- `.codingpro/memory/` do projeto entra no `.gitignore` por padrão (comando `/init` cuida disso) — compartilhar memória de projeto é opt-in.
- Regra dura no system prompt + validação: **nunca gravar valores de segredos** em memória (só onde encontrá-los).
