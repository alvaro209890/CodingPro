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
  isolada no processo e somente mensagens de aprovação na saída.

### Próximo incremento

Implementar o roteamento interno `main|fast`: Pro para codificação/arquitetura/revisão e Flash
para trabalho mecânico, sem expor provider, endpoint ou ID arbitrário ao usuário. Depois, concluir
os spikes restantes da F0 antes de abrir o loop executável da F1.
