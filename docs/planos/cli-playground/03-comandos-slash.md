# Plano: Todos os Comandos `/` Funcionando

## Comandos Existentes ✅

| Comando | Ação | Status |
|---------|------|--------|
| `/clear` | Limpa mensagens do chat atual | ✅ |
| `/files` | Abre aba Files | ✅ |
| `/memory` | Abre aba Memory | ✅ |
| `/help` | Mostra lista de comandos | ✅ |

## Comandos a Implementar

### Gestão de Chats
| Comando | Ação | Prioridade |
|---------|------|-----------|
| `/new` | Cria novo chat em branco | P0 |
| `/list` | Lista todos os chats com IDs | P0 |
| `/switch <id>` | Troca para chat específico | P0 |
| `/delete <id>` | Deleta chat (com confirmação) | P1 |
| `/rename <nome>` | Renomeia chat atual | P1 |

### Workspace
| Comando | Ação | Prioridade |
|---------|------|-----------|
| `/ls [path]` | Lista arquivos do workspace | P0 |
| `/cat <file>` | Mostra conteúdo de arquivo | P1 |
| `/edit <file>` | Abre arquivo no editor | P1 |
| `/run <file>` | Executa arquivo no terminal | P1 |
| `/cd <path>` | Muda diretório do workspace | P2 |

### Agente & IA
| Comando | Ação | Prioridade |
|---------|------|-----------|
| `/agent <prompt>` | Modo agente com tools | P1 |
| `/model <pro\|flash>` | Troca modelo (DeepSeek Pro/Flash) | P1 |
| `/context` | Mostra contexto atual do workspace | P2 |
| `/cost` | Mostra custo da sessão | P2 |

### Git
| Comando | Ação | Prioridade |
|---------|------|-----------|
| `/git clone <url>` | Clona repositório | P1 |
| `/git status` | Status do repositório | P1 |
| `/git pull` | Pull do repositório | P2 |
| `/git log` | Log dos últimos commits | P2 |

### Memória & Persistência
| Comando | Ação | Prioridade |
|---------|------|-----------|
| `/save [nome]` | Salva chat na memória | P1 |
| `/load <nome>` | Carrega memória salva | P1 |
| `/mems` | Lista memórias salvas | P2 |
| `/export` | Exporta chat como .md (download) | P2 |

### Utilidades
| Comando | Ação | Prioridade |
|---------|------|-----------|
| `/history` | Mostra últimos comandos | P2 |
| `/theme <dark\|light>` | Troca tema | P3 |
| `/shortcuts` | Lista atalhos de teclado | P3 |
| `/about` | Versão e info do sistema | P3 |

## Arquitetura do Handler

```typescript
const comandos: Record<string, (args: string) => void> = {
  "/clear": () => clearChat(),
  "/new": () => newChat(),
  "/list": () => listChats(),
  "/switch": (id) => switchChat(id),
  "/delete": (id) => deleteChat(id),
  "/rename": (nome) => renameChat(nome),
  "/files": () => setTab("files"),
  "/memory": () => setTab("memory"),
  "/ls": (path) => listFiles(path),
  "/cat": (file) => catFile(file),
  "/edit": (file) => editFile(file),
  "/run": (file) => runFile(file),
  "/agent": (prompt) => agentMode(prompt),
  "/model": (m) => switchModel(m),
  "/git": (args) => gitCommand(args),
  "/save": (nome) => saveMemory(nome),
  "/load": (nome) => loadMemory(nome),
  "/help": () => showHelp(),
  // ... etc
};

function handleCommand(input: string) {
  const [cmd, ...args] = input.split(" ");
  const handler = comandos[cmd];
  if (handler) {
    handler(args.join(" "));
    return true;
  }
  return false; // não é comando, envia como prompt
}
```

## Dropdown com Auto-complete

Quando usuário digita `/`, mostrar dropdown filtrando conforme digita:

```
/ag
─────────────
/agent <prompt> — Modo agente com tools
```

- Navegação: seta cima/baixo, Enter seleciona, Esc fecha
- Destaque visual no item selecionado
- Descrição em cinza ao lado do comando
- Ícone indicando categoria (💬 chat, 📁 files, 🔀 git, 🧠 memory)
