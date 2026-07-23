# Guia do Usuário — CodingPro

CLI local-first de desenvolvimento assistido por IA (pt-BR, Node.js 24, provider DeepSeek).

## Instalação

### npm (recomendado)

```bash
npm install -g codingpro
```

Fica disponível como `codingpro` e o alias `cpro`.

### Script (curl | sh)

```bash
curl -fsSL https://raw.githubusercontent.com/alvaro209890/CodingPro/master/install.sh | sh
```

O script confere Node.js ≥ 24, instala o pacote global e orienta o PATH se preciso. Ele **não**
instala o Node com sudo — se faltar, aponta o https://nodejs.org/.

Depois de instalar, confira o ambiente:

```bash
codingpro --doctor
```

## Configuração

A configuração é empilhada (JSONC), do menor para o maior peso:

1. **Global** — `~/.codingpro/settings.json` (preferências pessoais entre projetos)
2. **Projeto** — `<raiz>/.codingpro/settings.json` (sobrepõe a global)
3. **Ambiente** e **flags** de linha de comando (maior peso)

### A chave da DeepSeek

Defina a chave por **variável de ambiente** (jeito recomendado — nunca é versionada):

```bash
export DEEPSEEK_API_KEY="sua-chave"
```

Nunca coloque o valor da chave em arquivos versionados. O `codingpro doctor` só verifica a
**presença** da chave, nunca imprime o valor.

Se a chave faltar ou for inválida, a CLI **falha fechado** (mensagem clara em stderr, exit ≠ 0) e
**não** envia o prompt. Sem rede ou com a API inacessível, o erro é genérico (“Não foi possível
obter resposta da DeepSeek” / similar) — nunca imprime o valor da chave nem detalhes brutos do
transporte.

## Uso básico

```bash
# 1. Pergunta rápida, sem ferramentas (headless)
codingpro -p "explique o padrão Repository"

# 2. Agente com ferramentas de leitura (headless): lê o projeto e responde
codingpro --agente -p "onde o pagamento é tratado?"

# 3. Chat interativo, com aprovação de efeitos (escrever/rodar)
codingpro --chat
```

Sessões do agente são salvas; retome com `--resume <id>` ou `--continuar` (a mais recente).

## Comandos do chat

| Comando | O que faz |
|---|---|
| `/ajuda` | lista os comandos |
| `/sair` | encerra o chat |
| `/custo` | custo e tokens do último turno |
| `/limpar` | esquece o histórico da conversa |
| `/undo [N]` · `/redo [N]` | desfaz/refaz as últimas edições |
| `/checkpoint` | mostra a linha do tempo de checkpoints |
| `/mapa` | repo map (arquivos e assinaturas ranqueados) |
| `/lembrar <fato>` | salva um fato na memória do projeto |
| `/memory [list\|forget <slug>\|edit <slug>]` | gerencia a memória |
| `/plan <objetivo>` | gera um plano (subagente arquiteto) e salva em `.codingpro/plans/` |
| `/skills` · `/skill <nome>` | lista skills / ativa uma skill na sessão |
| `/init` | gera `CODINGPRO.md` com o projeto detectado |

## Memória

Fatos duradouros entre sessões, em Markdown legível (1 arquivo = 1 fato):

- Global: `~/.codingpro/memory/` · Projeto: `.codingpro/memory/`
- O índice `MEMORY.md` entra sempre no contexto; os fatos relevantes ao pedido são recuperados por turno.
- O agente salva sozinho via a ferramenta `remember`; você também usa `/lembrar <fato>`.
- `/memory list` mostra tudo; `/memory forget <slug>` arquiva; `/memory edit <slug>` mostra o caminho.
- Regra dura: **valores de segredo nunca são gravados** (guarde onde encontrá-los, não o valor).

## Skills

Instruções empacotadas em Markdown com frontmatter, em `~/.codingpro/skills/` ou `.codingpro/skills/`:

```markdown
---
name: revisar-codigo
description: revisa qualidade e segurança do diff
---
Analise os arquivos alterados e aponte problemas por severidade, com trechos de correção.
```

`/skills` lista, `/skill revisar-codigo` ativa (o corpo entra no contexto). O chat também **sugere**
uma skill quando o pedido casa com a descrição.

## Subagentes e `/plan`

Tipos de fábrica: **explorer** (busca, só leitura), **worker** (geral), **architect** (planeja),
**reviewer** (revisa). Tipos custom em `.codingpro/agents/<nome>.md`:

```markdown
---
role: fast
tools: read_file, grep, repo_map
---
Você é um subagente que localiza onde um assunto é tratado no código.
```

O agente delega em paralelo pela ferramenta `task` (ex.: "revise com 3 revisores e consolide"). O
comando `/plan <objetivo>` roda o arquiteto e salva o plano em `.codingpro/plans/AAAA-MM-DD-slug.md`.

## Hooks

Scripts de shell disparados no ciclo de vida, no campo `hooks` do `settings.json` (é uma **lista**):

```jsonc
{
  "hooks": [
    { "event": "pre-tool", "command": "meu-lint-de-seguranca.sh", "matcher": "bash" },
    { "event": "post-tool", "command": "registra-metrica.sh" },
    { "event": "stop", "command": "notify-send 'CodingPro terminou'" }
  ]
}
```

- Eventos: `pre-tool` (antes da ferramenta), `post-tool` (depois), `stop` (fim da sessão).
- `matcher` filtra pelo nome da ferramenta (substring). O payload chega como **JSON no stdin**; o nome
  da ferramenta também em `$HOOK_TOOL` e o evento em `$HOOK_EVENT`.
- Um `pre-tool` que sai com **código ≠ 0 veta** a execução da ferramenta.

## Plugins MCP

Servidores MCP (Model Context Protocol) via stdio, no campo `mcpServers` do `settings.json`:

```jsonc
{
  "mcpServers": {
    "postgres": { "command": "mcp-server-postgres", "args": ["--dsn", "..."] }
  }
}
```

As ferramentas do servidor aparecem como `mcp__<servidor>__<tool>` e passam pela aprovação de efeitos
como qualquer ação externa.
