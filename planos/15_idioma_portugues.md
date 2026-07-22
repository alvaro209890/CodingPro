# 15 — Idioma: CLI 100% em Português (pt-BR)

Requisito do Álvaro (2026-07-22): **tudo que aparece na CLI é em português** — status ("Pensando…", "Escrevendo…"), labels, menus, erros, wizard, docs e as respostas da IA. O **pensamento interno do modelo é livre**: ele raciocina no idioma que der mais qualidade (inglês/chinês/pt — não forçamos), porque o raciocínio bruto não é a interface.

## 15.1 Política por camada

| Camada | Idioma | Observação |
|---|---|---|
| UI da TUI (labels, botões, status, erros, wizard, help) | **pt-BR sempre** | Strings centralizadas (15.3) |
| Verbos de progresso ("Pensando…", "Explorando…", "Editando…", "Testando…", "Revisando…") | **pt-BR sempre** | Derivados do TIPO de evento (tool/fase), não do texto do reasoning — funcionam mesmo com reasoning em outro idioma |
| Respostas finais da IA no chat | **pt-BR** (instruído no system prompt) | Exceção: código, identificadores, saídas de comando — nunca traduzir |
| Raciocínio interno (`reasoning_content`) | **Livre** (o que o modelo preferir) | Colapsado por padrão na TUI; expansível (Ctrl+O) mostra o bruto, com rótulo "Raciocínio (bruto)" |
| System prompt e descrições de tools | **Inglês** na v1 | Qualidade máxima + reuso direto do material minerado (opencode/Aider, testado em produção); contém diretiva dura: "All user-visible replies MUST be in Brazilian Portuguese" |
| Comentários/código gerados | Convenção do projeto do usuário | Detectada pelo repo map; na dúvida, segue o que já existe no arquivo |
| Mensagens de commit | Convenção do repo (analisador do doc 08.4) | Repo em pt → pt; repo em en → en |
| Docs do projeto CodingPro (README, guias) | pt-BR | Público-alvo inicial é BR |

## 15.2 Custo do pt-BR (honestidade com o objetivo de economia)

Texto em português tokeniza ~20–25% maior que inglês. Impacto real:

- **Input**: quase irrelevante — o grosso do input é código + prefixo cacheado (~99% off).
- **Output**: as respostas em pt custam mais por caractere → mitigação: estilo de resposta **conciso por contrato** no system prompt (responder o que foi perguntado, sem cerimônia), e código não muda de idioma.
- **Reasoning livre** (esta decisão) evita o pior custo: forçar o modelo a raciocinar em pt podia degradar qualidade E gastar mais. Ganhamos dos dois lados.

- [ ] Eval A/B na F1: system prompt en+diretiva-pt vs 100% pt — medir qualidade de código e custo; migrar só se empatar ou vencer

## 15.3 Implementação das strings

- Módulo `packages/tui/src/i18n/` com **pt-BR como idioma canônico** (arquivo `pt-BR.ts` tipado; chaves derivam dele). Sem framework de i18n pesado — é um objeto tipado + helper `t()`.
- Regra de lint: **nenhuma string literal visível ao usuário fora do i18n** (checável em CI por convenção de componente).
- Preparado p/ outros idiomas no futuro (en.ts opcional), mas **sem investir nisso agora**.
- Slash commands em português com **aliases em inglês** (quem vem de outras CLIs não se perde): `/ajuda` (=`/help`), `/custo` (=`/cost`), `/desfazer` (=`/undo`), `/plano` (=`/plan`), `/revisar` (=`/review`), `/memoria`, `/tarefas`, `/tema`, `/voz`, `/iniciar` (=`/init`), `/sair`.
- Números/datas em formato brasileiro (R$ não se aplica — custo em US$ mesmo, é o que a API cobra; exibir "US$ 0,0342").

## 15.4 Verbos de progresso (a "voz" da CLI)

Como o reasoning fica colapsado, o que o usuário vê durante o trabalho são os verbos de status — eles são parte da identidade (doc 16). Mapeamento por evento, não por tradução:

| Evento | Verbo exibido |
|---|---|
| Streaming de reasoning | "Pensando…" (+ tempo decorrido) |
| Tool read/glob/grep | "Explorando o código…" / "Lendo `arquivo`…" |
| Tool edit/write | "Escrevendo…" / "Editando `arquivo`…" |
| Tool bash (testes detectados) | "Testando…" |
| Tool bash (geral) | "Executando `comando`…" |
| Subagente reviewer | "Revisando…" |
| Compactação | "Organizando o contexto…" |
| Consolidador de memória | "Memorizando…" |
| Auto-effort escalou | "Pensando mais fundo…" |

Modo divertido opcional (`fun.verbos: true`, padrão on): variações leves ("Fuçando o código…", "Caprichando…", "Quebrando a cabeça…") — mesma mecânica dos verbos do Claude Code, mas nossos e em português. `fun.verbos: false` usa só os sóbrios.

- [ ] Tabela completa evento→verbo (sóbrio + divertido) na F1
- [ ] Checklist de revisão de pt-BR: sem anglicismo desnecessário, voz ativa, gênero neutro onde possível
