# Plano: Navegação entre Chats da CLI

## Visão Geral

Permitir que o usuário tenha múltiplos chats simultâneos na aba CLI, podendo criar, trocar, renomear e deletar conversas — como abas de terminal.

## Estrutura de Dados

```typescript
interface ChatSession {
  id: string;           // UUID
  nome: string;         // "Chat 1", "Debug do proxy", etc
  mensagens: Mensagem[];
  criadoEm: number;     // timestamp
  atualizadoEm: number;
  modelo: "pro" | "flash";
  workspace?: string;   // cwd opcional
}

interface Mensagem {
  role: "user" | "assistant" | "system";
  content: string;
  tools?: { nome: string; result: string }[];
}
```

## UI — Layout

```
┌─────────────────────────────────────────┐
│ ⚡ CodingPro vps    alvaro@gmail.com  [+]│
├─────────────────────────────────────────┤
│ ▸ Chat 1 (3 msgs)                       │
│   Chat 2 — Debug (12 msgs) ● ativo      │
│   Chat 3 — API test (0 msgs)            │
├─────────────────────────────────────────┤
│ ▸ você                                  │
│ Oi                                       │
│                                         │
│ ◂ codingpro                             │
│ Olá! Como posso ajudar?                 │
│                                         │
├─────────────────────────────────────────┤
│ ▸ Digite / para comandos...        [▶]  │
├─────────────────────────────────────────┤
│ ⚡CLI 💬Chat 📁Files ✏️Editor >_Term ...  │
└─────────────────────────────────────────┘
```

### Sidebar de chats (colapsável)
- Lista de chats com nome, contagem de mensagens, timestamp
- Chat ativo destacado com ● verde
- Botão [+] no header para novo chat
- Swipe left para deletar (mobile)
- Botão ✕ para fechar chat (desktop)
- Clique no nome para renomear (inline edit)
- Scroll com virtualização se > 20 chats

### Comportamento
- Novo chat: abre automaticamente, nome "Chat N"
- Trocar chat: mantém input atual, carrega mensagens do chat selecionado
- Deletar chat: confirmação, remove do state e localStorage
- Persistência: `localStorage.setItem('codingpro-chats', JSON.stringify(chats))`
- Auto-save: salva a cada nova mensagem (debounce 1s)
- Limite: máximo 50 chats, avisa quando atingir
- Export: botão para baixar chat como .md

## Implementação

### State Management
```typescript
const [chats, setChats] = useState<ChatSession[]>(() => {
  // Carrega do localStorage
  const saved = localStorage.getItem('codingpro-chats');
  return saved ? JSON.parse(saved) : [{ id: '1', nome: 'Chat 1', mensagens: [], criadoEm: Date.now(), atualizadoEm: Date.now(), modelo: 'pro' }];
});

const [activeChatId, setActiveChatId] = useState(chats[0]?.id);
const activeChat = chats.find(c => c.id === activeChatId);
```

### Persistência
```typescript
useEffect(() => {
  localStorage.setItem('codingpro-chats', JSON.stringify(chats));
}, [chats]);
```

### Comandos de chat
- `/new` — cria novo chat
- `/list` — lista todos os chats
- `/switch 2` — troca para chat 2
- `/delete 3` — deleta chat 3
- `/rename Debug` — renomeia chat atual
- `/export` — download do chat como .md

## UX Mobile

- Sidebar ocupa tela cheia quando aberta (drawer)
- Botão ☰ no header para abrir/fechar
- Swipe right na borda esquerda abre sidebar
- Toque fora fecha sidebar
- Chat ativo tem indicador visual na tab bar
