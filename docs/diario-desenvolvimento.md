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

Consulte o roteiro [F0.2b](roteiros-qa/f0.2b-deepseek.md). Validação offline local com
Node 24.18.0 e pnpm 10.34.4:

- 70/70 testes aprovados;
- cobertura global: 94,62% statements, 92,61% branches, 97,82% functions e 94,54% lines;
- adaptador DeepSeek: 92,68% statements, 92,85% branches, 100% functions e 92,62% lines;
- typecheck, build autossuficiente e instalação offline do tarball aprovados;
- gates do smoke recusaram corretamente execução sem autorização e dentro de CI.

O smoke com API real não foi executado: ele permanece pendente de opt-in explícito.

### Próximo incremento

Depois do smoke real autorizado, implementar configuração em camadas (global → projeto → flags)
e continuar os spikes restantes da F0.
