#!/usr/bin/env bash
# Backup diário do Postgres CodingPro (pg_dump).
# Uso: deploy/backup-codingpro.sh
# Timer: deploy/systemd/codingpro-backup.{service,timer}
set -euo pipefail

ENV_FILE="${CODINGPRO_ENV:-$HOME/.config/codingpro/env}"
DEST_DIR="${CODINGPRO_BACKUP_DIR:-$HOME/.local/share/codingpro/backups}"
RETENCAO_DIAS="${CODINGPRO_BACKUP_RETENCAO_DIAS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Arquivo de env ausente: $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL não definida em $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST_DIR/codingpro-$STAMP.sql.gz"

pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip -c >"$OUT"
chmod 600 "$OUT"

# Remove backups antigos
find "$DEST_DIR" -type f -name 'codingpro-*.sql.gz' -mtime "+$RETENCAO_DIAS" -delete 2>/dev/null || true

echo "Backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
