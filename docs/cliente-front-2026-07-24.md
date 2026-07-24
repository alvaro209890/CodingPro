# Renovação do front do cliente — 24 de julho de 2026

## Objetivo

Atualizar visualmente toda a experiência voltada ao cliente sem mudar contratos da API, URLs, autenticação ou fluxos de conta. A referência adotada é o sistema Aurora do aplicativo desktop: escuro, técnico, legível e com detalhes em esmeralda, ciano e violeta.

## Áreas atualizadas

| Área | Melhoria |
| --- | --- |
| Navegação global | Cabeçalho translúcido, marca com sinal visual, ações mais claras, comportamento responsivo e rodapé informativo. |
| Landing | Hero com proposta de valor, prévia visual da CLI, roteiro de instalação, benefícios e passos de ativação. |
| Login | Cartão de acesso com hierarquia, marca e chamada orientada ao workspace. |
| Cadastro | Fluxo de criação de conta com mensagem de beta, estados e CTA destacados. |
| Painel | Cabeçalho de conta, indicador de estado e cards de consumo com melhor leitura visual. |
| Playground | Mantém a linguagem Aurora entregue anteriormente em CLI, terminal, arquivos, editor e memória. |

## Decisões de design

- A paleta existente foi preservada para não descaracterizar o produto e manter contraste no modo escuro.
- A landing evita imagens externas e afirmações novas: a prévia é uma representação visual da CLI, feita em HTML/CSS e baseada em recursos que o produto já oferece.
- Cards, botões e métricas receberam profundidade discreta, animações curtas e estados de foco/hover para comunicar interatividade sem reduzir desempenho.
- Em telas pequenas, a navegação esconde links secundários e os grids de recursos passam gradualmente para uma coluna.

## Arquivos alterados

- `packages/web/src/ui/App.tsx`
- `packages/web/src/ui/estilo.css`
- `packages/web/src/ui/paginas/Landing.tsx`
- `packages/web/src/ui/paginas/Entrar.tsx`
- `packages/web/src/ui/paginas/Cadastro.tsx`
- `packages/web/src/ui/paginas/Painel.tsx`

## Validação

```bash
pnpm --filter @codingpro/web typecheck
pnpm --filter @codingpro/web build
git diff --check
```

Os três comandos foram executados com sucesso nesta entrega. Para publicar no VPS, siga o processo em `docs/playground-workspace.md`: `pnpm plataforma:build` e reinicie `codingpro-api` e `codingpro-web`.
