# CodingPro Desktop 1.2.0

## Escopo entregue

- Conversas agrupadas por projeto, sem varredura do computador. O índice versionado fica em
  `project-sessions-v1.json` no `userData` do Electron e migra o workspace conhecido de
  `last-workspace.json`.
- Troca atômica de `{ workspacePath, sessionId }`, bloqueada durante uma execução.
- Painel persistente de subagentes com início, progresso, ferramenta atual, passos, duração,
  relatório final, tokens, custo, falha, cancelamento e timeout.
- Ledger por fonte (`main`, `repair`, `subagent:<id>`) com deduplicação; contexto e custo são
  atualizados no começo, durante o streaming com `≈` e reconciliados em cada uso exato.
- Normalização DeepSeek antes da validação: extras são removidos de schemas fechados, coerções
  permitidas são aplicadas e aliases seguros são aceitos apenas em `write_file`. Campos ausentes,
  tipos inválidos, aliases ambíguos, ferramentas desconhecidas e caminhos inseguros continuam
  falhando fechados.
- Status inteiro clicável com projeto, pasta, branch, execução, contexto, custo, tokens, cache,
  raciocínio, turnos, chamadas, subagentes, modelo, esforço, conta, versão e update.
- Marca CP Aurora aplicada ao Electron, NSIS, atalhos, login, sidebar, site, instalação e favicon.

## Arquitetura pública

- Protocolo Core/UI: `1.5.0`.
- Eventos aditivos: `usage-updated` e `subagent-event`.
- Sidebar: `ProjectSessionGroupUI[]`.
- Carregamento: `{ workspacePath, sessionId }`.
- Preload: operações tipadas para consultar, verificar, baixar e instalar atualização, além da
  assinatura dos eventos de progresso.
- Sessões JSONL, comandos, conta Cloud e fluxo de contas pendentes permanecem compatíveis.

## Atualização

- Feed genérico: `https://codingpro.cursar.space/downloads`.
- NSIS: verifica após abrir, pede autorização antes de baixar, mostra progresso e pede uma segunda
  autorização antes de reiniciar/instalar.
- Portátil: consulta `latest.json` e abre o download manual; não tenta se autoatualizar.
- `latest.yml` e `latest.json` usam `Cache-Control: no-store, max-age=0`; binários e blockmap são
  versionados e usam cache imutável.
- A versão 1.1.1 não possui updater. Por isso, a instalação manual da 1.2.0 é a ponte única; a partir
  dela, novas versões podem ser oferecidas dentro do aplicativo.
- Esta release não possui assinatura Authenticode. O aviso do SmartScreen pode continuar aparecendo.

## Validação local

Ambiente: Windows 10, Node 24, pnpm 10.34.4.

- `pnpm check`: aprovado.
- Testes: 3.903 aprovados e 52 pulados.
- Cobertura V8 global: 89,60% statements, 82,29% branches, 92,19% functions e 89,89% lines.
- TypeScript, Biome, builds do LLM/Core/CLI/Desktop/API/Admin/Web e smoke de pacote: aprovados.
- Regressão DeepSeek: três chamadas inválidas seguidas por uma escrita válida de 10 KiB, com uma
  única execução de `write_file`: aprovada.
- Electron de desenvolvimento, `win-unpacked` e aplicativo instalado: preload disponível,
  `rootChildren: 1`, sem erro de renderer, saída 0.
- Upgrade silencioso sobre 1.1.1: aprovado; registro e executável instalados em 1.2.0.
- Updater NSIS contra feed genérico controlado: detectou 1.2.2, exibiu notas, descartou cache com
  SHA-512 divergente, tentou diferencial, fez fallback para download completo, informou 100% e
  reconciliou 86.415.680 bytes com o SHA-256 esperado.
- Falha de rede controlada: `ERR_CONNECTION_REFUSED` virou mensagem segura, estado `error` e saída
  limpa. A recusa do download e a segunda confirmação de instalação foram validadas no QA da UI.
- QA headless nos temas Aurora, Solar, Neon e Mono em 1440, 900 e 680 px: sidebar, subagentes,
  detalhes de uso, update, login e responsividade aprovados sem erros de console.
- Servidor local: site, `/comecar`, saúde, feeds, instalador, portátil e blockmap retornaram 200 com
  as políticas de cache esperadas.

## Artefatos e hashes

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| `CodingPro-Setup-1.2.0.exe` | 86.415.659 | `bb6304c5704f2016ca3db6d357dc08ad5e5a3e95f90538df342e87786909df15` |
| `CodingPro-portable-1.2.0.exe` | 86.176.716 | `8166400de4691692a28d8dfcb5c7ae3833a9d0bfafa7b4e3694ade9cd772d0e1` |
| `CodingPro-Setup-1.2.0.exe.blockmap` | 91.229 | `d94a93411c933f003dd582426da9d00fa14a4d9f46a40a35a79a162956392a2a` |

Os dois executáveis foram validados como PE (`MZ`). O status Authenticode esperado é `NotSigned`.

## URLs da release

- Site: `https://codingpro.cursar.space/`
- Instalação: `https://codingpro.cursar.space/comecar`
- Saúde da API: `https://codingpro-api.cursar.space/saude`
- Instalador: `https://codingpro.cursar.space/downloads/CodingPro-Setup-1.2.0.exe`
- Portátil: `https://codingpro.cursar.space/downloads/CodingPro-portable-1.2.0.exe`
- Blockmap: `https://codingpro.cursar.space/downloads/CodingPro-Setup-1.2.0.exe.blockmap`
- Feeds: `https://codingpro.cursar.space/downloads/latest.yml` e
  `https://codingpro.cursar.space/downloads/latest.json`

## Rollback

1. Manter os artefatos 1.1.1 no diretório de downloads até a confirmação da 1.2.0.
2. Em falha do site, voltar o checkout do servidor ao commit anterior e reconstruir/reiniciar
   `codingpro-api` e `codingpro-web`.
3. Em falha do desktop, retirar `latest.yml`/`latest.json` da 1.2.0, restaurar os metadados anteriores
   e apontar `/comecar` para 1.1.1.
4. Não apagar sessões: o índice 1.2.0 é aditivo e os transcritos JSONL continuam em cada projeto.
