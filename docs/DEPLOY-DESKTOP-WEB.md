# Deploy — App Desktop Windows + Site

Guia para gerar o `.exe`, publicar no site (`codingpro.cursar.space`) e atualizar o PC servidor.

## Pré-requisitos (máquina de build)

- Windows 10/11 x64
- Node.js 24 + pnpm 10.34.4
- Git

```powershell
cd C:\GIS\CodingPro
pnpm install --frozen-lockfile
```

## 1. Gerar o instalador (.exe)

Na raiz do monorepo:

```powershell
pnpm desktop:release
```

Isso executa, em sequência:

1. `pnpm desktop:build` — compila core, llm e desktop
2. `pnpm deploy` — monta `.pack/` com dependências de produção
3. `electron-builder` — gera em `packages/desktop/.pack/release/`:
   - `CodingPro-Setup-0.1.0.exe` — instalador NSIS
   - `CodingPro-portable-0.1.0.exe` — versão portátil (sem instalar)
4. Copia os artefatos para `packages/web/dist-site/downloads/`

### Testar localmente antes de publicar

```powershell
# Instalador
Start-Process .\packages\desktop\.pack\release\CodingPro-Setup-0.1.0.exe

# Ou portátil
.\packages\desktop\.pack\release\CodingPro-portable-0.1.0.exe
```

## 2. Autenticação (token da plataforma)

O app desktop suporta **dois modos**:

| Modo | Como configurar |
|------|-----------------|
| **Conta CodingPro (recomendado)** | Na 1ª abertura: tela de login → `codingpro login` no site ou token `cp_…` da plataforma |
| **Chave própria DeepSeek** | Arquivo `%USERPROFILE%\.config\codingpro\deepseek.env` com `DEEPSEEK_API_KEY=sk-…` (permissão 0600) |

O proxy em `https://codingpro-api.cursar.space` aceita tokens `cp_` emitidos após cadastro/login no site.

### Fluxo do usuário final

1. Baixar o `.exe` em https://codingpro.cursar.space/comecar
2. Instalar (ou rodar o portable)
3. Abrir o app → conectar conta (ou colocar chave DeepSeek)
4. **Abrir pasta do projeto** (botão Pasta / `/abrir`) — igual `cd` na CLI
5. Enviar prompts no chat

## 3. Publicar no PC servidor

### A) Atualizar o site (downloads)

No PC servidor (onde roda `codingpro-web`):

```bash
cd /caminho/CodingPro
git pull origin master
pnpm install --frozen-lockfile
pnpm plataforma:build
# Copiar downloads se build foi feito em outra máquina:
# scp packages/web/dist-site/downloads/*.exe servidor:/caminho/.../dist-site/downloads/
pnpm plataforma:restart
```

Os arquivos ficam em:

```text
packages/web/dist-site/downloads/
  CodingPro-Setup-0.1.0.exe
  CodingPro-portable-0.1.0.exe
```

URL pública (via Cloudflare Tunnel):

- https://codingpro.cursar.space/downloads/CodingPro-Setup-0.1.0.exe
- https://codingpro.cursar.space/downloads/CodingPro-portable-0.1.0.exe

### B) Reiniciar serviços

```bash
systemctl --user restart codingpro-api codingpro-web
```

## 4. GitHub Releases (opcional)

Para distribuir também pelo GitHub:

```powershell
gh release create v0.1.0 `
  packages/desktop/.pack/release/CodingPro-Setup-0.1.0.exe `
  packages/desktop/.pack/release/CodingPro-portable-0.1.0.exe `
  --title "CodingPro Desktop 0.1.0" `
  --notes "App Windows com login por token cp_ e correções de tool calls."
```

## 5. SmartScreen (Windows)

Sem certificado de assinatura, o Windows pode mostrar “editor desconhecido”. O usuário clica **Mais informações → Executar assim mesmo**. Documentado na página `/comecar`.

## 6. Changelog desta release (0.1.0)

- UI estilo Cursor (sidebar Agents, composer “Send follow-up”, Thought for Xs)
- Modelo padrão na UI: **DeepSeek V4 Pro** (`deepseek-v4-pro`); Flash só em papel `fast`
- Correção: tool `task` aceita `tasks`/`type` (inglês)
- Correção: `code_search` omitido no Electron (sem SQLite)
- Correção: provider DeepSeek não rejeita tool calls válidas
- Empacotamento NSIS + Portable via `pnpm desktop:release`

## Comandos rápidos

| Comando | Ação |
|---------|------|
| `pnpm desktop` | Dev local (sem instalar) |
| `pnpm desktop:dev` | Hot-reload |
| `pnpm desktop:build` | Só compilar |
| `pnpm desktop:dist` | Gerar `.exe` em `release/` |
| `pnpm desktop:release` | `.exe` + copiar para `dist-site/downloads/` |
