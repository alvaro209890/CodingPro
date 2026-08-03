# Desktop 1.1.0 — auditoria funcional, refino de UI e fim do token manual

**Autor:** Claude (via Álvaro) · **Data:** 2026-08-03
**Escopo:** `packages/desktop` (frontend Electron) + o mínimo em `packages/api`/`packages/web`
para tirar a criação de token do produto.

---

## 1. Auditoria funcional — o que estava quebrado

Inventário de cada controle do renderer. Os itens abaixo **não eram cosméticos**: eram
botões sem efeito, dados inventados ou fluxos que travavam o app.

### 1.1 Travamento real (crítico)

**Fila de permissões.** O renderer guardava um único `currentPermissionRequest`. Quando dois
pedidos chegavam juntos — o caso normal desde que subagentes passaram a poder escrever — o
segundo **sobrescrevia** o primeiro. O primeiro nunca era respondido, e a promessa
correspondente no main ficava pendente para sempre: o turno travava sem mensagem de erro.
Agora é uma fila; cada pedido é respondido na ordem, o modal mostra “+N na fila”, e responder
remove **só** o pedido respondido.

### 1.2 Controles que não faziam nada

| Controle | O que parecia | O que era |
|---|---|---|
| Botão “+” do dock | “Anexar / comandos” | **Sem `onClick`.** Pura decoração. |
| Chip do modelo no dock | Um seletor | `<button>` **sem `onClick`**. |
| “Search” na sidebar | Buscar, dica “Ctrl+K” | Chamava `onSelectTab("code")` — **não abria a paleta**. |

Correções: o “+” agora insere `/` e abre a lista de comandos (ação real); o chip virou texto
informativo — e depois saiu de vez (§3); “Comandos” abre a paleta de verdade.

### 1.3 Dados falsos apresentados como reais

| Onde | Mentira | Agora |
|---|---|---|
| Rodapé da sidebar | “Álvaro Emanuel · Pro Plan” **hardcoded** | Modo de acesso real (`conta` / `chave própria` / `sem acesso`) |
| Barra do dock | `branchName="master"` **fixo no código** | Branch git real da pasta aberta (`git rev-parse`), omitida fora de repositório |
| Barra do dock | “This PC” | “roda neste computador” |
| Configurações | “Versão v0.1.0 — Fase 2 (W3-dev)” | Versão real via `app.getVersion()` (era 1.0.2 na época) |
| Configurações | “Skills automáticas: **Ativo**” | Quantidade real de skills carregadas |
| Configurações | 4 amostras de tema **idênticas** (liam as variáveis do tema ativo) | Gradiente real de cada tema, via `gradienteCSS(PALETAS[t])` |
| Cabeçalho | `projectName` recebido e **nunca renderizado** | Projeto + branch + conversa, com caminho no `title` |

### 1.4 Catálogo de comandos triplicado

Três listas divergentes: dock com 15 comandos escritos à mão, paleta com 10, e o catálogo real
compartilhado com **21**. `/doctor`, `/skills`, `/skill`, `/memory`, `/index` e `/nova` não
apareciam em lugar nenhum, embora o main os executasse. O `getSlashCommands()` existia no
preload e **nunca era chamado**. Agora dock e paleta consomem o catálogo do main, com o
compartilhado como fallback.

### 1.5 APIs do preload que ninguém chamava

`estadoAcesso`, `contaLogout`, `contaLogin`, `contaConsultar`, `setWorkspace`,
`getDiffPreview`, `getSlashCommands`, `getAutoApprove` — todas expostas, nenhuma usada.
Consequências reais: **não havia como sair da conta** pelo app, e o botão de auto-aprovar
mostrava “desligado” depois de recarregar a janela mesmo com o main ligado (`getAutoApprove`
nunca consultado). Corrigido: logout na sidebar e estado inicial lido do main.

### 1.6 Acessibilidade e teclado

- Paleta `Ctrl+K` **sem navegação por setas** — só mouse. Agora ↑/↓/Home/End/Enter/Esc, com
  `aria-activedescendant` e rolagem do item selecionado.
- Modal de permissão sem foco inicial e **sem Esc**. Agora foca “Permitir” e `Esc` **nega**
  (fail-closed: a saída segura nunca é aprovar).
- Sem `prefers-reduced-motion` em lugar nenhum. Agora respeitado, mais um interruptor
  explícito nas configurações que vence a preferência do sistema.
- Foco visível consistente (`:focus-visible`) em tudo que é operável.

### 1.7 Outros defeitos

- **Terminal:** chave React derivada do texto (`log.slice(0,24)`) → **chaves duplicadas** ao
  repetir um comando. Agora id próprio. Ganhou histórico com ↑/↓, botão limpar, foco ao abrir,
  `Esc` para fechar e saída tipada (comando/saída/erro/meta).
- **Sessões:** `updatedAt` chegava da API e era **descartado** — a coluna de tempo ficava
  sempre vazia. E a lista começava com uma sessão fantasma `id: "current"`.
- **Painel de subagentes:** acumulava as execuções de todos os turnos da sessão.
- **Código morto:** `RuntimeStatusRow` e `_CORES_TEMA` sem nenhum consumidor; props
  `onModelChange`/`onEffortChange` declaradas e nunca passadas.

## 2. Refino visual e de UX

Sem redesenhar por redesenhar: a identidade Aurora fica, o que muda é hierarquia e acabamento.
Todo o CSS novo vive em `packages/desktop/src/renderer/refino.css`, carregado por último e
usando **apenas tokens existentes** (`--bg-*`, `--text-*`, `--border-*`, `--accent-*`) — nada
de cor literal nova, para os quatro temas continuarem válidos.

- **Cabeçalho** passa a identificar o trabalho: projeto em destaque, branch, conversa.
- **Estado vazio** do chat explica o modelo de segurança (“o agente só enxerga a pasta aberta;
  toda escrita passa por você”) e oferece três exemplos clicáveis.
- **Modal de permissão** diz em uma frase o que vai acontecer (“Editar src/app.ts”,
  “Executar: pnpm test”) em vez de despejar JSON, e explica o alcance do “Sempre permitir”.
- **Composer** cresce com o texto até um teto, e a barra de status mostra o consumo de
  contexto em porcentagem.
- **Interface inteira em pt-BR**: saíram “New Agent”, “Search”, “Customize”, “Agents”,
  “Workspace”, “Stop”, “IDE”, “Send follow-up”, “Terminals”, “This PC”, “steps”, “Thought”.
- **Responsividade**: em janelas estreitas some primeiro o supérfluo (rótulos, branch, custo);
  abaixo de 680px a sidebar recolhe.

## 3. Nome do modelo fora do app

Decisão de produto: o app **não expõe o provedor nem o modelo**. Saíram o chip do dock, a
seção “Modelo” das configurações e o estado `modelInfo`. O evento `model-info` continua
existindo no core (o main ainda roteia esforço por dificuldade) — a UI apenas não o exibe.
No site, o console da hero passou a mostrar “CodingPro Cloud”.

## 4. Fim da criação manual de token

O padrão do produto é a **conta CodingPro Cloud**. O usuário não deve criar, copiar nem
guardar token nenhum.

- **API:** `POST /api/tokens` **removida**. Sobraram `GET` (listar máquinas conectadas) e
  `DELETE` (desconectar uma) — controle de segurança genuíno, não gestão de credencial.
- **Web:** a aba “Tokens da CLI” virou **“Dispositivos”**: sem formulário de geração, sem
  token revelado na tela. Lista as máquinas conectadas com “Desconectar”.
- **Desktop:** a sidebar não mostra mais o prefixo do token; exibe só “CodingPro Cloud ·
  conectado”.
- **Emissão:** continua existindo, automática, pelo device flow (`codingpro login` / login do
  app). É o único caminho.
- **Testes:** o helper `conectarDispositivo()` em `packages/api/test/ajuda.ts` roda o device
  flow de ponta a ponta; os testes que antes chamavam `POST /api/tokens` agora usam o mesmo
  caminho do usuário.

## 5. Testes e verificação

| Etapa | Resultado |
|---|---|
| `biome format .` | ✅ 304 arquivos, 0 erros |
| `biome lint .` | ✅ 307 arquivos, **0 erros** (5 warnings de `!important` legado) |
| `tsc --noEmit` (raiz) | ✅ |
| `tsc --noEmit` (desktop) | ✅ |
| `typecheck` web / admin | ✅ / ✅ |
| `vitest run` | ✅ **954 passaram**, 48 pulados, 88 arquivos |
| `pnpm build` | ✅ llm, core, cli, desktop, api, web, admin |
| `node scripts/smoke-package.mjs` | ✅ |
| `node packages/desktop/scripts/smoke-core.mjs` | ✅ `SMOKE_OK` |
| `node packages/desktop/scripts/smoke-int.mjs` | ⚠️ **falhou na autenticação** — ver abaixo |
| Electron abrindo no Windows | ✅ janela “CodingPro Desktop”, `preload API: object` |

Testes novos em `packages/desktop/test/renderer-comportamento.test.ts` (11 casos): fila de
permissões (paralelo, resposta parcial, id repetido), catálogo único de comandos, gradientes
distintos por tema e rótulo relativo das conversas.

### Limitações desta rodada — declaradas, não escondidas

- **Smoke real do DeepSeek não passou.** A chave em
  `~/.config/codingpro/deepseek.env` está inválida (`A autenticação da DeepSeek falhou`). O
  caminho que o app distribuído realmente usa — **conta cloud** — foi verificado à parte e
  **funciona**: `POST /v1/chat/completions` com o token da conta devolveu HTTP 200 com resposta
  real do modelo. Nenhuma chave foi impressa em log.
- **QA visual do Electron não foi concluído.** O app foi aberto e confirmado vivo (preload
  carregado), mas o Álvaro pediu que eu parasse de operar a máquina dele; encerrei o processo.
  A correção dos chips de tema (que apareciam com o nome cortado) foi feita a partir do
  print enviado por ele, não de verificação minha na tela.
- **Testes de API com Postgres** (`integracao`/`admin`) ficam pulados sem `DATABASE_URL_TESTE`;
  a adaptação ao device flow está coberta por typecheck, não por execução.

## 6. Build, release e rollback

```bash
pnpm --filter @codingpro/desktop build     # tsc + preload + vite
pnpm desktop:dist                          # NSIS + portable em packages/desktop/.pack/release
git tag desktop-v1.1.0 && git push origin desktop-v1.1.0
```

A tag dispara `.github/workflows/desktop-windows.yml`, que builda no runner Windows e publica
os `.exe` na GitHub Release.

**Publicar no site:** copiar os artefatos para a pasta apontada por `CODINGPRO_DOWNLOADS_DIR`
no acer e reiniciar `codingpro-web`. Constantes do front em `packages/web/src/ui/downloads.ts`.

**Rollback:** o site serve o que estiver na pasta de downloads — voltar os `.exe` de 1.0.2 e
reverter `DESKTOP_VERSAO` restaura a versão anterior sem tocar na API. No app, `git revert` do
commit desta entrega devolve a UI antiga; nada de banco ou credencial muda.
