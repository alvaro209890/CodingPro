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

### Chat interativo (TTY) — visual, status e autocomplete

No terminal interativo (`codingpro --chat`):

1. **Logo/banner** Aurora (wordmark + animação de abertura).
2. **Cantinho de status** antes de cada prompt: custo da sessão, tokens in/out, cache %,  
   uso de contexto (`ctx usado/orçamento`), barra e **contexto restante** (janela DeepSeek = **1M**).
3. Digite **`/`** → lista de comandos; **↑↓** seleciona; **Tab** completa; **Enter** envia; **Esc** fecha.
4. **Spinner** enquanto o agente trabalha; tools na timeline.
5. **Auto-compact**: o histórico é compactado automaticamente ao se aproximar do orçamento  
   (padrão **800k** tokens, folga dentro do 1M). Use `/compact` para forçar.

```bash
codingpro --chat
codingpro --chat --max-contexto 200000   # orçamento custom (máx. ~999k)
```

Em pipe/não-TTY o chat degrada para o leitor de linhas clássico (sem raw mode).

#### Windows CMD, PowerShell e SSH

A CLI detecta o terminal e **adapta glifos e cores**:

| Ambiente | Comportamento |
|----------|----------------|
| Windows Terminal / VS Code | Unicode + truecolor |
| **CMD / PowerShell “cru”** | **ASCII** (`+--`, `>`, `*`) + 16 cores brilhantes |
| SSH com locale sem UTF-8 / `TERM=dumb` | ASCII |
| Forçar ASCII | `CODINGPRO_ASCII=1` |
| Forçar Unicode | `CODINGPRO_ASCII=0` |

No CMD legado, prefira Windows Terminal se puder; com ASCII a UI continua legível e colorida.

### Auto-correção de lint e formatação

Depois de um turno que **escreve/edita** arquivos, se o projeto tiver `biome.json` / `biome.jsonc`:

1. Roda `biome check --write` **só nos arquivos tocados** (format + fixes seguros).
2. Revalida com `biome check`.
3. Se ainda houver problemas, **reenvia o diagnóstico ao modelo** (até 1 re-turno por padrão) para a IA corrigir o residual.

| Variável | Padrão | Efeito |
|----------|--------|--------|
| `CODINGPRO_QUALITY_AUTOFIX` | `true` | `false` / `0` / `off` desliga o `--write` |
| `CODINGPRO_QUALITY_MAX_REPAIR` | `1` | `0` = só reporta residual; máx. `2` |

Segurança: caminhos vão como argumentos do processo (sem shell). Biome ausente não quebra o turno.

## Comandos do chat

| Comando | O que faz |
|---|---|
| `/ajuda` | lista os comandos |
| `/sair` · `/exit` | encerra o chat |
| `/custo` · `/cost` | custo e tokens **da sessão** + contexto restante (janela DeepSeek 1M) |
| `/compact` · `/compactar` | compacta o histórico agora (o auto-compact já roda no orçamento) |
| `/limpar` | esquece o histórico da conversa |
| `/undo [N]` · `/desfazer` | desfaz as últimas edições |
| `/redo [N]` · `/refazer` | refaz as últimas edições |
| `/checkpoint` | mostra a linha do tempo de checkpoints |
| `/mapa` · `/map` | repo map (arquivos e assinaturas ranqueados) |
| `/lembrar` · `/remember <fato>` | salva um fato na memória do projeto |
| `/memory [list\|forget <slug>\|edit <slug>]` | gerencia a memória |
| `/plan` · `/plano <objetivo>` | plano interativo: perguntas com opções `[1]/[2]`…, salva em `.codingpro/plans/` e **fica ativo na sessão** (o chat lembra ao executar) |
| `/plan clear` · `/plan limpar` | remove o plano ativo da sessão |
| `/review [alvo]` | revisa o diff com o subagente revisor |
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

O agente delega em paralelo pela ferramenta `task` (ex.: "revise com 3 revisores e consolide").

### `/plan` — planejamento interativo

```bash
# no chat:
/plan migrar o armazenamento para SQLite
```

1. O arquiteto pode fazer **perguntas** com opções numeradas (`[1] A) …`, `[2] B) …`).  
   Responda com o **número**, a **letra**, ou digite texto livre (`[0]` = outro).
2. Com as respostas, ele gera o plano, grava em `.codingpro/plans/` e marca como **plano ativo**.
3. Nos turnos seguintes (ex.: “execute o plano”), o plano entra no system prompt — o agente **não esquece**.
4. `/plan clear` limpa o plano ativo.

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
