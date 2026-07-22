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
