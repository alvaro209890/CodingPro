# 03 — Tecnologias Sugeridas

Stack: **TypeScript + Node.js ≥ 24**, ESM puro, monorepo pnpm.

## Runtime e base

| Item | Escolha | Justificativa |
|---|---|---|
| Runtime | Node.js ≥ 24 | Já é o padrão das máquinas do Álvaro; `node:sqlite` nativo; fetch/streams estáveis |
| Linguagem | TypeScript (strict) | Segurança de tipos no protocolo de tools/eventos; mesmo stack do Cline/OpenCode p/ portar código |
| Monorepo | pnpm workspaces | Leve, já usado nos projetos do Álvaro |
| Bundle/build | tsdown ou esbuild | Binário/entry único rápido; sem passo de build lento |
| Lint/format | Biome | Uma ferramenta só, rápida |

## Interface (TUI)

| Item | Escolha | Alternativa | Justificativa |
|---|---|---|---|
| TUI | **Ink 5** (React no terminal) | OpenTUI | Padrão de mercado (Claude Code, Codex CLI, Gemini CLI usam Ink); componentes reutilizáveis p/ chat, spinner, pet |
| Parsing de args | commander | yargs | Simples, subcomandos (`codingpro`, `codingpro -p`, `codingpro maintenance`, `codingpro mcp`) |
| Markdown no terminal | marked + marked-terminal | ink-markdown | Render de respostas com código destacado |
| Realce de sintaxe | shiki (tema terminal) | cli-highlight | Mesmo motor do VS Code, preciso |
| Notificações desktop | node-notifier / `notify-send` | — | Aviso de tarefa background concluída |
| Visual (gradiente/glyphs/medida) | ink-gradient, gradient-string, chalk v5, figures, string-width | — | Identidade "Aurora" do doc 16; design tokens centralizados, 4 temas |
| Idioma | strings pt-BR canônicas em `tui/src/i18n/` | — | CLI 100% pt-BR (doc 15); system prompt en com diretiva de resposta pt |

## LLM Layer

| Item | Escolha | Justificativa |
|---|---|---|
| SDK | **Vercel AI SDK (`ai`)** + `@ai-sdk/openai-compatible` | Streaming + tool calling prontos, agnóstico de provider — DeepSeek, Ollama, Groq, OpenRouter todos OpenAI-compatíveis |
| Provider padrão | DeepSeek V4 Pro (`https://api.deepseek.com`) | Endpoint oficial OpenAI-compatible; reasoning configurável; **gotchas conhecidas no doc 11** |
| Modelos locais | Ollama (`localhost:11434/v1`) | Modo 100% offline |
| Contagem de tokens | tokenizador aproximado (tiktoken/gpt-tokenizer) + usage real da API | Orçamento de contexto e custo por sessão |

## Tools e execução

| Item | Escolha | Justificativa |
|---|---|---|
| Shell | execa + timeout + working dir controlado | API robusta de subprocessos; captura streaming de stdout |
| Busca em arquivos | ripgrep embarcado (`@vscode/ripgrep`) | Rápido, respeita .gitignore, mesmo caminho do Cline |
| Glob | fast-glob | Padrão de fato |
| Diff | biblioteca `diff` + formato search/replace próprio | Ver doc 07 (formato de edição) |
| Git | simple-git (wrapper) + git CLI direto | Checkpoints, undo, commits |
| Sandbox (fase 2) | bubblewrap/landlock opcional no Linux | Endurecer o bash tool sem depender disso na v1 |

## Conhecimento local

| Item | Escolha | Justificativa |
|---|---|---|
| Parsing de código | **web-tree-sitter (WASM)** + gramáticas das linguagens-alvo | Repo map estilo Aider/Cline; WASM evita compilação nativa |
| Banco local | `node:sqlite` (nativo do Node 24) | Zero dependência nativa externa; FTS5 para busca textual na memória |
| Memória legível | Markdown com frontmatter YAML | Usuário lê/edita na mão; mesmo padrão que o Álvaro já usa |
| Embeddings (opcional, F4+) | fastembed-js ou API de embeddings | Busca semântica na memória; começa só com FTS5 |

## Voz (doc 08)

| Item | Escolha | Justificativa |
|---|---|---|
| STT | whisper.cpp via `smart-whisper` ou subprocess do binário | Local, bom em pt-BR (modelo small/medium) |
| TTS | **Piper** (subprocess) | Álvaro já usa no Ares — voz pt-BR pronta e conhecida |
| Áudio I/O | `arecord`/`aplay` (ALSA) via subprocess | Sem dependência nativa Node frágil |

## Extensibilidade

| Item | Escolha | Justificativa |
|---|---|---|
| Plugins | **MCP** via `@modelcontextprotocol/sdk` (cliente) | Protocolo aberto, ecossistema enorme de servidores prontos |
| Skills | Arquivos `.md` com frontmatter em `~/.codingpro/skills/` e `.codingpro/skills/` | Convenção validada na prática (Claude Code, Hermes) |
| Hooks | Comandos shell configurados em `settings.json` (pre/post tool, stop) | Automação do usuário sem plugin |
| Config | JSONC com `jsonc-parser@3.3.1` em `~/.codingpro/settings.json` + `.codingpro/settings.json` | Parser fixado; comentários/trailing comma com validação estrutural estrita |

## Testes (doc 10)

Vitest (unit/integração) + fixtures de conversas gravadas (replay de LLM) + repos git descartáveis para E2E.

## Checklist de validação da stack (spikes antes da F1)

- [ ] Spike: Ink 5 + Node 24 — chat com streaming renderizando sem flicker
- [ ] Spike: AI SDK + DeepSeek — tool calling multi-turno funciona (incl. reasoning)
- [ ] Spike: AI SDK + Ollama local — mesmo código, modelo trocado só por config
- [ ] Spike: `node:sqlite` + FTS5 disponível na versão do Node alvo
- [ ] Spike: web-tree-sitter carregando gramáticas TS/JS/Python e extraindo símbolos
- [ ] Spike: whisper.cpp transcrevendo pt-BR do microfone com latência aceitável (< 2 s p/ frase curta)
- [ ] Spike: checkpoint git + undo em repo com mudanças não commitadas (não pode destruir staging do usuário)
