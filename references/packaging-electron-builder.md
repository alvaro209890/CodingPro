# Empacotar e publicar o desktop Windows

Execute em Windows com a versão de Node declarada no `package.json` raiz (Node 24). A versão do
pacote `@codingpro/desktop`, `DESKTOP_VERSAO` em `packages/web/src/ui/downloads.ts` e os nomes dos
dois executáveis precisam coincidir.

```powershell
pnpm --filter @codingpro/desktop dist
Get-ChildItem packages/desktop/.pack/release/CodingPro-*-1.1.0.exe |
  Select-Object Name,Length
Get-FileHash packages/desktop/.pack/release/CodingPro-*-1.1.0.exe -Algorithm SHA256
```

Artefatos obrigatórios:

- `CodingPro-Setup-<versão>.exe`
- `CodingPro-portable-<versão>.exe`

No acer, `CODINGPRO_DOWNLOADS_DIR` vem de `~/.config/codingpro/env`. Envie os executáveis sem
imprimir o valor da variável e preserve os nomes. Depois valide primeiro no serviço local e então
na URL pública com cache-buster:

```bash
curl -fsSI "http://127.0.0.1:8701/downloads/CodingPro-Setup-1.1.0.exe?x=$(date +%s)"
curl -fsSI "https://codingpro.cursar.space/downloads/CodingPro-Setup-1.1.0.exe?x=$(date +%s)"
```

Um build bem-sucedido não prova instalação em máquina limpa nem assinatura de código. Registre
essas validações separadamente quando forem realizadas.
