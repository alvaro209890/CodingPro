# Plano: Melhorias e Validação da CLI no Playground

## Objetivo

Transformar a aba CLI do Playground em uma experiência completa de terminal CodingPro no navegador, com múltiplos chats, persistência, e todos os comandos `/` funcionais.

## Status Final (2026-07-24)

| Funcionalidade | Estado |
|---------------|--------|
| Input direto (sem prefixo) | ✅ Envia prompt para o agente |
| Streaming SSE | ✅ Resposta aparece em tempo real |
| Banner ASCII | ✅ Mostra na primeira carga |
| Slash `/clear` | ✅ Limpa mensagens |
| Slash `/new` | ✅ Cria nova sessão |
| Slash `/list` | ✅ Lista sessões salvas |
| Slash `/switch <id>` | ✅ Troca sessão |
| Slash `/delete <id>` | ✅ Deleta sessão |
| Slash `/rename <nome>` | ✅ Renomeia sessão |
| Slash `/export` | ✅ Exporta como .md (clipboard) |
| Slash `/history` | ✅ Histórico de comandos |
| Slash `/context` | ✅ Arquivos do workspace |
| Slash `/agent <p>` | ✅ Modo agente |
| Slash `/files` | ✅ Abre aba Files |
| Slash `/memory` | ✅ Abre aba Memory |
| Slash `/help` | ✅ Mostra comandos |
| Múltiplos chats | ✅ Sidebar com lista de sessões |
| Navegação entre chats | ✅ Clique na sidebar |
| Persistência de chats | ✅ localStorage (auto-save) |
| Histórico de comandos | ✅ Seta cima/baixo |
| Atalhos de teclado | ✅ Ctrl+L, Ctrl+N, Ctrl+K |
| Deletar chat | ✅ Com confirmação |

## BUG Corrigido

**Cookie cross-domain**: `api.ts` usava URL absoluta (`https://codingpro-api.cursar.space`) para `/api/eu`, fazendo o cookie `cp_sessao` não viajar. Corrigido para URL relativa (`fetch(caminho)`) — tudo passa pelo proxy HTTP, mesmo domínio, cookie sempre enviado.

## Implementação

Arquivo único `packages/web/src/ui/paginas/Playground.tsx` (~823 linhas).

### Estrutura de dados
```typescript
interface Session { id, nome, mensagens, criadaEm }
interface Mensagem { role, content, tools }
```

### Persistência
- localStorage keys: `cp_playground_sessions`, `cp_playground_active`
- Auto-save em cada mudança de sessão
- Máximo 20 sessões

### Comandos
- `/clear` — limpa tela
- `/new` — nova sessão
- `/list` — lista sessões
- `/switch <id>` — troca sessão (últimos 6 chars do ID)
- `/delete <id>` — deleta sessão
- `/rename <nome>` — renomeia sessão atual
- `/export` — copia chat como Markdown
- `/history` — últimos 20 comandos
- `/context` — abre aba Files com arquivos do workspace
- `/agent <prompt>` — modo agente com tools
- `/files` — abre aba Files
- `/memory` — abre aba Memory
- `/help` — lista todos os comandos

### Atalhos
- `Ctrl+L` — limpar tela
- `Ctrl+N` — novo chat
- `Ctrl+K` — toggle sidebar
- `↑/↓` — histórico de comandos
- `Esc` — fecha dropdown/sidebar

### Sidebar
- Mobile: overlay com fundo escuro
- Desktop: barra lateral fixa (280px)
- Lista sessões com: nome, mensagens, data
- Botões: renomear (✎), deletar (✕)
- "+" cria nova sessão vazia
