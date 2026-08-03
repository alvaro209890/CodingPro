# Relatório de Correções — Subagentes, UI do chat e gate no Windows (2026-08-03)

**Autor:** Claude (via Álvaro)
**Escopo:** repo CodingPro (`C:\GIS\CodingPro`) — desenvolvido e testado no PC `windows` (Node 22 local; gate completo verde)
**Resultado:** gate **verde** (format, lint, typecheck ×3, 946 testes, build, smoke de pacote) — e agora executável também no Windows.

---

## 1. Subagentes não funcionavam — 4 defeitos encadeados

O sintoma ("chamei o `task` e não veio nada") tinha quatro causas somadas, todas em
`packages/core`:

| # | Defeito | Efeito para o usuário | Correção |
|---|---|---|---|
| 1 | `SUBAGENTE_TIMEOUT_MS = 120_000` em `subagent-spawner.ts` | Todo papel roda DeepSeek V4 Flash com raciocínio `high`/`max` e até 12 passos com ferramentas. 2 min cortavam quase toda execução real no meio, e o relatório voltava `(interrompido)` + `(sem saída)`. | `SUBAGENTE_TIMEOUT_PADRAO_MS = 600_000` (10 min), em `subagent.ts` e configurável por `timeoutMs`. |
| 2 | `executarSubagente` criava `PermissionController` **sem aprovador** | O tipo `worker` anuncia `edit_file`/`write_file`, mas toda escrita voltava `execution-denied` (fail-closed). O subagente "rodava" e não fazia nada. | `ExecutarSubagenteOptions.approver` + `permissionMode`, propagados pelo `criarSpawnerSubagentes`. Desktop e chat da CLI passam o aprovador do runtime pai. |
| 3 | Erro real dentro do subagente virava `throw` | O `ToolRegistry` capturava e devolvia o genérico **"A ferramenta falhou ao executar."** — sem auth, saldo ou rede aparecerem em lugar nenhum. | Falha vira relatório com a causa (`(falhou: …)`), e a tool `task` captura por tarefa para uma não derrubar as irmãs. |
| 4 | `interrompido` não dizia o motivo e reportava `passos: 0` | Timeout e cancelamento eram indistinguíveis, ambos mudos. | Novo campo `SubagenteRelatorio.motivo` (`timeout` / `cancelado` / `erro`), texto explicando, e contagem real de passos. |

Cobertura nova em `packages/core/test/subagent.test.ts` (4 testes), incluindo o par que
prova a correção nº 2: sem aprovador o `worker` **não** escreve; com o aprovador do
runtime pai, escreve de verdade.

## 2. UI do chat (desktop)

- **Aviso de conta cloud fora da fala da IA.** `"Chave DeepSeek local inválida — usando conta
  CodingPro Cloud."` era empurrado como mensagem `role: "assistant"`, ou seja, a IA parecia
  estar dizendo aquilo. Agora existe `role: "notice"` e uma faixa própria (`.system-notice`),
  visualmente distinta da bolha do assistente. Vale para todo `notice` (avisos de MCP, etc.).
- **Ferramentas fechadas por padrão.** `ToolSummaryBlock` abria expandido (`useState(true)`).
  Agora nasce fechado e abre no clique, igual às janelas de raciocínio. O mesmo foi aplicado ao
  playground web (`ChatView.tsx` abria a última ferramenta via `open={i === last}`).
- **Painel de subagentes limpo por turno.** `setSubAgents([])` no envio — antes acumulava as
  execuções de todos os turnos da sessão.

## 3. Gate reprodutível no Windows

O gate só rodava no Linux. Três bloqueios, todos corrigidos:

- **`.gitattributes` ausente.** Com `core.autocrlf=true` o checkout Windows vira CRLF, o Biome
  formata em LF e `pnpm format:check` nascia vermelho em 263 arquivos sem ninguém ter mexido em
  nada. Adicionado `* text=auto eol=lf` + binários marcados.
- **`odysseus/` varrido pelo lint.** Projeto de terceiro deixado na árvore, não ignorado: o
  Biome (que respeita o `.gitignore`) acusava ~16k erros que não são do CodingPro. Adicionado ao
  `.gitignore` junto com `.hermes/`.
- **`scripts/smoke-package.mjs` não rodava no Windows.** `execFileSync`/`spawnSync` não resolvem
  `PATHEXT` (ENOENT em `pnpm`/`npm`) e, desde o Node 20, recusam `.cmd` sem `shell: true`
  (EINVAL). Além disso `os.homedir()` no Windows lê `USERPROFILE`, não `HOME` — a home isolada
  do smoke vazava para a config real da máquina e o teste de precedência falhava. Helpers
  `caminhoBin`/`citar`/`rodarFerramenta`/`spawnBin` + `USERPROFILE` na env isolada.

## 4. Outros

- `packages/llm/test/roles.test.ts` estava fora do padrão Biome (violação de `format:check`
  latente no main) — formatado.
- `packages/web/.../Landing.tsx` anunciava **"DeepSeek V4 Pro"** no console da hero. O produto
  passou a ser Flash único no commit `419dd19`; corrigido para "DeepSeek V4 Flash".

## 5. Workspace no navegador removido

Decisão de produto: **o front de trabalho é o app desktop e a CLI**. A web fica só como
site de conta e informação (cadastro/login, painel de consumo e limites, autorização de
dispositivo, downloads, termos, privacidade).

Além de duplicar o que o desktop já faz melhor (local-first, sem subir código para
servidor nenhum), o `/playground` exigia manter no ar um conjunto de rotas que dava a um
browser autenticado **terminal, escrita de arquivo e git no servidor**. Remover só a tela
deixaria essa superfície viva e sem dono, então front e back saíram juntos.

**Front (`packages/web`)** — removidos: `Playground.tsx`, `PlaygroundTypes.ts`,
`ChatView.tsx`, `EditorPanel.tsx`, `FilesPanel.tsx`, `GitPanel.tsx`, `MemoryPanel.tsx`,
`TerminalPanel.tsx`, `TabBar.tsx`, `InputBar.tsx`, `SlashDropdown.tsx`,
`ThinkingBalloon.tsx`, `TaskTrackerCard.tsx`, `Sidebar.tsx`, `Banner.tsx`,
`CyberBackground.tsx`, `inferirNomeSessao.ts`, `MarkdownRenderer.tsx`. Rota `/playground`
e o link "Workspace" saíram do `App.tsx`; links antigos caem no painel.

**Back (`packages/api`)** — removidos: `rotas/playground.ts` (`/api/vps/files`, `upload`,
`read`, `write`, `delete`, `terminal`, `git`, `memory`, `chat`, `info`),
`rotas/agente.ts` (`/api/vps/agent`), `rotas/cli.ts` (`/api/vps/cli/exec`, que dava spawn
da CLI no servidor) e `src/workspace.ts` (raiz de workspaces por usuário). Saiu também o
`@fastify/multipart`, registrado só para o upload do playground, e a coluna **VPS**
(`workspaceMb`) do painel admin, que media aquele diretório.

Cobertura: `packages/api/test/integracao.test.ts` ganhou um teste que afirma **404** em
todas as rotas removidas, para a superfície não voltar por engano.

Texto do site ajustado para não prometer mais workspace no navegador (hero, nota, passo 03
e a tela de entrar). Efeito colateral: o bundle da web caiu de **279 kB → 233 kB** de JS e
de **50 kB → 14 kB** de CSS.

## 6. Gate executado (resultados reais)

| Etapa | Resultado |
|---|---|
| `biome format .` | ✅ 326 arquivos, 0 erros |
| `biome lint .` | ✅ 329 arquivos, 0 erros (107 warnings de `!important` em CSS, pré-existentes) |
| `tsc --noEmit` (raiz) | ✅ |
| `typecheck` web / admin | ✅ / ✅ |
| `vitest run` | ✅ **946 passaram**, 44 pulados, 88 arquivos |
| `pnpm build` | ✅ llm, core, cli, desktop, api, web, admin |
| `node scripts/smoke-package.mjs` | ✅ (agora também no Windows) |
