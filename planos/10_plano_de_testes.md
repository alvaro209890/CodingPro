# 10 — Plano de Testes

Princípio: o máximo possível de testes **sem tocar na API do LLM** (rápidos, grátis, determinísticos); chamadas reais ficam confinadas a uma suite de evals opt-in.

## Camadas

### 1. Unit (Vitest) — roda em todo commit

- [ ] Aplicador de diffs: match exato, zero match, múltiplos matches, fuzzy, atomicidade multi-bloco
- [ ] Permissões: avaliação de padrões de allowlist, níveis de risco, deny-list
- [ ] Compactação de contexto: orçamento respeitado, informações obrigatórias preservadas
- [x] Parser/config JSONC: global→projeto→env legado→flags, schema, trust boundary e filesystem seguro — 2026-07-22
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

### 2.1. Adaptador DeepSeek com transporte injetado — roda em todo commit

- [x] Request OpenAI-compatible: modelo, thinking, effort, mensagens e usage streaming — 2026-07-22
- [x] SSE: reasoning/text deltas, finish, cache hit, reasoning tokens e fragmentação do stream — 2026-07-22
- [x] Erros 400/401/402/429/503, transporte, SSE inválido e zero retry implícito — 2026-07-22
- [x] Abort antes/durante a chamada e rejeição fail-closed de conteúdo não suportado — 2026-07-22
- [x] Sanitização de controles de terminal e canários de segredo — 2026-07-22
- [x] F0.3: mesma suíte Pro/Flash para tool calls fragmentadas, paralelas, schemas, IDs e allowlist fechada — 2026-07-22
- [x] F0.3: segundo request preserva assistant `reasoning_content` + `tool_calls` e associa `role: tool` pelo ID — 2026-07-22
- [x] F0.3: replay de dois turnos e transcript fail-closed; provider não executa tools — 2026-07-22
- [x] F0.3: buffer até finish coerente, snapshots contra mutação/TOCTOU, limites UTF-8 e cancelamento durante argumentos fragmentados — 2026-07-22

### 3. E2E em repos descartáveis — roda no CI diário

Repos git sintéticos criados no setup (Node, Python, monorepo) + binário real da CLI em modo headless sempre com replay sintético. Nenhum modelo executa no CI comum.

- [x] `codingpro -p` transmite resposta replay e sai com código correto no tarball instalado — 2026-07-22
- [ ] Undo restaura árvore byte a byte (incl. staging sujo do usuário)
- [ ] Instalação limpa (`npm pack` + install global em container) → `codingpro doctor` verde
- [ ] Projeto sem git → shadow git funciona
- [ ] Sem rede → mensagens de erro claras, nada corrompe

### 4. Evals com LLM real — opt-in (`pnpm evals`), semanal e pré-release

Custa dinheiro; mede **qualidade**, não correção de código nosso.

- [x] Smoke sintético `deepseek-v4-pro` e `deepseek-v4-flash`, manual e bloqueado no CI — F0.3, 2026-07-22
- [ ] Mini-benchmark de edição (estilo Aider polyglot, ~20 exercícios): roteamento Pro/Flash automático versus Pro fixo
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
