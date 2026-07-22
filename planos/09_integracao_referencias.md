# 09 — Estratégia de Integração das Referências

## Postura sobre as fontes

- ✅ **Usar:** código de projetos open source com licença permissiva (respeitando atribuição/NOTICE), documentação pública, comportamento observável de produtos.
- ❌ **Não usar:** código proprietário vazado (o prompt original citava "código vazado do Claude Code" — não vamos buscar nem incorporar isso). Todos os conceitos desejados têm equivalente público; nada de valor se perde.
- Obrigações: manter arquivo `THIRD_PARTY_NOTICES.md` no repo da CLI com créditos/licenças de tudo que for portado.

## Licença do CodingPro × código portado (decisão 2026-07-22)

O CodingPro é **proprietário source-available** (LICENSE na raiz: código público p/ leitura/estudo; uso/cópia/modificação exigem autorização do Álvaro). Isso é **compatível** com portar código Apache-2.0 (Cline/Aider) e MIT (opencode): essas licenças permitem incorporação em software proprietário, desde que:

1. cada arquivo portado preserve o aviso de copyright/licença original no cabeçalho;
2. `THIRD_PARTY_NOTICES.md` liste tudo (repo, commit, arquivos, licença íntegra);
3. os trechos portados continuam sob a licença deles — só o código **nosso** é proprietário.

Consequência: **nunca portar código GPL/AGPL/LGPL** (incompatível com fechado) — checar a licença de qualquer fonte nova antes de copiar 1 linha.

## O que tirar de cada projeto

### Cline (Apache-2.0, TypeScript) — maior fonte de código portável

| Área | O que aproveitar | Como |
|---|---|---|
| Aplicação de diffs | Parser/aplicador de blocos search-replace com recuperação de erro | Portar lógica p/ `packages/tools` |
| Tree-sitter | Queries prontas de extração de símbolos por linguagem | Reusar arquivos de query (`.scm`) |
| Checkpoints | Estratégia de shadow git p/ snapshot/restauração | Estudar e adaptar |
| Prompt engineering | Estrutura do system prompt de tool use | Inspiração (reescrever no nosso tom) |
| Cliente MCP | Integração com `@modelcontextprotocol/sdk` | Estudar fluxo de descoberta/config |

### Aider (Apache-2.0, Python) — fonte de **conceitos** (não portamos Python)

| Área | O que aproveitar |
|---|---|
| Repo map | Algoritmo: tree-sitter → grafo de referências → ranking → orçamento de tokens (reimplementar em TS) |
| Formatos de edição | Evidência empírica de que search/replace > diff unificado p/ LLMs; regras de match |
| Undo via git | UX do `/undo` de um comando |
| Benchmarks | Metodologia de eval de edição de código (polyglot benchmark) p/ nosso doc 10 |
| Arquiteto/editor | Padrão de dois modelos (planeja forte, edita barato) |

### OpenCode — sst/opencode (MIT, TypeScript)

| Área | O que aproveitar |
|---|---|
| Isolamento da integração LLM | Separação entre runtime, transporte DeepSeek, capabilities, erros e sessões |
| Sessões | Estrutura de armazenamento e retomada de sessões |
| TUI | Padrões de layout/atalhos de chat no terminal |
| Agentes | Separação agente primário vs subagentes com tools restritas |

> Nota: o repo `opencode-ai/opencode` citado no prompt foi renomeado/forkado — as linhagens atuais são **sst/opencode** (TS) e **charmbracelet/crush** (Go). Usaremos sst/opencode por ser TS. Confirmar estado/licença de ambos ao iniciar a F0.

### Claude Code (docs públicas + experiência de uso) — fonte de **UX**

Padrões a replicar por observação (sem código): permissões com allowlist incremental, `CLAUDE.md`→`CODINGPRO.md`, skills/comandos em Markdown, hooks, modo plan, subagentes nomeados, statusline, `-p`/headless, compactação automática.

## Processo de mineração (tarefa da F0/contínua)

- [ ] Clonar os 3 repos de referência em `~/Documentos/CodingPro/referencias/` (gitignored no futuro repo da CLI)
- [ ] Confirmar licenças exatas (LICENSE de cada um, na versão clonada) e registrar em `THIRD_PARTY_NOTICES.md`
- [ ] Mapear no Cline: caminho dos arquivos de diff apply, queries tree-sitter, checkpoints (anotar aqui)
- [ ] Mapear no sst/opencode: middleware de transporte/erros/usage e gestão de sessões (anotar aqui)
- [ ] Extrair do Aider a especificação do repo map (ler `repomap.py` e docs) para um spec .md próprio
- [ ] Para cada porte de código: anotar origem (repo, commit, arquivo) no cabeçalho do arquivo portado

## Anti-objetivos

- Não fazer fork de nenhum deles: a CLI é um projeto novo que **absorve peças**, não um rebrand.
- Não depender de pacote npm interno não publicado de nenhuma referência (vendorizar o que for preciso).
