# Diário de desenvolvimento

## 2026-07-22 — F0.1: fundação executável offline

### Entregue

- Workspace pnpm na raiz definitiva do repositório.
- Node 24.18.0 fixado; TypeScript strict, Biome, Vitest e tsdown.
- Pacote `packages/cli` com os bins futuros `codingpro` e `cpro`.
- Ajuda, versão e erro de opção desconhecida em pt-BR.
- Build ESM executável com shebang.
- CI em Node 24 no Linux e macOS best-effort.
- Testes unitários sem rede com threshold mínimo de 90%/80%; nesta rodada, 100%.

### Decisões

- O código nasce na raiz atual, sem outra subpasta `codingpro/`.
- Só pacotes com responsabilidade real serão criados; diretórios vazios foram adiados.
- TypeScript 6.0.3 foi fixado porque o tsdown ainda trata a API do TypeScript 7 como experimental.
- A integração LLM foi separada no F0.2 para manter este incremento offline e determinístico.
- A API oficial da DeepSeek ignora `thinking.budget_tokens`; o plano agora usa apenas thinking
  on/off e effort `high`/`max` com capability flags.
- Escrita e bash permanecerão em `ask` durante o desenvolvimento até existir checkpoint testado;
  depois disso, `allowlist` será o padrão do produto.

### Validação

Consulte o roteiro [F0.1](roteiros-qa/f0-fundacao.md). Todos os comandos foram executados com
Node 24.18.0 e pnpm 10.34.4. Resultado da rodada:

- 11/11 testes aprovados e 100% de statements, branches, functions e lines no código testável;
- lint, typecheck, build, `git diff --check` e smoke do artefato aprovados;
- tarball instalado em prefixo temporário; `codingpro` e `cpro` apontam para o mesmo artefato;
- `pnpm audit`: nenhuma vulnerabilidade conhecida.
- [GitHub Actions 29943155025](https://github.com/alvaro209890/CodingPro/actions/runs/29943155025)
  aprovado: Ubuntu em 21s e macOS em 32s.

### Próximo incremento

F0.2: contrato pequeno de Provider + provider replay/fake, `codingpro -p "olá"` offline nos
testes e smoke DeepSeek manual/opt-in sem expor credenciais.

## 2026-07-22 — F0.2a: Provider e headless replay offline

### Entregue

- Pacote `packages/llm` com contrato Provider v1 independente de fornecedor.
- Provider replay JSONL sintético, estrito, fail-closed e compatível com `AbortSignal`.
- Modo headless `codingpro -p`/`--prompt` com streaming imediato e newline final canônico.
- Seleção explícita do replay por `CODINGPRO_PROVIDER` e `CODINGPRO_REPLAY_FILE`.
- Smoke do tarball instalado cobrindo os dois bins e ambos os aliases de prompt.
- CI bloqueante no Node 24 mínimo suportado e no Node fixado, em Linux e macOS.

### Decisões

- Fixtures de replay são exclusivamente sintéticas neste incremento; não existe `--record`.
- Divergência entre prompt e fixture não consome o turno, evitando respostas fora de ordem.
- O pacote LLM não lê ambiente nem credenciais; a composição fica na fronteira da CLI.
- Erros inesperados e causas internas não são mostrados ao usuário.
- AI SDK e adaptador DeepSeek entram somente no F0.2b, quando houver integração real.

### Validação

Consulte o roteiro [F0.2a](roteiros-qa/f0.2a-headless-replay.md). Validação local com Node
24.18.0 e pnpm 10.34.4:

- 44/44 testes aprovados;
- cobertura global: 95,91% statements, 92,92% branches, 96,55% functions e 95,83% lines;
- format check, lint, typecheck, build dos dois pacotes e smoke do tarball aprovados;
- `git diff --check` aprovado e nenhuma vulnerabilidade conhecida em `pnpm audit`.

- [GitHub Actions 29944958829](https://github.com/alvaro209890/CodingPro/actions/runs/29944958829)
  aprovado: Node 24.18/Linux em 18s, Node 24.11/Linux em 21s e Node 24.18/macOS em 21s.

### Próximo incremento

F0.2b: adaptador DeepSeek via AI SDK, capability mapping e smoke real manual/opt-in, sem usar
rede ou credenciais nos testes comuns.

## 2026-07-22 — F0.2b: adaptador DeepSeek protegido

### Entregue

- `DeepSeekProvider` sobre `ai@7.0.34` e `@ai-sdk/openai-compatible@3.0.14`, ambos fixados.
- Modelo `deepseek-v4-pro` e endpoint oficial fechados no adaptador, sem override por ambiente.
- Thinking on/off, effort `high|max`, texto/raciocínio streaming e reasoning multi-turno.
- Conversão de usage nativo, inclusive cache hit/miss e tokens de raciocínio.
- Uma tentativa por chamada, timeouts total/por chunk, telemetria desligada e erros sanitizados.
- `CODINGPRO_PROVIDER=deepseek` exige chave explícita; replay continua sem rede.
- Bundle da CLI autossuficiente e smoke real sintético com bloqueio obrigatório no CI.
- Saída headless remove controles C0/C1, ANSI/OSC e marcadores bidi perigosos.

### Decisões

- A URL, o modelo e os headers não são configuráveis no F0.2b, reduzindo risco de exfiltração.
- Tests recebem um `fetch` sintético; nenhuma suite comum pode cair no transporte global.
- Retry/backoff e tools continuam no F1; capabilities anunciam `tools: false` nesta etapa.
- O AI SDK não grava telemetria e seu callback de erro padrão foi neutralizado.
- O smoke real não imprime resposta, reasoning, chave ou causa de erro.

### Validação

Consulte o roteiro [F0.2b](roteiros-qa/f0.2b-deepseek.md). Validação local sem rede com
Node 24.18.0 e pnpm 10.34.4:

- 70/70 testes aprovados;
- cobertura global: 94,62% statements, 92,61% branches, 97,82% functions e 94,54% lines;
- adaptador DeepSeek: 92,68% statements, 92,85% branches, 100% functions e 92,62% lines;
- typecheck, build autossuficiente e instalação offline do tarball aprovados;
- gates do smoke recusaram corretamente execução sem autorização e dentro de CI.
- CI remoto verde no Node 24.11/24.18 Linux e 24.18 macOS:
  [execução 29947294481](https://github.com/alvaro209890/CodingPro/actions/runs/29947294481).

Com autorização explícita do operador, o smoke real foi aprovado usando a chave de origem Hermes
por um loader mínimo que repassou somente `DEEPSEEK_API_KEY`. Em seguida, o binário compilado
`codingpro -p` também respondeu corretamente a um prompt sintético dentro de HOME/projeto
temporários, sem imprimir resposta bruta ou credencial no relatório do teste.

### Próximo incremento

Depois do smoke real autorizado, implementar configuração em camadas (global → projeto → flags)
e continuar os spikes restantes da F0.

## 2026-07-22 — F0.2c: configuração em camadas protegida

### Entregue

- Loader JSONC v1 para `~/.codingpro/settings.json` e `<cwd>/.codingpro/settings.json`.
- Precedência campo a campo: global → projeto → ambiente legado → flags.
- Flags `--provider` e `--replay-file`, com validação e ajuda em pt-BR.
- Parser `jsonc-parser@3.3.1` fixado e incluído no bundle autossuficiente.
- Caminhos de replay resolvidos conforme a origem da camada.
- Smoke do tarball cobrindo global, projeto e flags com HOME/cwd descartáveis.

### Decisões de segurança

- O schema aceita somente `version`, `provider` e `replay.file`; credenciais, endpoint, headers,
  modelo, includes, interpolação e execução de código são rejeitados.
- O arquivo do projeto é não confiável: pode selecionar apenas replay, nunca DeepSeek.
- Não há busca em ancestrais no F0.2c; somente o `cwd` inicial representa o projeto.
- Arquivos têm limite de 64 KiB e são lidos uma vez por descriptor com `O_NOFOLLOW`.
- Symlinks, hardlinks, arquivos não regulares, mudança durante leitura e escrita por grupo/outros
  falham fechado; fixture de projeto é validada/lida pelo mesmo descriptor e vira snapshot.
- `DEEPSEEK_API_KEY` não participa do merge e sua mera presença nunca ativa rede.

### Validação

Consulte o roteiro [F0.2c](roteiros-qa/f0.2c-config.md). Validação local com Node 24.18.0 e
pnpm 10.34.4:

- 118/118 testes aprovados;
- cobertura global: 93,80% statements, 91,83% branches, 98,48% functions e 93,73% lines;
- loader de config: 92,66% statements, 90,32% branches, 100% functions e 92,62% lines;
- typecheck, build e instalação offline do tarball aprovados;
- smoke DeepSeek real e binário `codingpro -p` real aprovados com prompt sintético.

O primeiro CI da F0.2c ([execução 29950048386](https://github.com/alvaro209890/CodingPro/actions/runs/29950048386))
expôs duas suposições dos testes: o `umask` do runner podia remover o bit inseguro solicitado na
criação do arquivo, e o macOS canonicaliza `/var` como `/private/var`. As fixtures passaram a
aplicar `chmod` explicitamente e a comparar diretórios temporários canonicalizados.

A execução seguinte ([29950160285](https://github.com/alvaro209890/CodingPro/actions/runs/29950160285))
aprovou testes e builds nos três runners, mas o smoke offline detectou que o parser já embutido no
bundle ainda constava como dependência de runtime do tarball. Ele foi movido para dependência de
desenvolvimento, evitando qualquer download na instalação do artefato autossuficiente.

CI final verde no Node 24.11/24.18 Linux e Node 24.18 macOS:
[execução 29950272198](https://github.com/alvaro209890/CodingPro/actions/runs/29950272198).

### Próximo incremento

Após a F0.2c, a decisão de produto foi fechada: o único provider de LLM para código será a API
oficial DeepSeek, limitada a `deepseek-v4-pro` e `deepseek-v4-flash`. Outras formas de
inferência e outros fornecedores saíram do plano. O provider `replay` permanece como harness
sintético de testes, sem inferência nem rede.

Executar o F0.3: tool calling multi-turno no V4 Pro e V4 Flash, preservar reasoning entre turnos
e evoluir os contratos Provider/Tool. O roteamento automático Pro/Flash entra logo depois.

Revisão documental aprovada nos gates de arquitetura, segurança e consistência; CI verde no Node
24.11/24.18 Linux e 24.18 macOS:
[execução 29951543077](https://github.com/alvaro209890/CodingPro/actions/runs/29951543077).

## 2026-07-22 — F0.3: tools multi-turno no DeepSeek V4

### Entregue

- Contratos `Tool`, `ToolCall`, `ToolResult`, `ToolChoice` e mensagens `role: tool` independentes
  do AI SDK.
- `Tool` é um descritor puro: não contém `execute`; nenhum código de tool roda dentro do provider.
- Subconjunto JSON Schema fechado, com raiz object, `additionalProperties: false`, limites de
  tamanho/profundidade e rejeição de chaves de prototype.
- Validação fail-closed de schemas, argumentos sem coerção, IDs, nomes, resultados e sequência do
  transcript antes da rede.
- Allowlist interna exata e imutável `deepseek-v4-pro|deepseek-v4-flash`; Pro continua o default.
- Streaming de calls completas após remontagem dos fragmentos SSE, inclusive calls paralelas. As
  calls ficam em buffer e só são publicadas depois de um finish terminal coerente.
- Finish assistant preserva texto, reasoning e tool calls; o segundo request devolve
  `reasoning_content` e `tool_calls` intactos antes da mensagem de resultado.
- Replay estrito de múltiplos turnos e headless fail-closed enquanto não existe executor da F1.
- Smoke real em memória `19 + 23 = 42` nos dois modelos, sem filesystem, shell ou saída bruta.

### Decisões e segurança

- O provider permanece single-step. O futuro core decide permissão, executa e chama o mesmo
  provider novamente; não usamos `execute`, `stopWhen` nem `ToolLoopAgent` do AI SDK.
- Inputs são validados pelo callback de `jsonSchema`, pois no AI SDK 7 o JSON Schema sem callback
  apenas faz parse do JSON e não garante conformidade semântica.
- Tool calls desconhecidas, dinâmicas, provider-executed, malformadas, fora do schema ou com ID
  duplicado são rejeitadas sem expor argumentos.
- Requests, schemas, calls, resultados e fixtures em memória são copiados para snapshots canônicos;
  accessors, símbolos e propriedades ocultas são recusados. Objetos entregues ao consumidor não
  compartilham referência com o finish interno.
- Um resultado só pode aparecer após a call pendente de mesmo ID e nome. Todas as calls precisam
  de resultado antes de outro turno de usuário/assistente.
- `maxRetries` permanece zero. Política de retry pós-efeito e execução exatamente uma vez entram
  junto do journal/checkpoint da F1.
- No serviço real, `tool_choice=required` e a escolha nominal retornaram HTTP 400 quando thinking
  estava ligado; `auto`/`none` passaram em Pro e Flash. Essa combinação agora falha localmente e
  continua disponível com thinking desligado.

### Validação

Consulte o roteiro [F0.3](roteiros-qa/f0.3-tools-deepseek.md). Validação local com Node 24.18.0 e
pnpm 10.34.4, sem credenciais no gate comum:

- 167/167 testes aprovados em sete arquivos;
- cobertura global: 93,27% statements, 91,34% branches, 99,12% functions e 93,17% lines;
- `validation.ts`: 91,95% statements e 91,75% lines;
- format check, lint, typecheck, build e smoke offline do tarball aprovados por `pnpm check`;
- smoke real opt-in aprovado no V4 Pro e V4 Flash, dois turnos por modelo, com a credencial
  isolada no processo e somente mensagens de aprovação na saída;
- CI bloqueante verde no Node 24.11/24.18 Linux e 24.18 macOS na
  [execução 29954449299](https://github.com/alvaro209890/CodingPro/actions/runs/29954449299).

### Próximo incremento

Implementar o roteamento interno `main|fast`: Pro para codificação/arquitetura/revisão e Flash
para trabalho mecânico, sem expor provider, endpoint ou ID arbitrário ao usuário. Depois, concluir
os spikes restantes da F0 antes de abrir o loop executável da F1.

## 2026-07-22 — F0.4: roteamento interno `auto|main|fast`

### Entregue

- Módulo puro `packages/llm/src/roles.ts` com papéis fechados `auto|main|fast` e mapeamento
  `main`/`auto` → `deepseek-v4-pro`, `fast` → `deepseek-v4-flash`.
- `parseModelRole` / `isModelRole` / `resolveDeepSeekModelForRole` fail-closed: IDs de modelo,
  providers e strings desconhecidas não são papéis válidos.
- `DeepSeekProvider` aceita `role` de produto; `model` allowlisted permanece para testes/smoke.
  `role` + `model` inconsistentes falham antes de qualquer rede.
- Runtime da CLI (`criarProviderRuntime`) usa `role` opcional com padrão `auto` → Pro no headless
  de codificação; caminhos mecânicos passam `role: "fast"` na API interna.
- Allowlist de modelos e de papéis congeladas; mensagens de erro não vazam a chave.

### Decisões

- Não há flag/config de usuário para escolher ID de modelo ou endpoint. O seletor de produto é só
  o papel interno; heurísticas de auto-effort (doc 14.4) e perfis de agente (F5) virão depois.
- `auto` no estado atual equivale a `main` (qualidade de código). Flash só entra por chamada
  explícita de caminho mecânico, não por picker.
- Constantes de ID em `roles.ts` espelham as do provider sem import circular; testes garantem
  igualdade com `DEEPSEEK_MODEL_PRO|FLASH`.

### Validação

Consulte o roteiro [F0.4](roteiros-qa/f0.4-roteamento-papeis.md). Gate offline com Node 24.18.0
e pnpm 10.34.4, sem credenciais no ambiente comum:

- 181/181 testes aprovados em oito arquivos;
- cobertura global: 93,52% statements, 91,56% branches, 99,15% functions e 93,42% lines;
- `roles.ts` e o caminho DeepSeek do runtime em 100% statements/lines;
- format, lint, typecheck, build e smoke offline do tarball aprovados por `pnpm check`;
- resolução exercitada no artefato `packages/llm/dist`: main→Pro, fast→Flash, auto/default→Pro,
  inválido fail-closed.

### Próximo incremento

Auto-effort v1 (heurísticas + roteador Flash + escalada por falha) e/ou spikes restantes da F0
(Ink+streaming, sqlite FTS5, tree-sitter WASM, checkpoint git) antes do loop executável da F1.

## 2026-07-22 — F3.2: repo map com ranking, orçamento e cache incremental

### Entregue

- `extrairSimbolos` (`packages/core/src/symbols.ts`): extrator de **assinaturas** (não corpos) por
  linha, heurístico e sem dependências, para TS/JS, Python, Java/Kotlin, Go e SQL. Tetos
  anti-patológico (20k linhas / 500 símbolos por arquivo). `linguagemDeArquivo` mapeia extensão→linguagem.
- `construirRepoMap` (`packages/core/src/repo-map.ts`): varre o projeto (ignore + tetos), extrai
  assinaturas, ranqueia arquivos por **referências** (índice invertido de identificadores: quantas vezes
  os símbolos de um arquivo aparecem em outros) + **boost de foco e de vizinhos no grafo**, e monta um
  texto compacto e estável dentro de um **orçamento de tokens** (default ~2000), marcando `truncado`.
- `RepoMapCache` (`packages/core/src/repo-map-cache.ts`): cache incremental invalidado por
  `mtime`+`size`, persistido como JSON best-effort em `.codingpro/repo-map-cache.json` (corrompido → frio).
- Tool de leitura **`repo_map`** (`foco`/`maxTokens`) — entra automática no headless e no chat via
  `READ_ONLY_TOOLS` — e comando **`/mapa`** no chat.

### Decisões

- Backend v1 é heurístico por linha, não tree-sitter: entrega o valor da F3 (mapa ranqueado + tool)
  sem depender do spike de web-tree-sitter/WASM. A troca fica planejada como upgrade do mesmo desenho.
- Cache em JSON em vez de SQLite/FTS5 pela mesma razão: robusto e testável já; SQLite vira upgrade.
- Ranking por grau (referências) em vez de PageRank iterativo: determinístico, O(arquivos), suficiente.

### Validação

- 26 testes offline novos (extração das 5 linguagens, ranking por referências, foco, orçamento e
  truncamento, ignore de `node_modules`/`.git`, cache mtime+size, corrompido→frio, abort); 473 no total.
- `pnpm check` completo aprovado (format, lint, typecheck, cobertura ≥90%/80%, build, smoke do pacote).
- Smoke ao vivo no próprio repo pela CLI buildada: `--chat --provider replay` + `/mapa` lista os
  arquivos e assinaturas ranqueados; `construirRepoMap` com `foco` prioriza o arquivo pedido.

### Próximo incremento

Bater o marco da F3 (pergunta de arquitetura respondida certo em repo médio) e então iniciar a **F4 —
memória persistente** (store markdown+frontmatter, `MEMORY.md`, tool `remember`, retrieval no turno).

## 2026-07-22 — F4: memória persistente (store + retrieval + remember)

### Entregue

- `memory.ts` (puro): tipos, frontmatter (serializar/parse), `slugify`, índice `MEMORY.md`
  (`gerarIndice`), retrieval léxico (`buscarMemorias`/`pontuarMemoria`), guarda de segredo
  (`pareceSegredo`) e composição do bloco de memória do prompt (`montarBlocoMemoria`).
- `memory-store.ts`: `MemoryStore` sobre um diretório (global `~/.codingpro/memory` e do projeto
  `.codingpro/memory`). `remember` (reforça em vez de duplicar; recusa segredo), `forget` (arquiva
  em `_archive/`, registra `_changelog.md`), `list`/`get`/`reindexar`/`indice`/`buscar`. Cria o
  diretório só na primeira escrita.
- Tool `remember` (`tools/remember.ts`): grava na memória por tipo/escopo; pré-autorizada no gate.
- Permissões: `PermissionPolicy.alwaysAllow` libera tools sem efeito no projeto (ex.: `remember`)
  antes da regra de checkpoint; nunca vence a denylist.
- Runtime: `memory-runtime.ts` (`criarMemoriaSessao`, `promptDoTurno`) injeta índices + retrieval no
  system prompt a cada turno, no chat e no headless. Comandos `/lembrar` e `/memory list|forget|edit`.
  Diretório global injetável (`raizMemoriaGlobal`) para isolar testes do `$HOME` real.

### Decisões

- Retrieval léxico e índice em memória (não SQLite/FTS5): robusto e testável já; FTS5 vira upgrade.
- `remember` classificada como efeito de escrita, mas pré-autorizada, porque escreve só na memória
  da CLI — nunca no projeto do usuário. Assim o modelo aprende sem spammar prompts de aprovação.
- Consolidador: a parte mecânica (arquivar/changelog/reindexar) entrou; a extração/merge por LLM
  (DeepSeek Flash) fica de upgrade, com regra de nunca escrever fora de `memory/`.

### Validação

- 41 testes offline novos (frontmatter round-trip, retrieval, guarda de segredo, upsert/reforço,
  arquivamento, comandos de chat, injeção no prompt, `alwaysAllow`); 507 no total.
- `pnpm check` completo aprovado.
- Smoke ao vivo pela CLI buildada: `/lembrar` gravou o fato no formato Markdown+frontmatter correto,
  gerou o `MEMORY.md` e listou; retrieval reinjeta o corpo relevante no turno seguinte.

### Próximo incremento

F5 — multi-agente (modo subagente stdio/JSON-RPC, orquestrador paralelo com tetos de custo, tarefas
em background com notificação, modo planejamento arquiteto→plano→aprovação).

## 2026-07-23 — F5: subagentes, orquestrador paralelo e modo planejamento

### Entregue

- `agent-types.ts`: 4 tipos de fábrica (explorer/worker/architect/reviewer) com perfil (role
  auto|main|fast), tools permitidas e system prompt; `parseTipoAgente` lê custom de
  `.codingpro/agents/*.md` (frontmatter role/tools + corpo = prompt); `resolverTipoAgente`.
- `subagent.ts`: `executarSubagente` roda um subagente com contexto ISOLADO (só as tools do tipo,
  system prompt do tipo, tarefa como único input), tetos de passos + timeout, e interrupção
  (tempo/cancelamento) vira relatório parcial em vez de erro. `orquestrarSubagentes` roda N tarefas
  com concorrência limitada preservando a ordem. `SubagenteSpawner` (injetado no ToolContext).
- Tool `task`: delega até 8 subtarefas a subagentes em paralelo e consolida os relatórios — habilita
  "revise com 3 revisores em paralelo". Não aninha (o pool do subagente não inclui `task`).
- CLI `subagent-runtime.ts`: `carregarTiposCustom` + `criarSpawnerSubagentes` (reusa o provider da
  sessão). Ligado ao chat e ao headless (context.subagentes + tool `task`). Comando `/plan <objetivo>`
  roda o arquiteto (só leitura) e salva o plano em `.codingpro/plans/AAAA-MM-DD-slug.md`.

### Decisões

- Subagentes in-process (não subprocesso stdio/JSON-RPC): entrega a orquestração paralela e o
  isolamento de contexto já, testável offline; o subprocesso JSON-RPC fica de upgrade.
- Reusam o provider da sessão (roteamento por papel Pro/Flash fica de upgrade).
- Efeitos de subagente passam pelo gate sem aprovador → negados fail-closed (como o headless).
- Tetos v1 = passos + timeout; interrupção por custo fica de upgrade.

### Validação

- 30 testes offline novos; 526 no total. `pnpm check` completo aprovado.
- `/plan` validado de ponta a ponta no teste de integração do chat (arquiteto → plano salvo em disco).

### Próximo incremento

F6 — extensibilidade (cliente MCP stdio, skills .md com auto-sugestão, hooks pre/post/stop).

## 2026-07-23 — F6 (skills/hooks/MCP), F8 (/review, undercover) e F9 (release parcial)

### Entregue

- **F6 Skills**: `skills.ts` (parse + `sugerirSkills` + `blocoSkill`), CLI `skills-runtime.ts`,
  comandos `/skills`/`/skill`, injeção no prompt e auto-sugestão.
- **F6 Hooks**: `hooks.ts` (`executarHook` com veto, `criarHookRunner`, `rodarHooksStop`; grupo de
  processo morto no timeout), integrados ao `ToolGate` (novo 3º parâmetro), config em `settings.hooks`.
- **F6 MCP**: `mcp.ts` (`McpClient` stdio JSON-RPC + `toolsDoServidorMcp`), CLI `mcp-runtime.ts`
  (config `mcpServers`), ligado ao chat. Revisão de protocolo por subagente DeepSeek → 3 fixes.
- **F8**: `/review` (subagente reviewer sobre o diff, `review-runtime.ts`), undercover
  (`attribution.ts` + `attribution-runtime.ts`) no system prompt.
- **F9**: `install.sh`, comando `--doctor` (`doctor.ts`, puro + IO), `docs/GUIA-DO-USUARIO.md`,
  package.json publicável.

### Decisões

- MCP in-process minimal (sem SDK externo, sem SSE); skills/hooks/atribuição carregados no CLI e
  passados às runtimes (IO desacoplado, testável). Backends v1 heurísticos, upgrades documentados.
- Delegação a subagentes DeepSeek V4 Pro (autorizada pelo Álvaro): rascunhos de install.sh/doctor/README
  e revisão do cliente MCP; tudo validado e integrado com as ferramentas locais, nunca aplicado às cegas.

### Validação

- 591 testes offline; `pnpm check` completo (format, lint, typecheck, cobertura ≥90%/80%, build,
  smoke de pacote). Teste E2E ao vivo como usuário (HOME isolado + projeto git): `--ajuda`, `--doctor`,
  `-p`, e chat com `/mapa` `/init` `/lembrar` `/memory` `/skills` `/skill` — todos ok, artefatos criados.

### Próximo incremento

Fechar a Fase 1: hardening dedicado + evals no CI; polimento cosmético F8 (Ink/temas/pet) é pós-1.0 e
não bloqueia a Fase 2. Depois, iniciar a Fase 2 (app Windows) reusando o núcleo.

## 2026-07-23 (sessão 2) — Revisão, correções e auto-effort

### Entregue

- **Revisão profunda de código**: 24 issues encontradas por subagente composer (1 crítico, 8 altos,
  10 médios, 5 baixos). Nenhuma de path traversal — as defesas do `Workspace` são sólidas.
- **7 bugs corrigidos**: race condition no transcrito do agente (C-01), memory leaks no bash/MCP/hooks
  (A-01, A-05), race condition pós-settle no bash (A-02), hook stdin.end() travando (A-03),
  colisão de IDs MCP (A-04), schema MCP sem validação (A-07).
- **Auto-effort v1**: módulo `packages/core/src/auto-effort.ts` com `resolverAutoEffort` que escolhe
  Flash (tarefas simples/contexto pequeno) vs Pro (edição, contexto grande, falha). Escala
  automaticamente — usuário nunca escolhe. 12 testes.
- **Integração no chat-runtime**: auto-effort ativo a cada turno, com indicador "Flash"/"Pro" no
  progresso.
- **Loop de qualidade**: após cada turno com `write_file`/`edit_file`, biome check nos arquivos
  afetados com feedback "✓ limpo" ou "✗ N problema(s)".
- **Comandos em português** com aliases EN: `/desfazer`=/undo, `/refazer`=/redo, `/plano`=/plan,
  `/mapa`=/map, `/lembrar`=/remember, `/sair`=/exit.
- **Documentação atualizada**: CHECKLIST_MESTRE.md, READMEs das Fases 2/3, CODINGPRO.md.
- **CI verde**: 615 testes (54 arquivos), typecheck, build e smoke de pacote passando.

### Próximo

Polimento restante (visual Aurora, i18n completo, evals) é pós-1.0. Iniciar Fase 2 (app Windows).

## 2026-07-23 — Solidificação da Fase 1 + identidade visual Aurora

### Correções (revisão/solidificação)
- **Segurança (crítico):** loop de qualidade tinha injeção de comando (`execSync` com caminhos do
  modelo interpolados em shell) → reescrito com `execFile` (sem shell), gate por `biome.json`, async,
  extraído para `quality-runtime.ts` testável.
- **Código morto:** removido o protótipo `packages/tui` (Ink 5/React 19) + `tui-runtime.ts` — não
  integrado (`--tui` inexistente), input não resolvia, sem testes, quebrava o build. Preservado no git.
- **Bugs menores:** `auto-effort` usava lista inline em vez da const `HEAVY_TOOL_NAMES` (drift);
  variável `houveErro` morta; imports/vars não usados; optional chain.
- **Cobertura:** testes white-box das guardas defensivas do MCP (colisão de ID, write síncrono, flag
  fechado); cobertura completa do quality-runtime e do tema.

### Identidade visual "Aurora" (front bonito)
- `packages/cli/src/tema.ts`: camada visual **ANSI pura** (não Ink) — banner com **gradiente
  esmeralda→ciano→violeta**, cabeçalho de projeto, régua, prompt ❯ violeta, eventos de ferramenta em
  ciano, aprovação/erro/sucesso coloridos. `detectarNivelCor` (truecolor/256/16/NO_COLOR/FORCE_COLOR)
  com degradação para texto limpo em pipe. Ligado ao `--chat` e ao prompt; testado.
- Decisão: entregar a identidade Aurora por ANSI sobre o readline em vez do full-screen Ink —
  bonito, robusto e testável, sem a fragilidade do protótipo removido.

### Validação
- 623 testes offline; `pnpm check` completo verde. Smoke visual ao vivo (banner + cores). CLI real
  validada de ponta a ponta com `codingpro --chat/-p/--doctor` (chamada DeepSeek real → ok).

## 2026-07-23 — Fechamento Fase 1 / CLI 1.0 (hardening + evals offline)

### Entregue

- **Suite de robustez offline** (`hardening-evals`) em `packages/core` e `packages/cli`:
  - caminhos com **espaço e acento** (`Área de Trabalho`, `pasta com espaço/módulo.ts`) em
    `Workspace`, `read_file`/`write_file`/`list_dir` e `construirRepoMap`;
  - **tetos** em árvore densa (`maxArquivos`, `REPO_MAP_MAX_ARQUIVOS`, `AbortSignal`, `detectarProjeto`);
  - **chave ausente/inválida** fail-closed (`criarProviderRuntime`, `DeepSeekProvider`, `executarCli`);
  - **sem rede** via `fetch` injetado → `provider-failed` seguro (sem vazar canário) e exit 2 na CLI;
  - `doctor` sem vazar valor de chave; duas execuções consistentes.
- Script **`pnpm test:evals`** (também coberto por `pnpm test` / `test:coverage` / CI `pnpm check`).
- **CHECKLIST_MESTRE**: hardening + evals CI marcados feitos; upgrades tree-sitter/SQLite/subprocesso,
  voz F7, pet, QA visual e `npm publish` explicitamente **pós-1.0** ou passo do Álvaro.
- Marco de engenharia: **núcleo da Fase 1 / CLI 1.0 fechado offline**.

### Diferido (não bloqueia Fase 2)

- F7 voz (1.1); pet/XP; Ink full-screen / 4 temas; backends F3/F4/F5 “upgrade”; marcos ao vivo com
  DeepSeek (3 revisores, MCP externo, 1h de uso); `npm publish` + setup em máquina limpa.

### Validação

- `pnpm test:evals` verde; gate completo `pnpm check` após a rodada; push em `origin/master`.

## 2026-07-23 — Chat interativo rico (autocomplete `/` + animações)

### Entregue

- **Autocomplete de comandos** ao digitar `/` (catálogo canônico em `commands.ts`), navegação
  **↑↓**, **Tab** completa, **Enter** envia, **Esc** fecha — state machine pura em
  `prompt-input.ts` + TTY raw mode em `prompt-tty.ts`.
- **Animações**: banner de abertura com faíscas, spinner braille durante o turno do agente,
  timeline de ferramentas, tema Aurora com caixa e dica de atalhos.
- Integração em `index.ts` (TTY rico; pipe mantém `line-reader`). Chat usa `io.abrir` + `io.spinner`.
- Testes: `commands`, `prompt-input`, `animacao`, `prompt-tty` + gate completo.

### Como rodar neste PC

O launcher `~/.local/bin/codingpro` já aponta para `packages/cli/dist/index.mjs` com Node 24.
Após `pnpm build` na raiz do repo: `codingpro --chat`.

## 2026-07-23 — Checklist alinhado + plano de auto-correção lint/format

### Docs

- **CHECKLIST_MESTRE**: itens stale marcados conforme o código (LLM Layer, visual TTY/spinner,
  pré-F0 superados pela v1, spikes F0 como pós-1.0). Item novo: auto-correção lint/format
  (próximo incremento; v1 continua só `biome check`).
- **Planos**: doc **14.5.1** (fluxo biome `--write` + re-turno da IA, regras de segurança/config);
  **07.6** (edição/projeto); **04** F1.x; **01** visão atualizada.

### Código

Sem mudança de runtime nesta rodada — só alinhamento documental e especificação do próximo
incremento de qualidade.

## 2026-07-23 — Auto-correção lint/format + tema Windows CMD/SSH

### Código

- **`corrigirQualidade`**: `biome check --write` nos arquivos tocados → recheck; resultado
  estruturado; env `CODINGPRO_QUALITY_AUTOFIX` / `CODINGPRO_QUALITY_MAX_REPAIR`.
- **Chat**: após turno com escrita, auto-fix mecânico; se residual, re-turno da IA com
  `promptReparoQualidade` (teto configurável).
- **Tema**: `detectarAscii` + glifos ASCII (`+--`, `>`, `*`) e 16 cores no CMD Windows / TERM=dumb;
  Windows Terminal / VS Code mantêm Unicode + truecolor. Spinner ASCII `|/-\\` no modo ascii.
- Banner animado e prompt TTY respeitam `tema.ascii`.

### Validação

- `pnpm check` verde; testes quality/tema/chat (reparo) incluídos.
- Launcher local `~/.local/bin/codingpro` → `dist/index.mjs` (Node 24).

### Como testar

```bash
codingpro --chat
# após uma edição com biome.json no projeto: veja "formatando…" e "✓ limpo (auto-corrigido)"
CODINGPRO_ASCII=1 codingpro --chat   # simula CMD
```

## 2026-07-23 — /plan interativo + plano ativo na sessão

### Problema
`/plan` salvava o plano em disco e exibia, mas **não** injetava no histórico/system prompt;
pedir “execute o plano” depois fazia o modelo agir sem o conteúdo planejado.

### Correção
- `plan-runtime.ts`: fase de **perguntas** (Markdown `# PERGUNTAS` + opções A/B) com seleção
  numérica; depois plano final; `blocoPlanoAtivo` no system prompt a cada turno.
- Histórico da sessão: mensagens user/assistant com o plano.
- `/plan clear` limpa o plano ativo.
- Testes unitários + chat (relembrar no 2º turno; Q&A com opção 2).

### Uso
`/plan <objetivo>` → (perguntas) → plano → “execute o plano”.

## 2026-07-23 — Front moderno + status de tokens + /compact + auto-compact 1M

### Visual
- Logo wordmark multi-linha (Unicode ou ASCII p/ CMD), banner animado ampliado.
- `statusLinha` no tema: cantinho com custo da sessão, in/out, cache, ctx, barra, restante e janela 1M.

### Contexto / custo
- `status.ts`: `DEEPSEEK_CONTEXT_WINDOW=1_000_000`, default budget **800_000**, stats de sessão.
- Auto-compact **sempre ativo** no chat/agente via `contextBudget` (antes só com `--max-contexto`).
- `/compact` e `/compactar` forçam compactação (~45% do orçamento).
- `/custo` mostra **sessão** acumulada + contexto restante (não só o último turno).
- `somarCustos` em `@codingpro/llm`.

### Validação
- `pnpm check` verde; testes status/tema/chat/cost.

## 2026-07-23 — Busca vetorial local (SQLite FTS5 + embeddings offline)

### Arquitetura
- `vector/chunking.ts` — fragmentação por headers de linguagem + janelas
- `vector/embeddings.ts` — embedding local 256-d (hashing trick, L2)
- `vector/vector-store.ts` — SQLite (`node:sqlite`): files/chunks/FTS5 + BLOB
- `vector/vector-index.ts` — varredura incremental (mtime/size), ignore dirs
- Tool `code_search` + comando chat `/index` (spinner)
- System prompt orienta repo_map → code_search → read_file

### DB
`.codingpro/vector-index.sqlite` — 100% local, sem sqlite-vss nativo, sem rede.

### Validação
Testes de chunking/embeddings/store/tool; `pnpm check` verde.

## 2026-07-23 — Documentação consolidada do estado da Fase 1

### Entregue
- `docs/ESTADO_PROJETO.md`: visão única do que a CLI é, estrutura, features, como rodar neste PC,
  arquitetura, testes, o que falta e linha do tempo de commits.
- README e CHECKLIST_MESTRE apontam para o estado atual (vector search, auto-compact, front limpo).
- Front fix já no master (`45d6a44`): header compacto, sem dump de comandos, spinner estável.

### Como o Álvaro testa
```bash
codingpro --chat
```

## 2026-07-23 — Instalação via WSL + chat "travando" na abertura (unsettled top-level await)

### Contexto
CLI instalada num 2º ambiente (WSL Ubuntu, Node 24 via `nvm`, chave DeepSeek em
`~/.config/codingpro/deepseek.env`, provider fixado em `~/.codingpro/settings.json`). Ao rodar
`codingpro --chat` num terminal WSL real, o processo imprimia
`Warning: Detected unsettled top-level await` e voltava direto pro prompt do shell — o chat nunca
abria.

### Causa
No reveal animado do banner (`prompt-tty.ts`), os timers do `await esperar(ms)` usavam
`setTimeout(...).unref()`. Isso diz ao Node "não conte comigo pra manter o processo vivo". Bem no
início da execução — antes do stdin entrar em modo raw e de qualquer outro handle referenciado —
não sobrava nada segurando o event loop, então o runtime concluía que não havia mais trabalho
pendente e encerrava o processo no meio da animação, emitindo o aviso em vez de esperar a Promise
assentar.

Em paralelo (outra sessão, mesmo repositório), foi enviado um fix complementar e mais abrangente
para a mesma classe de sintoma ("chat parece travado ao abrir"): banner instantâneo por padrão
(animação vira opt-in via `CODINGPRO_BANNER_ANIM=1`), banner impresso *antes* do
provider/hooks/MCP carregarem (com mensagens de progresso intermediárias), recusa clara quando
`stdin` não é um TTY real (antes o chat "piscava" o banner e saía no primeiro EOF), 2º Ctrl+C força
saída, e `process.exit` adiado com `setImmediate` pra não cortar stdout/stderr no meio do flush.
Esse fix não removia o `unref()` — só deixou de exercitar aquele caminho por padrão. Sem a correção
abaixo, o mesmo travamento voltaria a acontecer para quem ligasse `CODINGPRO_BANNER_ANIM=1`.

### Correção
- `prompt-tty.ts`: removido o `unref()` dos timers do reveal do banner — eles estão no caminho
  principal (`await` direto), então precisam manter uma ref ativa até resolver.

### Validação
- `pnpm typecheck` / `pnpm lint` / `pnpm vitest run packages/cli` verdes (as 2 falhas de
  `config.test.ts` são checagem de permissão via `chmod`/symlink, específicas de NTFS no Windows,
  pré-existentes e não relacionadas).
- Smoke real num pty do WSL (`script -qec "codingpro --chat" log`): banner completo aparece, chat
  chega no prompt interativo e fica esperando input — sem o aviso.
