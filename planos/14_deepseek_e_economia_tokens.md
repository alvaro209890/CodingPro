# 14 — DeepSeek V4 Pro, Economia de Tokens e Esforço Auto-Adaptável

Pesquisa feita em 2026-07-22 (docs oficiais + fontes de mercado). Este doc define **os dois objetivos centrais da CLI**: gastar o mínimo de token possível e entregar qualidade extrema de código.

## 14.1 Ficha técnica do DeepSeek V4 (abril/2026)

| Item | V4 Pro | V4 Flash |
|---|---|---|
| Arquitetura | MoE 1,6T (49B ativos) | MoE 284B (13B ativos) |
| Contexto | **1M tokens** (padrão em todos os serviços oficiais) | 1M |
| Saída máxima | 384K | 384K |
| Preço input (cache miss) | ~$0,435/M | bem menor |
| Preço input (**cache hit**) | **~$0,0036/M (~99% de desconto)** | ~$0,014–0,028/M |
| Preço output | ~$0,87/M | menor |
| Coding | SWE-Bench Verified ~91% (nível frontier) | bom p/ tarefas leves |
| APIs | OpenAI-compat (`/v1`) **e Anthropic-compat (`/anthropic`)** | idem |

Fatos operacionais críticos:

- **Cache de prefixo é automático** (sem code change): se os primeiros N tokens forem idênticos a um request recente, viram cache-hit. Toda a estratégia de contexto do 14.3 existe por causa disso.
- **Thinking mode**: ligado por padrão; `reasoning_effort` aceita `high`/`max` (**`low`/`medium` são mapeados p/ `high`** — não existem de verdade); a API já auto-escala p/ `max` em requests "de agente complexo". `thinking: {type: disabled}` desliga.
- Em thinking mode, `temperature`/`top_p`/penalties **não têm efeito**.
- **Tool calls em thinking mode**: o `reasoning_content` intermediário **precisa voltar no contexto** dos turnos seguintes (a LLM Layer tem que preservar isso — erro clássico é descartar).
- **`tool_choice` forçado + thinking (comportamento observado em 2026-07-22):** a API real
  rejeitou `required` e a escolha nominal com HTTP 400 no V4 Pro; `auto` no primeiro turno e
  `none` após o resultado passaram no Pro e no Flash. O adaptador falha localmente antes da rede
  nessa combinação. O modo não-thinking continua aceitando escolha nominal. Reavaliar se o
  comportamento oficial mudar.
- Endpoint Anthropic-compat aceita `thinking`, mas a documentação oficial informa que `budget_tokens` é **ignorado**; em `output_config`, somente `effort` (`high`/`max`) é suportado. O Vertex envia budgets, mas isso não prova que o servidor os obedece. Fonte verificada em 2026-07-22: [DeepSeek — Anthropic API Compatibility](https://api-docs.deepseek.com/guides/anthropic_api).
- `deepseek-chat`/`deepseek-reasoner` legados **aposentam em 2026-07-24** — usar só `deepseek-v4-pro`/`deepseek-v4-flash`.

**Decisão de arquitetura:** a LLM Layer usa somente a API oficial DeepSeek, com allowlist fechada
em V4 Pro/Flash e transporte OpenAI-compatible pelo AI SDK. O contrato Provider isola o SDK e
permite replay sintético nos testes; não é extensão para fornecedores alternativos. O F0.3
concluído validou streaming, tools, `reasoning_content`, usage/cache e erros nos dois modelos, sem
`budget_tokens`.

## 14.2 Estratégia de dois modelos (qualidade × custo)

| Papel | Modelo | Por quê |
|---|---|---|
| Codificação, arquiteto, revisor | **V4 Pro** | Qualidade máxima onde importa |
| Roteador de esforço (14.4), subagente explorer, consolidador de memória, mensagens de commit, resumos/compactação, título de sessão | **V4 Flash** | Tarefas mecânicas ficam ~10× mais baratas sem perda perceptível |

Mapeamento interno fixo (F0.4, implementado): `main = deepseek-v4-pro` e `fast = deepseek-v4-flash`.
`auto` é o padrão de produto e, no headless/codificação atual, resolve para `main` (Pro). Perfis
avançados de agente e caminhos mecânicos (roteador, explorer, resumo, commit, compactação) fixam
`main` ou `fast` via API interna (`role`), nunca fornecedor, endpoint ou ID de modelo arbitrário.
API pura: `resolveDeepSeekModelForRole` / `parseModelRole` em `@codingpro/llm`.

## 14.3 Economia de tokens (regras de engenharia, por prioridade)

1. **Layout de contexto cache-friendly** (maior alavanca — até ~99% no input):
   - Prefixo **estável e imutável**: system prompt fixo → schemas de tools (ordem e texto congelados) → contexto do projeto → histórico **append-only**.
   - Conteúdo volátil (repo map do turno, memórias recuperadas, diagnóstico) entra **no fim** (última mensagem), nunca no meio — mudar 1 byte no meio invalida o cache dali pra frente.
   - Nunca reordenar/reescrever mensagens antigas; compactação cria sessão nova deliberadamente (única invalidação aceita).
   - Medir: taxa de cache-hit por turno exposta em `/cost` (a API devolve `prompt_cache_hit_tokens`).
2. **Não chamar o LLM pro que é determinístico**: glob/grep/ls/git são locais; formatação via formatter; nada de "pedir pro modelo listar arquivos".
3. **Diff edits, nunca arquivo inteiro** (já é o doc 07) — saída é o token mais caro ($0,87/M).
4. **Orçamentos fixos por seção**: repo map (ex. 4k), memórias (2k), tool result (head+tail com aviso) — nada entra "inteiro por preguiça".
5. **Leitura seletiva**: tool `read` com offset/limit e instrução no system prompt p/ ler só o trecho necessário de arquivos grandes.
6. **Subagentes com contexto zero**: recebem só o prompt da tarefa (não herdam a conversa) e devolvem relatório curto — paralelismo sem multiplicar contexto.
7. **Compactação estruturada** só quando necessário (limiar alto, já que o contexto é 1M — o motivo real de compactar vira qualidade/latência/custo, não limite).
8. **Telemetria de custo**: custo por turno/tarefa/subagente na statusline e `/custo`; evals medem "custo por tarefa resolvida" como métrica de 1ª classe (doc 10.4).
9. **Respostas concisas em pt-BR por contrato** (doc 15.2): pt custa ~20–25% mais no output — compensamos com estilo direto (sem cerimônia) e raciocínio interno livre (não pagamos tradução de pensamento).

- [ ] Especificar layout exato do prompt (ordem das seções) e testar taxa de cache-hit real
- [ ] Benchmark: mesma tarefa com layout ingênuo vs cache-friendly (meta: >70% de input em cache-hit em sessão típica)

## 14.4 Esforço de raciocínio auto-adaptável (sem o usuário escolher)

Objetivo do Álvaro: a pessoa **não fica escolhendo nível de raciocínio** — a CLI decide sozinha, por turno.

Mecanismo em 3 camadas (da mais barata pra mais cara):

1. **Heurísticas estruturais (custo zero)** — sinais que decidem sem IA:
   - `off` (sem thinking): turnos mecânicos — rodar comando pedido, responder pergunta factual curta, gerar mensagem de commit, continuar plano já aprovado passo-a-passo.
   - `high` (padrão): implementação normal, edições, perguntas de código.
   - `max`/budget alto: modo planejamento, `/review`, depuração de erro que já falhou ≥1 vez, tarefa marcada difícil pelo plano, refatoração multi-arquivo.
2. **Roteador Flash (barato)** — quando as heurísticas não decidem, o V4 Flash classifica o prompt (uma chamada de ~centavos: `{complexidade: trivial|normal|dificil, motivo}`) e o resultado mapeia p/ budget.
3. **Escalada por falha (feedback real)** — se o turno falhar (edit não aplicou, teste quebrou de novo, modelo se confundiu), o próximo turno da mesma tarefa sobe de `high` para `max`; sucesso consecutivo volta a `high`. Thinking pode ser desligado para operações mecânicas. Não usamos os níveis 4k/8k/16k/32k, pois `budget_tokens` é ignorado pela API oficial.

Overrides: `/effort off|auto|max` existe p/ quem quiser forçar, mas o padrão é `auto` e a UI não pergunta nada. A statusline mostra o nível escolhido (transparência sem fricção).

- [ ] Definir tabela sinal→nível v1 e logá-la em cada turno (p/ calibrar depois)
- [ ] Eval dedicado: auto-effort vs fixo-high — meta: custo ≤60% com taxa de sucesso igual (doc 10.4)

## 14.5 Qualidade extrema de codificação (o outro objetivo central)

Camadas de garantia, em ordem de execução num turno de código:

1. **Antes de editar**: repo map + leitura dos arquivos-alvo (nunca edição às cegas — doc 07); em tarefa não-trivial, plano curto interno com critérios de pronto.
2. **Ao editar**: cascata de Replacers robusta (opencode) + aplicação atômica + checkpoint.
3. **Depois de cada edição**: lint/diagnóstico + **auto-correção** (ver 14.5.1) — erros mecânicos somem sem gastar turno; o resto volta pro modelo.
4. **Depois da tarefa**: rodar o teste do projeto (detectado na F3); falha → loop de correção com esforço escalado (14.4).
5. **Revisão embutida**: em mudanças grandes (>N arquivos ou pedido explícito), subagente `reviewer` (V4 Pro, contexto limpo) revisa o diff antes de declarar pronto — achados críticos são corrigidos, o resto é reportado.
6. **Medição contínua**: mini-benchmark de edição (doc 10.4) roda semanal; regressão de qualidade bloqueia release.

Princípio: qualidade vem de **verificação automática em loop**, não de pedir "capriche" no prompt. Cada camada devolve sinal objetivo (parse ok, lint ok, teste ok, review ok) e o modelo só encerra quando os sinais passam — é isso que transforma um modelo 91% SWE-bench em resultado confiável no dia-a-dia.

### 14.5.1 Auto-correção de lint e formatação *(plano da CLI — próximo incremento)*

**Estado atual (v1 entregue):** após um turno com `write_file`/`edit_file`, `quality-runtime.ts` roda
`biome check` nos arquivos tocados (só se existir `biome.json`/`biome.jsonc`), via `execFile` **sem shell**
(caminhos como argv → imune a injeção). Reporta `✓ limpo` ou `✗ N problema(s)` + saída. **Não corrige**
ainda — só informa.

**Objetivo:** a CLI **corrige sozinha** erros de lint/formatação sempre que for seguro, e só então pede
à IA o que o linter não consegue auto-fixar.

#### Fluxo alvo (por turno com escrita)

```
arquivos tocados
    │
    ▼
[1] biome check --write  (format + fixes seguros, argv, sem shell)
    │
    ▼
[2] biome check          (revalida)
    │
    ├─ 0 problemas → ✓ fim (checkpoint já inclui o --write se capturado)
    │
    └─ ainda há problemas → [3] re-turno do agente
            prompt sintético com o diagnóstico
            tools de edição liberadas
            teto de 1–2 iterações (não loop infinito)
            auto-effort pode escalar p/ Pro se falhar de novo
```

#### Regras de produto

| Regra | Detalhe |
|-------|---------|
| Escopo | Só arquivos **tocados neste turno** (nunca `biome check --write .` no repo inteiro) |
| Detector | Biome se `biome.json(c)` na raiz; futuro: ESLint/`ruff`/`cargo fmt` por detecção de projeto |
| Segurança | Sempre `execFile` + argv; nunca interpolar paths em shell; teto de bytes/timeout |
| Checkpoint | O `--write` mecânico **entra no mesmo checkpoint** do turno (undo reverte lint+IA juntos) |
| Permissão | Auto-fix mecânico **não pede** aprovação (é formatação/lint do projeto); re-turno da IA sim se for editar de novo sob `ask` |
| UX | `· formatando…` → `· ✓ auto-corrigido (N)` ou `· reenviando diagnóstico ao modelo…` |
| Fail-closed | Biome ausente / timeout / ENOENT → mensagem curta e **não** bloqueia o turno |
| Config | `settings.quality.autoFix: true\|false` (padrão `true`); `maxRepairTurns: 0..2` (padrão `1`) |

#### Por que duas camadas (mecânica + IA)

- **Mecânica (`--write`)**: barata, determinística, cobre 80%+ dos ruídos (aspas, imports, trailing commas).
- **IA (re-turno)**: só o que exige julgamento (tipo errado, regra sem fix, lógica). Evita gastar tokens
  com o que o Biome já resolve.

#### Critérios de pronto da feature

- [ ] `corrigirQualidade(root, arquivos)` no `quality-runtime` (check → write → recheck), testável com runner injetado
- [ ] Integração no `chat-runtime` / headless agente após commit de checkpoint
- [ ] Re-turno com diagnóstico no system/user quando `problemas > 0` e `maxRepairTurns > 0`
- [ ] Config JSONC `quality.autoFix` / `quality.maxRepairTurns`
- [ ] Testes: projeto com biome, arquivo “sujo” → fica limpo sem chamar o provider; diagnóstico residual → mock de 2º turno
- [ ] Doc de usuário (`GUIA-DO-USUARIO`) atualizado

- [x] v1: biome **check** pós-edição (report only) — 2026-07-23
- [ ] Definir política de quando cada camada roda (custo × benefício por tamanho de mudança)
- [ ] Contrato do "pronto": turno de código só encerra com sintaxe+lint ok e testes rodados (ou justificativa explícita)
- [ ] Implementar auto-correção 14.5.1 (mecânica + re-turno)
