# 05 — Agentes: Loop, Subagentes, Background e Planejamento

## 5.1 Loop agêntico principal

O núcleo é um loop de turnos com function calling:

```
prompt → [modelo → tool_calls? → permissão → execução → resultados → modelo]* → resposta final
```

Regras de projeto:

- **Streaming sempre**: texto do modelo renderiza conforme chega; tool calls aparecem como cards de status.
- **Limite de iterações** por turno (configurável, padrão ~40) com aviso ao usuário ao atingir.
- **Interrupção**: `Esc` cancela o turno; tool em execução recebe SIGTERM; estado da sessão fica consistente.
- **Orçamento de contexto**: antes de cada chamada, o SessionManager calcula tokens e, se necessário, compacta (resumo estruturado do histórico antigo preservando decisões, arquivos tocados e pendências).

Checklist de especificação:
- [ ] Definir formato do resumo de compactação (o que NUNCA pode ser perdido)
- [ ] Política de truncamento de tool results grandes (head+tail com aviso)
- [ ] Cancelamento limpo no meio de um tool call

## 5.2 Sistema de permissões

| Modo | Comportamento |
|---|---|
| `allowlist` (**padrão de fábrica** — decisão 2026-07-22) | Vem com allowlist esperta pré-aprovada: leituras livres, `edit/write` dentro do projeto, comandos sabidamente seguros (rodar testes/build/lint detectados, git status/diff/log). Pergunta só o arriscado: `rm`/deleções, `git push`, instalar pacotes, rede, qualquer coisa fora do diretório do projeto |
| `ask` | Toda escrita/bash pede aprovação; leituras livres (p/ quem quer controle total) |
| `auto` | Tudo passa (equivalente "YOLO"); banner de aviso permanente |

- Aprovação na TUI com opções: **sim / sim e não perguntar mais (gera regra de allowlist) / não / não e diga o porquê**.
- Níveis de risco por tool (read < glob/grep < edit/write < bash < git push) — o modo `allowlist` usa isso como padrão inicial.
- [ ] Especificar sintaxe dos padrões de allowlist no settings.json
- [ ] Especificar a **allowlist de fábrica** exata (o que é "sabidamente seguro") e revisá-la com red-team básico
- [ ] Deny-list sempre ativa (ex.: `rm -rf /`, escrita fora do projeto sem confirmação explícita)

## 5.3 Subagentes (orquestração multi-agente local)

**Mecanismo:** o próprio binário relançado como child process (`codingpro --agent-mode`), conversando com o orquestrador por JSON-RPC sobre stdio.

- Cada subagente tem: prompt de tarefa, tipo (define perfil `auto|main|fast`, system prompt e tools permitidas), diretório de trabalho, limite de tokens/tempo. Os perfis resolvem somente para DeepSeek V4 Pro/Flash.
- Contexto **isolado**: o subagente não vê a conversa principal; recebe só o prompt; devolve um relatório final.
- Tipos padrão de fábrica: `explorer` (só leitura, busca), `worker` (geral), `architect` (reasoning alto, só planeja), `reviewer` (só leitura, reporta achados).
- Tipos custom: `.codingpro/agents/nome.md` com frontmatter (perfil, tools, prompt), sem provider, endpoint ou ID de modelo arbitrário.
- Paralelismo: orquestrador roda até N em paralelo (padrão 3) — casos de uso: revisão multi-perspectiva, exploração de codebase, comparação de abordagens.
- Isolamento de arquivos opcional por **git worktree** temporário (subagente mexe numa cópia; merge só se aprovado).

Checklist:
- [ ] Protocolo JSON-RPC (métodos: start, progress, tool_permission_escalation, report, kill)
- [ ] Como aprovações de permissão de subagentes chegam ao usuário (fila única na TUI principal)
- [ ] Política de custo: teto de gasto por subagente e por turno do orquestrador
- [ ] Worktree: criação, limpeza automática, estratégia de merge

## 5.4 Tarefas em background

- Qualquer subagente pode rodar em background: usuário continua conversando enquanto ele trabalha.
- Ao concluir: evento na TUI + notificação desktop (`notify-send`).
- Comandos: `/tasks` (lista), `/tasks output <id>`, `/tasks stop <id>`.
- Persistência: se a CLI fechar, tarefas background morrem junto (sem daemon na v1) — mas o log parcial fica salvo e é reportado na próxima sessão.
- [ ] Definir armazenamento de logs de tarefas (`.codingpro/tasks/<id>.jsonl`)
- [ ] Reconciliação na abertura: detectar tarefas órfãs e avisar

## 5.5 Modo planejamento

Fluxo para tarefas grandes (adaptação local do conceito de "planejamento remoto"):

1. Usuário entra em modo plano (`Shift+Tab` ou `/plan`).
2. A CLI só **lê** (tools de escrita bloqueadas) e pode lançar subagente `architect` com reasoning alto.
3. Sai um plano em Markdown com checklist, exibido para aprovação.
4. Aprovado → vira o guia da execução; o plano é salvo em `.codingpro/plans/AAAA-MM-DD-slug.md` e os itens vão sendo marcados durante a execução.

- [ ] Definir template do plano (contexto, passos, riscos, critério de pronto)
- [ ] Comportamento de rejeição (editar plano no $EDITOR e reaprovar)

## 5.6 Aprendizado com as referências

- **Cline** (Apache-2.0, TS): máquina de estados do loop de tool use, apresentação de aprovações, checkpoints — código portável quase direto.
- **OpenCode/sst** (MIT, TS): gestão de sessões e modos de agente primário vs subagente.
- **Aider** (conceito): "arquiteto + editor" como par de modelos — mapeia direto no nosso `architect` + `worker`.
