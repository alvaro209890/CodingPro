# Plano: Melhorias e Validação da CLI no Playground

## Objetivo

Transformar a aba CLI do Playground em uma experiência completa de terminal CodingPro no navegador, com múltiplos chats, persistência, e todos os comandos `/` funcionais.

## Status Atual

| Funcionalidade | Estado |
|---------------|--------|
| Input direto (sem prefixo) | ✅ Envia prompt para o agente |
| Streaming SSE | ✅ Resposta aparece em tempo real |
| Banner ASCII | ✅ Mostra na primeira carga |
| Slash `/clear` | ✅ Limpa mensagens |
| Slash `/files` | ✅ Abre aba Files |
| Slash `/memory` | ✅ Abre aba Memory |
| Slash `/help` | ✅ Mostra comandos |
| Múltiplos chats | ❌ Só existe 1 chat por sessão |
| Navegação entre chats | ❌ Não implementado |
| Persistência de chats | ❌ Perde ao recarregar |
| Tool animations | ⚠️ Funciona mas pode melhorar |
| Histórico de comandos | ❌ Não tem seta pra cima |
| Auto-complete | ❌ Só dropdown de slash |

## Melhorias Planejadas

### Fase 1 — Chat Multi-sessão (P0)
- [ ] Criar estrutura de `Session[]` com id, nome, mensagens, timestamp
- [ ] Botão "+" abre novo chat com nome automático
- [ ] Sidebar ou dropdown com lista de chats
- [ ] Trocar entre chats mantendo estado de cada um
- [ ] Deletar chat (com confirmação)

### Fase 2 — Persistência (P1)
- [ ] Salvar chats no `localStorage` (recupera ao recarregar)
- [ ] Opção de salvar no servidor (`.memory/chats/`)
- [ ] Auto-save a cada 5 mensagens
- [ ] Restaurar última sessão ao abrir

### Fase 3 — Comandos Completos (P2)
- [ ] `/new` — novo chat
- [ ] `/list` — lista chats salvos
- [ ] `/switch <id>` — troca para chat específico
- [ ] `/delete <id>` — deleta chat
- [ ] `/rename <nome>` — renomeia chat atual
- [ ] `/export` — exporta chat como .md
- [ ] `/history` — mostra últimos comandos
- [ ] `/context` — mostra arquivos no workspace
- [ ] `/agent <prompt>` — modo agente com tools
- [ ] `/model <pro|flash>` — troca modelo

### Fase 4 — UX (P3)
- [ ] Histórico de comandos (seta cima/baixo)
- [ ] Auto-complete de paths do workspace
- [ ] Syntax highlight no editor
- [ ] Tool animations melhoradas (progresso real)
- [ ] Atalhos de teclado (Ctrl+L limpa, Ctrl+N novo)
- [ ] Tema claro/escuro toggle

## Validação

### Testes manuais
- [ ] Abrir 3 chats, trocar entre eles, verificar estado isolado
- [ ] Fechar navegador, reabrir, verificar persistência
- [ ] Todos os comandos `/` retornam resposta correta
- [ ] Chat com 100+ mensagens não trava
- [ ] Dois chats simultâneos não interferem
- [ ] Mobile: sidebar colapsa, gestos funcionam

### Testes de integração
- [ ] Login → novo chat → enviar prompt → resposta streaming
- [ ] Mudar de chat durante streaming → continua no chat original
- [ ] `/memory` salva contexto do chat atual
- [ ] `/files` mostra arquivos do workspace correto
- [ ] `/agent` usa tools reais e retorna resultado

### Performance
- [ ] Tempo de resposta < 500ms para iniciar streaming
- [ ] 50 chats no localStorage não degradam performance
- [ ] Scroll de 500 mensagens fluido
- [ ] Tamanho do bundle < 300KB gzip
