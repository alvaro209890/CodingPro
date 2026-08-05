---
name: windows-env
description: Como operar no Windows deste PC — cmd vs bash, Python limpo, encoding, caminhos
tags: [windows, cmd, python, ambiente]
---

# Ambiente Windows — regras de operação

O CodingPro roda no Windows. A tool `bash` executa em **cmd.exe**, não em bash/POSIX.

## Comandos

- Use `dir`, `type`, `where`, `cd /d` — **não** `ls`, `cat`, `which`, `cd`.
- Caminhos: `C:\...` ou `C:/...`. Espaços exigem aspas duplas no cmd.
- One-liners Python multi-linha **falham** no cmd (quebras de linha truncadas). Prefira 1 linha ou salve um `.py` e rode.

## Python

- O `python` do PATH pode ter `PYTHONPATH` poluído (aponta para venv do Hermes, PIL quebrado).
- **Use o Python limpo:** `C:\Users\Usuario\AppData\Local\Programs\Python\Python312\python.exe -E`
  (ou `py -3` quando existir). O `-E` ignora PYTHONPATH.
- Python 2.7 do ArcGIS (`C:\Python27\ArcGIS10.8\python.exe`) só para toolboxes ArcMap.

## Encoding

- Saída de comandos pode vir com acentos estranhos (codepage do cmd). Não é erro — normalize ao ler.
- Para imprimir texto UTF-8 no Python via cmd: `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`.

## Ferramentas de arquivo vs bash

- Prefira as tools de arquivo do sandbox (`read_file`, `list_dir`, `grep`) para caminhos dentro da raiz.
- Use `bash` só para o que elas não cobrem (git, processos, comandos do sistema).
- Sandbox: tools só veem a pasta aberta. Para outro projeto use `/abrir <caminho>`.
