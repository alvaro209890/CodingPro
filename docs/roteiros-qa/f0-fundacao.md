# Roteiro de QA — F0.1 fundação

## Pré-condições

- Checkout limpo do repositório.
- Node 24.18.0 disponível pelo nvm.
- Nenhuma chave de API é necessária.

## Passos automatizados

```bash
nvm use
pnpm install --frozen-lockfile
pnpm check
```

Resultado histórico ao encerrar o F0.1: lint, typecheck, 11 testes, cobertura e build passaram;
o bundle executável foi gerado em `packages/cli/dist/index.mjs`. A contagem corrente cresce a
cada incremento e fica registrada no roteiro da etapa correspondente.

## Smoke test

```bash
NO_COLOR=1 node packages/cli/dist/index.mjs --ajuda
NO_COLOR=1 node packages/cli/dist/index.mjs --versao
NO_COLOR=1 node packages/cli/dist/index.mjs --inexistente
```

Resultados esperados:

- ajuda sai em stdout, em pt-BR, com código 0;
- versão imprime `0.1.0` e sai com código 0;
- opção desconhecida sai em stderr, em pt-BR, com código 1;
- o artefato começa com `#!/usr/bin/env node` e tem permissão de execução;
- nenhum passo acessa LLM, carrega `.env` ou cria estado em `~/.codingpro`.

## Empacotamento

```bash
pnpm --filter codingpro pack --pack-destination /tmp/codingpro-pack
```

Esse teste já faz parte de `pnpm check`: instala o tarball offline em um prefixo temporário,
executa `codingpro --version`, `cpro --help` e o caso de erro, e confere shebang/permissão.
