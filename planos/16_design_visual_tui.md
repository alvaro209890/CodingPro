# 16 — Design Visual da TUI ("front bonito")

Diretriz do Álvaro: **interação no estilo da CLI da Claude** (gramática de uso consagrada), mas **visual próprio, novo e bonito** — e todo em português (doc 15). Este doc define a identidade visual.

## 16.1 O que copiamos e o que criamos

| Herdado do estilo Claude Code (gramática de interação) | Criado nosso (a pele) |
|---|---|
| Chat contínuo no terminal, streaming | Identidade "Aurora": gradiente assinatura + trilho de timeline |
| Aprovações inline, allowlist incremental | Paleta própria (nada de laranja/roxo Anthropic) |
| `Shift+Tab` modos, `Esc` interrompe, `@arquivo`, `!` shell | Verbos de progresso em pt-BR (doc 15.4) |
| Slash commands com autocomplete | Comandos em português com alias |
| Statusline no rodapé | Statusline rica: pet + effort auto + cache-hit + custo |
| Diff antes de aplicar | Diff view própria com régua lateral |

## 16.2 Identidade "Aurora"

- **Assinatura visual:** gradiente **esmeralda → ciano → violeta** (aurora boreal — remete a "novo", combina com terminal escuro, distinto de todas as CLIs atuais: Claude=laranja/roxo, Gemini=azul/rosa, Codex=verde-cru).
- **Marcador de prompt:** `◆` (losango) — do usuário em esmeralda; da IA em violeta. Nada de `>` genérico.
- **Trilho de timeline** (grande diferencial de layout): em vez de caixas em volta de cada evento, uma **barra vertical fina (`│`) colorida por tipo** à esquerda dos eventos — verde p/ tools ok, âmbar p/ aguardando permissão, vermelho p/ erro, violeta p/ fala da IA, cinza p/ reasoning colapsado. Leitura vertical limpa, menos "poluição de moldura" que caixas.
- **Tipografia de terminal:** glyphs unicode seguros por padrão (`◆ ● ○ ─ │ ╭ ╰ ✓ ✗ …`); ícones Nerd Font como **upgrade opcional** auto-detectado (`ui.nerdFonts: auto`), nunca requisito.

### Paleta (tema escuro "Aurora", padrão)

| Token | Cor (truecolor) | Uso |
|---|---|---|
| `primary` | `#34D399` esmeralda | Usuário, ações, sucesso suave |
| `accent` | `#22D3EE` ciano | Destaques, links, spinner |
| `ai` | `#A78BFA` violeta | Fala/identidade da IA |
| `warn` | `#FBBF24` âmbar | Permissões, avisos |
| `error` | `#F87171` vermelho | Erros, diff − |
| `success` | `#4ADE80` verde | Testes ok, diff + |
| `muted` | `#6B7280` cinza | Reasoning, metadados, timestamps |
| `surface` | fundo do terminal | Nunca pintar fundo em áreas grandes (respeitar o terminal do usuário) |

Gradiente assinatura: `#34D399 → #22D3EE → #A78BFA` (banner, spinner, barras de progresso, títulos de seção).

## 16.3 Layout (mockup)

```
  ╭─◆ CodingPro ────────────────────────── v0.1.0 ─╮
  │      (banner com gradiente aurora, só 1ª vez)  │
  ╰────────────────────────────────────────────────╯

  ◆ você
  │ corrige o bug do login e roda os testes
  │
  ◆ codingpro                                        ← violeta
  │ Vou investigar o fluxo de login.
  ●─ Pensando…  12s                                  ← cinza, colapsado (Ctrl+O expande)
  ●─ Lendo src/auth/login.ts…             ✓ 0,3s     ← trilho verde
  ●─ Editando src/auth/login.ts…          ✓          ← mostra diff compacto
  │    23 −  if (user.token = null)
  │    23 +  if (user.token === null)
  ●─ Testando…  npm test                  ✓ 4,1s  18/18
  │
  │ Pronto: era atribuição em vez de comparação no
  │ token. Testes todos verdes.
  │
  ╭──────────────────────────────────────────────────╮
  │ ◆ digite sua mensagem…                           │
  ╰──────────────────────────────────────────────────╯
  ⬡ ᶻᶻᶻ │ auto·alto │ v4-pro │ cache 82% │ US$ 0,03 │ ⎇ main
```

Statusline (rodapé fixo): pet (⬡) · effort atual do auto (doc 14.4, transparência sem fricção) · modelo · **taxa de cache-hit** · custo da sessão · branch git. Cada bloco é um componente configurável.

## 16.4 Componentes visuais (a construir na F1, polir na F8)

| Componente | Especificação |
|---|---|
| **Banner** | Logo "CodingPro" em texto com gradiente aurora + dica do dia; some em sessões seguintes (`ui.banner: minimal`) |
| **Spinner** | Braille (`⠋⠙⠹…`) com as cores do gradiente ciclando + verbo pt-BR + tempo decorrido; vira `✓`/`✗` ao concluir |
| **Card de tool** | Linha única no trilho: verbo + alvo + status + duração; expande com detalhes sob demanda (setinha) |
| **Reasoning** | Colapsado: `●─ Pensando… (12s)` pulsando; expandido: texto bruto em cinza itálico com rótulo "Raciocínio (bruto)" |
| **Diff view** | Números de linha em cinza, `+` verde / `−` vermelho sem fundo pintado, cabeçalho com caminho + contagem `+12 −4`; lado a lado se largura ≥ 120 col |
| **Permissão** | Bloco âmbar destacado com o comando/arquivo em evidência e opções numeradas (1 sim · 2 sempre · 3 não · 4 não e explico) — respondível por número |
| **Markdown da IA** | Títulos em negrito gradiente, código com syntax highlight (shiki, tema aurora), tabelas com bordas leves `─` |
| **Seletor** (modelo/tema/sessões) | Lista com filtro fuzzy, highlight esmeralda, preview à direita quando couber |
| **Pet** | Glyph animado na statusline (doc 08.3); estados: feliz ◕ , trabalhando ⚙, dormindo ᶻᶻᶻ, comemorando ✦ |
| **Notificação de fim de tarefa** | Linha destacada com gradiente + sino do terminal (`\a`) opcional |

## 16.5 Temas e capacidades do terminal

- Temas na v1: **Aurora escuro** (padrão), **Aurora claro** (mesmos tokens re-mapeados p/ fundo claro), **Alto contraste** (acessibilidade), **Sóbrio** (sem gradiente/animação — servidores, screen readers). `/tema` troca na hora.
- **Design tokens centralizados** (`packages/tui/src/theme/tokens.ts`): componente nenhum usa cor hardcoded — tema é um mapa token→cor. É isso que torna "visual novo" barato de iterar.
- Detecção de capacidades em runtime: truecolor (`COLORTERM=truecolor`) → 256 cores (aproximação automática) → 16 cores (mapa manual decente) → `NO_COLOR` (respeitado, vira Sóbrio monocromático).
- Largura: layout responsivo ≥ 80 colunas; < 80 degrada com elegância (statusline compacta, diff só unificado).
- Unicode: medir células com `string-width` (emoji/CJK contam 2) — nunca quebrar bordas por causa de emoji.

## 16.6 Movimento (com parcimônia)

- Streaming de texto: aparecer por chunk, sem efeito "máquina de escrever" artificial.
- Spinner e pulso do "Pensando…": únicas animações contínuas (≤ 8 fps, cancela em `Sóbrio`).
- Transição de conclusão: spinner → `✓` com flash de 1 frame esmeralda (sutil, sem repaint da tela).
- Regra: animação nunca atrasa informação; tudo que anima tem versão estática.

## 16.7 Bibliotecas de UI (adição ao doc 03)

| Lib | Uso |
|---|---|
| `ink-gradient` + `gradient-string` | Gradiente aurora em banner/títulos |
| `ink-spinner` (custom frames) | Spinner braille |
| `chalk` v5 | Cores truecolor + fallbacks |
| `figures` | Glyphs com fallback ASCII automático |
| `string-width` | Medição de células unicode |
| `marked` + `marked-terminal` + `shiki` | Markdown + código (tema aurora próprio p/ shiki) |

## 16.8 Checklist de design

- [ ] Definir logo/banner final (tipografia ASCII com gradiente — 3 propostas p/ o Álvaro escolher)
- [ ] Implementar `tokens.ts` + 4 temas + detecção de capacidades
- [ ] Protótipo navegável na F1: banner, chat, trilho, spinner, statusline, permissão
- [ ] Tema shiki "aurora" p/ syntax highlight coerente com a paleta
- [ ] Teste visual em: GNOME Terminal, kitty, alacritty, tmux, xterm 16 cores, `NO_COLOR`
- [ ] Revisão de acessibilidade: contraste ≥ 4.5:1 nos pares texto/fundo dos 4 temas
- [ ] Sessão de QA visual com o Álvaro (screenshots lado a lado com Claude Code p/ garantir que está distinto E bonito)
