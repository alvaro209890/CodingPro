# 11 — Desafios Potenciais e Soluções

## 11.1 Gotchas reais da API DeepSeek (já vividos em outros projetos do Álvaro)

Estes são comportamentos **confirmados na prática** (projetos acompanhamento/Hermes) e precisam estar no design da LLM Layer desde o dia 1:

| Gotcha | Impacto | Mitigação no CodingPro |
|---|---|---|
| `max_tokens` **inclui** os tokens de raciocínio | Resposta pode voltar com `content` vazio se o reasoning consumir tudo | Folga generosa de `max_tokens` + retry automático aumentando o limite quando `content` vier vazio |
| `temperature` é ignorado em modelos reasoning | Ajustes de sampling não têm efeito | Não expor temperature como promessa; documentar |
| API oficial **não tem visão** | Nada de screenshots/imagens no fluxo principal | Entrada visual fica fora do escopo enquanto V4 Pro/Flash não oferecerem suporte oficial; sem fallback por outro provider |
| Chaves 401 acontecem (rotação/expiração) | CLI "morre" de forma confusa | `codingpro doctor` testa a chave; erro 401 vira mensagem clara com passo-a-passo |
| Latência de reasoning alto pode ser grande | UX de espera ruim | Streaming do reasoning como indicador de progresso; **esforço auto-adaptável por turno (doc 14.4)** decide quando pagar essa latência |
| `reasoning_effort` só tem `off/high/max` de fato (`low/medium` viram `high`) | A API Anthropic-compat ignora `thinking.budget_tokens`; não há granularidade 4k/8k/16k/32k garantida | Modelar capabilities e usar somente thinking on/off + `high`/`max`; validar o comportamento real em eval opt-in |
| Em thinking mode com tools, o `reasoning_content` intermediário **precisa voltar** nos turnos seguintes | Descartar = degradação silenciosa de qualidade | LLM Layer preserva reasoning_content no histórico por contrato (teste de replay dedicado) |
| Modelos legados `deepseek-chat`/`reasoner` aposentam 2026-07-24 | Integrações antigas quebram | Allowlist interna fixa em `deepseek-v4-pro`/`deepseek-v4-flash`; config não aceita IDs de modelo |
| Mudar 1 byte no meio do prompt invalida o cache de prefixo dali em diante | Perder o desconto de ~99% no input | Layout de contexto cache-friendly é regra de arquitetura (doc 14.3), com taxa de cache-hit monitorada em `/cost` |

- [ ] Validar na F0.3: tool calling do DeepSeek V4 Pro/Flash em multi-turno longo (estabilidade do formato)
- [ ] Medir: custo médio por tarefa típica (definir tarefa-padrão de benchmark)

## 11.2 Janela de contexto em sessões longas

**Risco:** sessões de horas estouram contexto; compactação ruim perde decisões e o agente "esquece" o que fez.
**Solução:** compactação estruturada (template fixo: objetivo, decisões, arquivos tocados, pendências, erros já cometidos) + repo map adaptativo + memória persistente absorvendo o que é durável. Testes de replay dedicados (doc 10, cenário de compactação).

## 11.3 Confiabilidade de edição (o modelo erra o diff)

**Risco:** blocos search que não casam, edição em arquivo desatualizado, corrupção.
**Solução:** exigir leitura prévia, erro estruturado com sugestão de trecho próximo, aplicação atômica, checagem de sintaxe pós-edição, checkpoint sempre — no pior caso, `/undo`. Métrica de "taxa de edição aplicada de primeira" nos evals.

## 11.4 Segurança do bash tool

**Risco:** comando destrutivo executado por alucinação ou prompt injection vindo de conteúdo de arquivos/web.
**Solução em camadas:** o padrão do produto continua sendo `allowlist`, mas durante o desenvolvimento toda escrita e todo bash ficam em `ask` até existir checkpoint testado. Depois disso: allowlist conservadora, deny-list dura, timeout, cwd/realpath restritos ao projeto, ambiente de subprocesso sem credenciais e aviso destacado p/ comandos de risco (rm, push --force, curl|sh). Sandbox opcional (bubblewrap) entra depois. Conteúdo externo (tool results de MCP/web) é marcado como não-confiável no prompt.

## 11.5 Multi-agente: custo e caos

**Risco:** N subagentes em paralelo multiplicam custo e podem conflitar editando os mesmos arquivos.
**Solução:** teto de custo por subagente e por turno; escrita paralela só via worktrees isolados com merge explícito; paralelismo padrão baixo (3); relatório de custo por tarefa na TUI.

## 11.6 Voz local: peso e qualidade

**Risco:** whisper.cpp médio é pesado p/ máquinas fracas; TTS robótico cansa.
**Solução:** voz 100% opcional com download lazy; escolha de modelo no setup conforme hardware; Piper pt-BR (qualidade já validada no Ares); push-to-talk (sem escuta contínua = sem custo constante de CPU).

## 11.7 Node/TS para CLI local: distribuição

**Risco:** usuário precisa de Node ≥ 24; `npm i -g` com dependências nativas quebra.
**Solução:** zero dependência nativa obrigatória (tree-sitter em WASM, `node:sqlite` nativo do Node, ripgrep binário baixado); voz é a única com binários externos e é opcional. Futuro: empacotar com SEA (single executable) se demanda surgir.

## 11.8 "Local puro" vs conveniências de nuvem

**Risco:** tentação de adicionar serviços (sync, telemetria, filas) que quebram a promessa local-first.
**Solução:** regra de arquitetura escrita (doc 01): funcionalidade principal nunca depende de serviço próprio; qualquer integração externa é plugin MCP opt-in.

## 11.9 Concorrência de instâncias

**Risco:** duas sessões no mesmo projeto corrompem índice/memória.
**Solução:** lockfile por projeto para escrita de índice; sessões são append-only por arquivo (sem conflito); consolidador só roda com lock exclusivo.

## 11.10 Respostas em português custam mais tokens

**Risco:** pt-BR tokeniza ~20–25% maior que inglês → output (o token mais caro) sobe.
**Solução:** raciocínio interno livre (não pagamos pt no reasoning — decisão do doc 15); estilo de resposta conciso por contrato; código nunca traduzido; medir custo médio por tarefa no eval A/B de idioma (15.2).

## 11.11 Visual bonito × terminais heterogêneos

**Risco:** gradiente truecolor e glyphs quebram em terminal antigo, tmux mal configurado ou `NO_COLOR`; emoji desalinha bordas.
**Solução:** detecção de capacidades com degradê (truecolor→256→16→mono), `figures` p/ fallback de glyphs, `string-width` p/ células, tema Sóbrio automático, teste visual nos 6 terminais da matriz (16.5/16.8).

## 11.12 Escopo (o maior risco do projeto)

**Risco:** o prompt pede "tudo" (voz, pet, multi-agente, MCP...) — dá para afundar meses sem ter nada usável.
**Solução:** roadmap com MVP real na F2 (~5 semanas) e uso próprio diário a partir daí ("dogfooding" nos projetos do Álvaro); cada fase seguinte só começa se a anterior estiver sendo usada de verdade. Gamificação/voz são explicitamente adiáveis sem afetar o núcleo.
