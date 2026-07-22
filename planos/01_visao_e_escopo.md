# 01 — Visão e Escopo

## Objetivo

Uma CLI de código com IA que roda **inteiramente na máquina do usuário**: o único tráfego de rede da funcionalidade principal é a chamada à API do LLM (DeepSeek V4 Pro por padrão). Sem backend próprio, sem nuvem, sem telemetria obrigatória.

O usuário abre o terminal dentro de um projeto, conversa em linguagem natural, e a CLI lê/edita arquivos, roda comandos, entende a arquitetura do projeto e executa tarefas de ponta a ponta — com permissões, undo e memória de longo prazo.

## Objetivos centrais (norte do projeto)

1. **Economia extrema de tokens** — arquitetura de contexto desenhada pro cache automático do DeepSeek (~99% de desconto em cache-hit), dois modelos (Pro p/ código, Flash p/ o mecânico), diff edits, orçamentos por seção. Meta: custo por tarefa como métrica de 1ª classe. → doc 14.3
2. **Qualidade extrema de codificação** — verificação automática em loop (sintaxe → lint → testes → revisão por subagente) antes de declarar pronto; benchmark semanal de regressão. → doc 14.5
3. **Zero fricção de configuração de IA** — nível de raciocínio **auto-adaptável por turno** (heurísticas + roteador Flash + escalada por falha); o usuário nunca escolhe effort. → doc 14.4
4. **Experiência 100% em português** — tudo que aparece na CLI ("Pensando…", labels, erros, respostas) é pt-BR; o raciocínio interno do modelo é livre (qualidade primeiro). → doc 15
5. **Visual próprio e bonito** — gramática de interação estilo Claude Code, pele nova (identidade "Aurora": gradiente + trilho de timeline), TUI que dá orgulho de printar. → doc 16

## Decisões de produto (rodada de definições com o Álvaro, 2026-07-22)

| Decisão | Definição |
|---|---|
| Comando no terminal | `codingpro` + alias curto `cpro` (instalados juntos) |
| Permissão padrão | **allowlist esperta** de fábrica: leitura livre, editar dentro do projeto e comandos seguros (testes/build) passam; o arriscado (rm, push, instalar, fora do projeto) pergunta — detalhes no doc 05.2 |
| Licença | **Proprietária source-available** (código público p/ leitura/estudo; uso/modificação exigem autorização) — implicações no doc 09 |
| Repo | `alvaro209890/CodingPro` público, definitivo (planos + futuro código) |
| Pet/gamificação | **Ligado por padrão** (desligável no wizard/config) |
| Voz | **Adiada para pós-1.0** (vira release 1.1; sai do caminho da v1) |
| Commits | Assinar com trailer por padrão; undercover é opt-in |
| Identidade visual | Paleta **Aurora** confirmada (doc 16) |
| Distribuição v1 | npm global **+** script `install.sh` estilo vertex-cli |
| Windows | Só na Fase 2 (F1 = Linux/macOS; WSL no Windows) |

## Princípios de design

1. **Local-first.** Todo estado (memória, sessões, config, índices) vive em arquivos locais (`~/.codingpro/` + `.codingpro/` no projeto). Funciona offline para tudo exceto a chamada ao LLM.
2. **Agnóstico de modelo.** DeepSeek V4 Pro é o padrão, mas qualquer endpoint OpenAI-compatível serve (Ollama/llama.cpp local, Groq, OpenRouter, etc.). Trocar de modelo é editar config, não código.
3. **Segurança por permissão.** Nenhuma escrita de arquivo ou comando shell sem passar pelo sistema de permissões (com modos: perguntar sempre / allowlist / autônomo).
4. **Tudo é reversível.** Cada mudança em arquivo passa por checkpoint git; `undo` de um comando só.
5. **Extensível sem fork.** Plugins via MCP (Model Context Protocol) + skills locais em Markdown + hooks de shell.
6. **Terminal de verdade.** TUI rica (Ink/React), mas também modo `-p "prompt"` não-interativo para scripts e pipes.

## Funcionalidades-chave (resumo — detalhes nos docs 05–08)

- [ ] Loop agêntico principal (chat + tools: read/write/edit/bash/grep/glob)
- [ ] Sistema de permissões com 3 modos
- [ ] Edição por diff (search/replace blocks) + undo instantâneo via git
- [ ] Repo map com tree-sitter (entendimento da estrutura do projeto)
- [ ] Memória persistente local com consolidação automática em background
- [ ] Subagentes e orquestração multi-agente local
- [ ] Tarefas em background (agente continua enquanto você digita)
- [ ] Modo planejamento (plano antes de executar, aprovação do usuário)
- [ ] Plugins via MCP + skills Markdown + hooks
- [ ] Modo voz local (STT whisper.cpp + TTS Piper) — **pós-1.0 (decisão 2026-07-22)**
- [ ] Gamificação: pet virtual, XP, streaks (opcional, desligável)
- [ ] Modo undercover: commits sem trailer/assinatura de IA (escolha do usuário)
- [ ] Modo revisão: análise de diff/branch com achados classificados

## Fora do escopo da Fase 1 (a CLI é o produto desta fase)

- ❌ App gráfico Windows → **Fase 2** (`../fase2-app-windows/`)
- ❌ Site, contas de usuário, limites, backend/proxy → **Fase 3** (`../fase3-plataforma-web/`)
- ❌ Suporte a Windows nativo (alvo F1: Linux e macOS; Windows via WSL) → chega na Fase 2 (trabalho no core)
- ❌ Extensão de IDE (VS Code etc.) — integração via MCP fica para depois
- ❌ Treinamento/fine-tuning de modelos

**Chave de API p/ desenvolvimento:** a do Hermes deste PC (`DEEPSEEK_API_KEY` em `~/.hermes/.env`) — referência ao arquivo apenas; valor nunca em docs/repo.

## Usuário-alvo

Desenvolvedor que vive no terminal, quer autonomia da IA com controle fino, e prefere pagar só o custo de API (ou rodar modelo local) em vez de assinatura de ferramenta.

## Critério de sucesso da v1.0

Conseguir, num projeto real de porte médio (ex.: um dos projetos do Álvaro — Atlas, NexoGeo, AquiResolve painel):

- [ ] Resolver uma issue de ponta a ponta (entender → editar múltiplos arquivos → rodar testes → commitar) só com prompts
- [ ] Sobreviver a sessões longas sem estourar contexto (compactação automática)
- [ ] `undo` reverter qualquer mudança indesejada em < 2 s
- [ ] Rodar com DeepSeek V4 Pro **e** com um modelo local (Ollama) sem mudar código
