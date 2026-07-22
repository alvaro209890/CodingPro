# F2-03 — Distribuição Windows

## Empacotamento

- **electron-builder** com alvo **NSIS** (instalador .exe clássico: escolhe pasta, atalho, desinstalador) — padrão que o usuário Windows espera.
- Build **x64** primeiro; ARM64 se houver demanda.
- Tamanho alvo: < 150 MB instalado (Electron + core; binários de voz continuam download lazy).
- Ícone/branding Aurora (gerar .ico multi-resolução a partir do logo escolhido na Fase 1).

## Auto-update

- **electron-updater** checando **GitHub Releases** do repo — mesmo modelo que o Álvaro já usa no `vertex-cli` (checagem de release + download), agora com o fluxo padrão do Electron (download em background → "Reiniciar para atualizar").
- Canal `latest` único na v1; canal `beta` opt-in depois.
- Changelog em pt-BR exibido no app após atualizar.

## Assinatura de código (decisão consciente)

| Opção | Custo | Efeito |
|---|---|---|
| Sem certificado (início) | R$ 0 | SmartScreen avisa "editor desconhecido" — aceitável em beta fechado |
| Certificado OV/EV | ~US$ 100–400/ano | Remove aviso com o tempo (reputação) |

- Fase beta: **sem assinatura**, com página de instruções honesta ("por que o aviso aparece").
- Antes de divulgar público (Fase 3): comprar certificado e assinar no CI.

## Requisitos de máquina (documentar na página de download)

- Windows 10 22H2+ / Windows 11, x64, 8 GB RAM (16 recomendado p/ voz local)
- **Git for Windows** (o instalador detecta e oferece link)
- PowerShell 7 recomendado (funciona com o 5.1 embutido)

## CI de release

- [ ] Workflow `release-desktop.yml`: build + NSIS + (futuro) assinatura + publicar no GitHub Releases com notas em pt-BR
- [ ] Runner Windows no GitHub Actions (padrão) — sem precisar de máquina Windows própria p/ buildar
- [ ] Smoke test pós-build: instalar silencioso em VM, abrir, rodar `doctor`, desinstalar limpo

## Máquina de teste real

- Testes manuais no **PCQUE001IMAP** (Windows do trabalho do Álvaro, já na rede via Barrier) ou VM local — definir na W0.
- [ ] Roteiro de QA Windows: instalar, tarefa real num repo, autoupdate de versão N→N+1, desinstalar sem lixo
