# CodingPro — CLI de código assistida por IA (pt-BR)

> CLI local-first com **DeepSeek V4 Pro e V4 Flash** como únicos modelos LLM de código.
> Interface em português, roda em Node.js 24.

**Stack:** TypeScript / Node.js ≥ 24 · monorepo pnpm · comando `codingpro` (alias `cpro`)
**Licença:** proprietária source-available (ver `LICENSE`; código de terceiros portado mantém a licença original)
**Status geral:** 🟢 **Fase 1 / CLI 1.0 usável** — loop agêntico, edit/undo, memória, multi-agente, MCP/skills/hooks, Aurora (header limpo + autocomplete `/` + status de tokens), auto-correção Biome, auto-compact (janela DeepSeek 1M), **busca vetorial local** (`code_search` + `/index`), hardening/evals no CI. Gate: `pnpm check`. Manual: `npm publish`. Pós-1.0: voz, pet, tree-sitter AST, embeddings ONNX.

📖 **Guia do usuário:** [`docs/GUIA-DO-USUARIO.md`](docs/GUIA-DO-USUARIO.md)  
📋 **Estado consolidado da Fase 1:** [`docs/ESTADO_PROJETO.md`](docs/ESTADO_PROJETO.md) — o que foi feito, estrutura, como rodar, o que falta.

## Desenvolvimento local

Requisitos: Node.js 24 (a versão validada está em `.nvmrc` e `.node-version`) e pnpm
10.34.4. Os testes comuns não acessam rede nem carregam chave de API.

```bash
nvm use
pnpm install --frozen-lockfile
pnpm check          # lint, types, testes+cobertura (inclui hardening-evals), build, smoke de tarball
pnpm test:evals     # só a suite de robustez offline (espaços, chave, rede, tetos)
node packages/cli/dist/index.mjs --ajuda
node packages/cli/dist/index.mjs \
  --provider replay \
  --replay-file fixtures/llm/ola.jsonl \
  -p "olá"

node --env-file="$HOME/.config/codingpro/deepseek.env" \
  packages/cli/dist/index.mjs --provider deepseek -p "olá"
```

O artefato oferece os dois bins `codingpro` e `cpro`, ajuda/versão em pt-BR e o modo headless
`-p`/`--prompt`. O provider precisa ser escolhido explicitamente: `replay` permanece sintético
e sem rede; `deepseek` exige `DEEPSEEK_API_KEY` e resolve o modelo por papel interno
(`auto`/`main` → `deepseek-v4-pro`, `fast` → `deepseek-v4-flash`). O headless de codificação usa
`auto` → Pro; não há seletor de ID de modelo, endpoint ou provider alternativo para o usuário.
O arquivo dedicado do exemplo deve ter permissão `0600` e conter somente essa variável.

O único provider de LLM para código em produção é a API oficial DeepSeek. V4 Pro atende
codificação, arquitetura e revisão; V4 Flash atende caminhos mecânicos internos via `role: "fast"`.
`replay` é apenas infraestrutura determinística de testes, sem inferência.

**Modos:** `-p` (headless) · `--agente -p` (tools de leitura) · `--chat` (TTY: autocomplete `/`,
status `$`/ctx, aprovação de efeitos) · `--doctor`. Auto-effort Flash→Pro. Auto-compact 800k/1M.
Busca: `repo_map` + `code_search` (SQLite local). Detalhes: [guia](docs/GUIA-DO-USUARIO.md) e
[estado do projeto](docs/ESTADO_PROJETO.md).

> **Privacidade:** ao selecionar `deepseek`, o prompt e qualquer conteúdo incluído nele são
> enviados à API da DeepSeek. Os testes comuns nunca selecionam esse caminho nem carregam chaves.

O smoke real é separado, usa apenas uma soma sintética em memória e requer autorização explícita;
consulte [o roteiro F0.3](docs/roteiros-qa/f0.3-tools-deepseek.md) e
[o roteiro F0.4](docs/roteiros-qa/f0.4-roteamento-papeis.md).
O histórico verificável fica em [docs/diario-desenvolvimento.md](docs/diario-desenvolvimento.md).

## Configuração em camadas

A CLI aceita JSONC com comentários e vírgula final. A precedência é:

```text
~/.codingpro/settings.json → <cwd>/.codingpro/settings.json → ambiente legado → flags
```

Configuração global persistente:

```jsonc
{
  "version": 1,
  "provider": "deepseek",
}
```

Configuração de projeto para desenvolvimento/testes, segura para versionar:

```jsonc
{
  "version": 1,
  "provider": "replay",
  "replay": { "file": "fixtures/llm/ola.jsonl" },
}
```

O arquivo do projeto é procurado somente no diretório inicial da execução, sem herança de
ancestrais, e não pode ativar DeepSeek. Configurações nunca aceitam chave, endpoint, headers ou
modelo. `DEEPSEEK_API_KEY` permanece exclusivamente no ambiente. `CODINGPRO_PROVIDER` e
`CODINGPRO_REPLAY_FILE` continuam temporariamente compatíveis, abaixo das flags na precedência.

Arquivos e diretórios de configuração não podem ser symlinks nem permitir escrita por grupo ou
outros usuários. Um `replay.file` global relativo usa `~/.codingpro` como base; a camada global
confiável também aceita caminho absoluto. No projeto, o caminho é relativo ao `cwd`, precisa
permanecer dentro dele e a fixture é lida em snapshot seguro. Consulte o
[roteiro F0.2c](docs/roteiros-qa/f0.2c-config.md).

## As 3 fases do projeto

| Fase | O quê | Planos | Status |
|---|---|---|---|
| **1** | **CLI executada localmente e funcional** (sem backend próprio; inferência via DeepSeek) | [`planos/`](planos/) — docs 01–16 | 🟢 funcionalmente completa (falta polimento visual + `npm publish`) |
| **2** | **App Windows** (Electron, estilo Claude Code desktop; core da CLI reaproveitado) | [`fase2-app-windows/`](fase2-app-windows/) | 🟢 W0, W1 e W2 concluídos (app Electron rodando) |
| **3** | **Plataforma web**: site, contas, proxy LLM com **limites por usuário** (backend neste PC + Cloudflare Tunnel em `cursar.space`) | [`fase3-plataforma-web/`](fase3-plataforma-web/) | 📋 planejada |

**API de desenvolvimento/testes (todas as fases):** a origem da chave DeepSeek neste PC é o
Hermes. Para executar o CodingPro, disponibilize somente `DEEPSEEK_API_KEY` no arquivo dedicado
`~/.config/codingpro/deepseek.env` com permissão `0600`; nunca carregue o `.env` compartilhado no
processo. O valor não entra em docs, repo ou commits. A produção da Fase 3 usará chave própria.

## Nota sobre fontes de inspiração

O prompt original citava "código vazado do Claude Code". Este plano **não usa nem referencia código proprietário vazado** — todos os conceitos equivalentes (agentes em background, memória persistente, modo de planejamento, multi-agente, hooks, MCP, subagentes) são **públicos e documentados**, e as fontes de código reais deste plano são projetos open source com licenças permissivas:

| Fonte | Licença | O que aproveitar |
|---|---|---|
| [Cline](https://github.com/cline/cline) | Apache-2.0 | TypeScript — diff apply, tree-sitter, checkpoints |
| [Aider](https://github.com/Aider-AI/aider) | Apache-2.0 | Conceitos — repo map, edit blocks, undo por git |
| [OpenCode (sst)](https://github.com/sst/opencode) | MIT | TypeScript — TUI, sessões e separação entre runtime e integração LLM |
| Docs públicas do Claude Code | — | UX, permissões, skills/hooks, subagentes |
| [Vertex](https://github.com/alvaro209890/Vertex) (repo do Álvaro) | próprio | Integração DeepSeek em produção — effort→budget, proxy Anthropic-compat |

**Objetivos centrais** (detalhe no doc 01): economia extrema de tokens (cache-friendly), qualidade extrema de código (verificação em loop), raciocínio auto-adaptável sem o usuário escolher effort, **CLI 100% em português** (doc 15) e **visual próprio "Aurora"** — interação estilo Claude Code com pele nova (doc 16).
Os repos de referência já estão clonados em `referencias/` (análise no doc 13).

Detalhes em [09_integracao_referencias.md](planos/09_integracao_referencias.md).

## Índice dos planos

| Doc | Conteúdo |
|---|---|
| [01_visao_e_escopo.md](planos/01_visao_e_escopo.md) | Objetivo, princípios, o que fica fora do escopo |
| [02_arquitetura.md](planos/02_arquitetura.md) | Componentes, diagrama, fluxo do loop agêntico |
| [03_tecnologias.md](planos/03_tecnologias.md) | Bibliotecas e ferramentas escolhidas, com justificativa |
| [04_roadmap.md](planos/04_roadmap.md) | Fases F0–F9, marcos e estimativas |
| [05_funcionalidades_agentes.md](planos/05_funcionalidades_agentes.md) | Loop agêntico, subagentes, background, planejamento |
| [06_funcionalidades_memoria.md](planos/06_funcionalidades_memoria.md) | Memória persistente local + consolidação automática |
| [07_funcionalidades_edicao_e_projeto.md](planos/07_funcionalidades_edicao_e_projeto.md) | Edição por diff, undo, repo map, revisão/refatoração |
| [08_funcionalidades_interface.md](planos/08_funcionalidades_interface.md) | TUI, voz local, gamificação (pet), modo undercover |
| [09_integracao_referencias.md](planos/09_integracao_referencias.md) | O que portar/estudar de cada projeto de referência |
| [10_plano_de_testes.md](planos/10_plano_de_testes.md) | Unit, integração com LLM gravado, E2E, evals |
| [11_desafios_e_solucoes.md](planos/11_desafios_e_solucoes.md) | Riscos (incl. gotchas reais da API DeepSeek) e mitigações |
| [12_estrutura_de_pastas.md](planos/12_estrutura_de_pastas.md) | Estrutura de diretórios proposta para o código |
| [13_mineracao_codigo.md](planos/13_mineracao_codigo.md) | Análise real dos repos clonados (arquivo a arquivo): o que portar de opencode/Cline/Aider/**Vertex** |
| [14_deepseek_e_economia_tokens.md](planos/14_deepseek_e_economia_tokens.md) | Pesquisa DeepSeek V4, economia de tokens (cache), esforço auto-adaptável, qualidade extrema |
| [15_idioma_portugues.md](planos/15_idioma_portugues.md) | CLI 100% pt-BR (UI, verbos, respostas); raciocínio interno livre; custo do idioma |
| [16_design_visual_tui.md](planos/16_design_visual_tui.md) | Identidade "Aurora": paleta, trilho de timeline, temas, componentes, mockup |
| [CHECKLIST_MESTRE.md](CHECKLIST_MESTRE.md) | Visão única de progresso de todas as fases |
