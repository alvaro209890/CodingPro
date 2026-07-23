#!/bin/sh
# Instalador do CodingPro — uso: curl -fsSL <url>/install.sh | sh
set -e

# Cores apenas se a saída for um terminal.
if [ -t 1 ]; then
  VERDE='\033[0;32m'
  VERMELHO='\033[0;31m'
  AMARELO='\033[0;33m'
  RESET='\033[0m'
else
  VERDE=''
  VERMELHO=''
  AMARELO=''
  RESET=''
fi

printf "%bCodingPro — instalador%b\n" "$VERDE" "$RESET"

# 1. Node.js >= 24 (não instala automaticamente; só orienta).
if ! command -v node >/dev/null 2>&1; then
  printf "%bErro: Node.js não encontrado.%b\n" "$VERMELHO" "$RESET"
  echo "Instale o Node.js 24 ou superior em https://nodejs.org/ e rode este script de novo."
  exit 1
fi
NODE_MAJOR=$(node -e "process.stdout.write(String(parseInt(process.versions.node.split('.')[0])))")
if [ "$NODE_MAJOR" -lt 24 ]; then
  printf "%bErro: Node.js %s encontrado, mas é preciso 24 ou superior.%b\n" "$VERMELHO" "$NODE_MAJOR" "$RESET"
  echo "Atualize em https://nodejs.org/ e rode este script de novo."
  exit 1
fi
echo "Node.js $(node --version) ✓"

# 2. npm.
if ! command -v npm >/dev/null 2>&1; then
  printf "%bErro: npm não encontrado (vem com o Node.js).%b\n" "$VERMELHO" "$RESET"
  exit 1
fi

# 3. Instala o pacote global.
echo "Instalando codingpro globalmente…"
if ! npm install -g codingpro; then
  printf "%bErro ao instalar o codingpro.%b\n" "$VERMELHO" "$RESET"
  echo "Se for erro de permissão (EACCES), configure um prefixo global sem sudo:"
  echo "https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"
  exit 1
fi

# 4. Confirma o bin no PATH.
if command -v codingpro >/dev/null 2>&1; then
  echo "codingpro em: $(command -v codingpro)"
else
  NPM_PREFIX=$(npm config get prefix 2>/dev/null || echo "")
  if [ -n "$NPM_PREFIX" ] && [ -d "$NPM_PREFIX/bin" ]; then
    printf "%bO comando 'codingpro' não está no seu PATH.%b\n" "$AMARELO" "$RESET"
    echo "Adicione a linha abaixo ao ~/.profile, ~/.bashrc ou ~/.zshrc e reabra o terminal:"
    printf "%bexport PATH=\"\$PATH:%s/bin\"%b\n" "$VERDE" "$NPM_PREFIX" "$RESET"
  else
    printf "%bNão localizei o diretório de bins globais do npm.%b\n" "$AMARELO" "$RESET"
    echo "Rode 'npm config get prefix' e adicione <prefixo>/bin ao PATH."
  fi
fi

printf "%bPronto! Rode: codingpro --chat%b\n" "$VERDE" "$RESET"
