# 07 — Edição por Diff, Undo e Entendimento do Projeto

## 7.1 Edição baseada em diffs (search/replace)

Formato de edição: **blocos search/replace** (modelo fornece trecho exato atual + trecho novo), não patch unificado — na prática dos projetos de referência (Aider provou isso empiricamente) é o formato com maior taxa de aplicação correta pelos LLMs.

Regras da tool `edit_file`:

1. `search` deve casar **exatamente uma** ocorrência no arquivo (incl. indentação). Zero ou >1 → erro estruturado devolvido ao modelo com contexto para ele se corrigir.
2. Arquivo precisa ter sido **lido na sessão** antes de editar (evita edição às cegas).
3. Múltiplos blocos por chamada permitidos (aplicação atômica: ou todos, ou nenhum).
4. Fallback tolerante (fase 2): match com normalização de espaços quando o estrito falhar, marcado como "fuzzy" no log.
5. Pós-edição: rodar checagem de sintaxe rápida (tree-sitter) e avisar o modelo se quebrou parse.

- [ ] Especificar o erro estruturado de "match falhou" (com trecho mais próximo encontrado)
- [ ] Limitar tamanho de arquivo para `write_file` integral vs obrigar `edit_file`

## 7.2 Checkpoints e undo instantâneo

- Antes de **cada** operação de escrita: snapshot dos arquivos afetados numa ref git oculta (`refs/codingpro/checkpoints/*`), sem tocar staging/branch do usuário.
- Projetos sem git: repo-sombra em `.codingpro/shadow-git/` versionando a árvore.
- `/undo` reverte o último passo de escrita; `/undo N` volta N passos; `/redo` possível enquanto não houver nova escrita.
- `/checkpoint list` mostra a linha do tempo (timestamp, prompt do turno, arquivos).
- Garantias: nunca perder mudanças manuais do usuário feitas entre turnos (checkpoint captura estado pré-edição, incluindo elas).

- [ ] Decidir mecanismo exato (commit em ref oculta vs stash nomeado) — spike na F0
- [ ] Teste de tortura: undo com staging sujo, arquivos novos, binários, submódulos

## 7.3 Repo map (entendimento da estrutura)

Adaptação do repo map do Aider, implementado em TS com web-tree-sitter:

1. Indexador varre o projeto (respeitando .gitignore) e extrai **assinaturas**: funções, classes, exports, tipos — não corpos.
2. Grafo de referências (quem cita quem) dá o **ranking de importância** (PageRank simples).
3. O mapa que entra no contexto é adaptativo: orçamento fixo de tokens, priorizando arquivos citados no prompt + vizinhos no grafo + top do ranking.
4. Cache em SQLite, invalidação incremental por mtime/hash de arquivo.

Linguagens na v1: TypeScript/JavaScript, Python, Kotlin/Java, Go, SQL (cobre os projetos do Álvaro). Demais caem num fallback (só caminhos + primeiras linhas).

- [ ] Definir formato textual do mapa no prompt (compacto, estável)
- [ ] Benchmark: tempo de indexação a frio em repo grande (alvo < 10 s em ~5k arquivos)

## 7.4 Detecção de projeto

Na abertura, detectar e expor no contexto: linguagens, framework, package manager, scripts (`package.json`, `Makefile`), ferramenta de testes, monorepo ou não. Comando `/init` gera `CODINGPRO.md` com isso + convenções inferidas.

## 7.5 Modo revisão e refatoração

- `/review` (sem args: diff não commitado; com arg: branch/range): subagentes `reviewer` analisam e devolvem achados `{arquivo, linha, severidade, resumo, cenário de falha}`; TUI lista ordenado por severidade; usuário pode pedir "corrija os achados 1 e 3".
- Refatorações guiadas: pedidos de refatoração usam o repo map para achar **todos** os pontos de impacto antes de editar (renomear símbolo, extrair módulo, etc.).
- Pós-mudança: oferta padrão de rodar o script de teste detectado.

- [ ] Definir formato do achado e níveis de severidade
- [ ] Heurística de quando sugerir rodar testes automaticamente

## 7.6 Auto-correção de lint e formatação *(CLI — próximo incremento)*

Depois de qualquer turno que altere arquivos, a CLI deve **deixar o código limpo** sem o usuário
pedir “roda o linter” ou “formata isso”.

### Estado

| Camada | Status |
|--------|--------|
| Detectar projeto com Biome (`biome.json`) | ✅ `quality-runtime.projetoUsaBiome` |
| Rodar `biome check` nos arquivos tocados (`execFile`, sem shell) | ✅ `verificarQualidade` |
| Reportar ✓ / ✗ no progresso do chat | ✅ |
| **`biome check --write`** (format + fixes seguros) nos tocados | ☐ a implementar |
| Revalidar após o write | ☐ |
| Se ainda houver diagnóstico → **re-turno automático da IA** com o texto do linter | ☐ |
| Teto de iterações + config `quality.autoFix` | ☐ |
| Checkpoint/undo inclui o auto-fix mecânico | ☐ |

### Algoritmo (resumo)

1. Coletar paths relativos tocados por `write_file` / `edit_file` no turno.
2. Se não há linter do projeto → no-op.
3. `biome check --write -- <paths…>` (argv only).
4. `biome check -- <paths…>` de novo.
5. Se limpo → fim. Se não e `maxRepairTurns > 0` → mensagem de sistema/usuário com a saída do
   biome e mais um `runAgent` (mesmo gate/workspace; preferir Flash se o diagnóstico for trivial).
6. Nunca varrer o monorepo inteiro; nunca `rm`/comandos do modelo no passo mecânico.

### Relação com o Aider

O Aider devolve lint ao modelo (`linter.py`). CodingPro faz **primeiro** o que for mecânico
(`--write`) e **só então** imita o Aider no residual — menos tokens, mesma qualidade.

Detalhe de produto, segurança e critérios de pronto: **doc 14.5.1**.

- [ ] Implementar `corrigirQualidade` + re-turno (ver 14.5.1)
- [ ] Settings + testes + guia do usuário
