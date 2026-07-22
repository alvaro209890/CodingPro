# 08 — Interface: TUI, Voz, Gamificação e Undercover

> Este doc define o comportamento; a **identidade visual** (paleta Aurora, trilho de timeline, temas, componentes) está no **doc 16** e o **idioma pt-BR** (verbos de progresso, i18n, comandos em português) no **doc 15**. Em conflito, 15/16 mandam.

## 8.1 TUI (Ink)

Layout base:

```
┌──────────────────────────────────────────────┐
│  histórico do chat (markdown + código shiki) │
│  [cards de tool: ⚙ bash npm test  ✓ 2.1s]    │
│  [prompt de permissão quando necessário]     │
├──────────────────────────────────────────────┤
│ > caixa de entrada (multiline, histórico ↑↓) │
├──────────────────────────────────────────────┤
│ (pet)  modelo · modo · tokens/custo · branch │
└──────────────────────────────────────────────┘
```

- Slash commands com autocomplete, **em português com alias em inglês** (doc 15.3): `/plano`, `/desfazer`, `/revisar`, `/memoria`, `/tarefas`, `/iniciar`, `/modelo`, `/voz`, `/tema`, `/custo`, `/ajuda`…
- Atalhos: `Esc` interrompe, `Shift+Tab` cicla modos (normal/plan/auto), `Ctrl+R` histórico.
- Modo headless: `codingpro -p "prompt"` (stdout puro, `--output-format json` para scripts) — essencial p/ testes e automação.
- Statusline configurável (comando do usuário, como no settings do Claude Code).

- [ ] Protótipo de layout e teste de flicker/performance com histórico grande
- [ ] Paleta/tema (claro/escuro/auto)

## 8.2 Modo voz (local) — **PÓS-1.0** (decisão 2026-07-22; especificação mantida p/ o release 1.1)

Fluxo push-to-talk (não é wake-word, sem escuta contínua):

1. Usuário segura tecla (ou `/voice`) → grava via `arecord`.
2. Solta → whisper.cpp (modelo small/medium, pt-BR) transcreve → texto aparece **editável** na caixa de entrada (não envia direto).
3. Resposta final (não o streaming) pode ser lida por **Piper TTS** se `voice.tts: true`; tecla para interromper a fala.

Decisões:
- Voz é 100% opcional e lazy: binários/modelos baixados só no primeiro uso (`codingpro voice setup`).
- Reuso direto da experiência do Ares (Piper pt-BR já validado pelo Álvaro; Groq STT fica como fallback opcional de config, não padrão, para manter o "local puro").

- [ ] Escolher modelo whisper padrão (latência × acurácia pt-BR) no spike da F0
- [ ] Resumo falável: TTS lê um resumo curto gerado, não a resposta técnica inteira

## 8.3 Gamificação — pet virtual ("Buddy" local)

Princípio: **divertido, nunca intrusivo, desligável com uma config** (`fun.pet: false`).

- Pet ASCII/emoji na statusline com humor/energia derivados de eventos reais: testes passando, tarefa concluída, streak de dias de uso, undo em sequência (pet fica "tonto").
- XP e níveis por marcos objetivos (não por volume de tokens — sem incentivo perverso de gastar API).
- `/pet` mostra o pet grande, stats e conquistas ("Primeira refatoração multi-arquivo", "7 dias de streak"…).
- Estado em `~/.codingpro/pet.json`. Zero impacto no prompt do LLM (o pet é da TUI, não do modelo).

- [ ] Definir tabela de eventos→XP e conquistas da v1
- [ ] Arte ASCII dos estados do pet (4–6 estados bastam)

## 8.4 Modo undercover

Commits feitos pela CLI, por padrão, levam trailer `Co-Authored-By: CodingPro <...>`. O modo undercover permite ao usuário **desligar qualquer menção à IA**:

- Config `git.attribution: "full" | "trailer-only" | "none"` (global e por projeto) + flag `--undercover` pontual.
- Em `none`: mensagem de commit escrita em estilo neutro do usuário (aprende com o histórico de commits do repo — tamanho, idioma, convenção como conventional commits).
- Nunca assina como outra pessoa: autor/committer continuam sendo a identidade git configurada do usuário. É omissão de atribuição de ferramenta (escolha legítima do dono do repo), não falsificação de autoria.
- Fora do escopo: automação de contribuições em massa para repos de terceiros.

- [ ] Analisador de estilo de commit do repo (últimos N commits → convenção)
- [ ] Garantir que nenhum outro rastro vaza em `none` (mensagem, descrição, notes)

## 8.5 Onboarding

- `codingpro` primeira vez: wizard curto — chave da API (ou detectar Ollama), modo de permissão, tema, pet on/off.
- `codingpro doctor`: diagnóstico do ambiente (node, git, ripgrep, chave válida, latência da API, binários de voz).
- [ ] Roteiro do wizard e mensagens de erro amigáveis para chave inválida/sem rede
