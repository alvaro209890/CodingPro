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
- `pnpm audit --prod`: nenhuma vulnerabilidade conhecida.

### Próximo incremento

F0.2: contrato pequeno de Provider + provider replay/fake, `codingpro -p "olá"` offline nos
testes e smoke DeepSeek manual/opt-in sem expor credenciais.
