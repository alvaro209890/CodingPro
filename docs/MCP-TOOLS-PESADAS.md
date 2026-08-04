# Receita MCP — tools pesadas fora do núcleo (plano 02 T13–T15)

Tools de browser, banco e notebook **não** entram em `ALL_TOOLS`. Ficam em servidores MCP
opt-in por projeto, para manter o catálogo enviado ao provider curto (cache-hit / custo).

## Como ligar

1. Crie ou edite `.codingpro/settings.json` na raiz do workspace:

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    }
  }
}
```

2. Reinicie a CLI (`codingpro --chat`) ou o app desktop — o loader (`packages/core/src/mcp-loader.ts`)
   registra as tools MCP com `sideEffect: "exec"` (sempre passam pelo gate).

3. Confirme com `/doctor` ou listando tools na sessão.

## O que NÃO colocar no core

| Tool | Motivo |
|---|---|
| `browser_screenshot` / automação | Dependência pesada, opt-in, manutenção fora do núcleo |
| `db_query` | Credenciais e dialetos por projeto |
| `notebook_run` | Runtime Jupyter específico |

## Relação com o plano 02

P0–P2 (verificação, git, diagnostics, patch, http allowlisted, todos, checkpoint) ficam no
`packages/core`. P3 é só documentação + MCP.
