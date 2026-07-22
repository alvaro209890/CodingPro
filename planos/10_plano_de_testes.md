# 10 — Plano de Testes

Princípio: o máximo possível de testes **sem tocar na API do LLM** (rápidos, grátis, determinísticos); chamadas reais ficam confinadas a uma suite de evals opt-in.

## Camadas

### 1. Unit (Vitest) — roda em todo commit

- [ ] Aplicador de diffs: match exato, zero match, múltiplos matches, fuzzy, atomicidade multi-bloco
- [ ] Permissões: avaliação de padrões de allowlist, níveis de risco, deny-list
- [ ] Compactação de contexto: orçamento respeitado, informações obrigatórias preservadas
- [ ] Parser de config (merge global→projeto→flags)
- [ ] Repo map: extração de símbolos por linguagem (fixtures pequenas), ranking, orçamento
- [ ] Memória: CRUD, dedupe, FTS5, geração do índice
- [ ] Protocolo orquestrador↔subagente (mensagens válidas/inválidas)
- Meta: núcleo (`core`, `tools`, `memory`) ≥ 80% de cobertura de linhas

### 2. Integração determinística com LLM (replay) — roda em todo commit

Mecânica inicial (F0.2a): provider `replay` que lê fixtures JSONL **sintéticas**, valida o
contrato estritamente e falha sem consumir o turno quando a requisição diverge. Ele não
acessa rede e não possui modo de gravação. Gravação de conversas reais só poderá ser
adicionada depois de existir sanitização de segredos testada.

- [x] Contrato Provider v1 + replay JSONL sintético, fail-closed e abortável — 2026-07-22
- [ ] Harness de gravação/replay com sanitização de segredos nas fixtures
- [ ] Cenário: tarefa multi-passo com 2 edits + 1 bash + permissão negada no meio
- [ ] Cenário: match de edit falha → modelo se recupera com re-leitura
- [ ] Cenário: estouro de contexto → compactação → tarefa continua coerente
- [ ] Cenário: subagente lançado, reporta, orquestrador consolida
- [ ] Cenário: tool call malformado do modelo (JSON inválido) → erro gracioso

### 3. E2E em repos descartáveis — roda no CI diário

Repos git sintéticos criados no setup (Node, Python, monorepo) + binário real da CLI em modo headless com provider replay (ou modelo local barato no CI da casa).

- [x] `codingpro -p` transmite resposta replay e sai com código correto no tarball instalado — 2026-07-22
- [ ] Undo restaura árvore byte a byte (incl. staging sujo do usuário)
- [ ] Instalação limpa (`npm pack` + install global em container) → `codingpro doctor` verde
- [ ] Projeto sem git → shadow git funciona
- [ ] Sem rede → mensagens de erro claras, nada corrompe

### 4. Evals com LLM real — opt-in (`pnpm evals`), semanal e pré-release

Custa dinheiro; mede **qualidade**, não correção de código nosso.

- [ ] Mini-benchmark de edição (estilo Aider polyglot, ~20 exercícios): % de tarefas com testes passando por modelo (DeepSeek V4 Pro vs local)
- [ ] Eval de retrieval de memória: dado histórico plantado, a memória certa entra no contexto?
- [ ] Eval do consolidador: sessões sintéticas → fatos extraídos corretos, sem duplicatas
- [ ] Relatório com custo por eval e regressão vs baseline anterior
- [ ] Eval de idioma (doc 15.2): A/B system prompt en+diretiva-pt vs 100% pt (qualidade × custo); % de respostas visíveis realmente em pt-BR (meta: 100%)

### 5. Testes manuais roteirizados — por fase (marcos do roadmap)

Cada fase do doc 04 tem um marco que é, na prática, um roteiro manual. Manter em `docs/roteiros-qa/` um .md por fase com passos e resultado esperado.

- [ ] Roteiro F1 (tarefa 5+ passos), F2 (undo), F5 (multi-agente), F7 (voz — precisa de humano/microfone)

## Testes de robustez específicos (lista de tortura)

- [ ] Arquivos com CRLF, BOM, encoding latin-1, sem newline final
- [ ] Caminhos com espaço/acento (padrão nas máquinas pt-BR: `Área de trabalho`, `Documentos`)
- [ ] Repo gigante (>50k arquivos) — indexação não trava a TUI
- [ ] Resposta da API truncada/timeout/429 no meio do streaming → retry sem duplicar efeito de tool
- [ ] Duas instâncias da CLI no mesmo projeto ao mesmo tempo (lock de sessão/índice)
- [ ] Kill -9 no meio de uma edição → estado recuperável na próxima abertura

## CI

- [ ] GitHub Actions: lint + typecheck + unit + replay em push; E2E diário e evals manual/semanal ainda pendentes
- [x] Matriz bloqueante: Node mínimo suportado no Linux + Node fixado em Linux/macOS — 2026-07-22
