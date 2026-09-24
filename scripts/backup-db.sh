#!/usr/bin/env bash
# Backup do banco de produção (`campax`) em formato custom do pg_dump (restaurável com pg_restore).
# Roda diariamente via /etc/cron.d/campax-backup e manualmente antes de cada deploy com migração.
# Mantém os últimos RETENTION_DAYS dias. Uso: scripts/backup-db.sh
set -euo pipefail

DB=campax
BACKUP_DIR=${BACKUP_DIR:-/root/backups/campax}
RETENTION_DAYS=${RETENTION_DAYS:-14}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

file="$BACKUP_DIR/campax-$(date -u +%Y%m%d-%H%M).dump"
tmp="$file.partial"

# Grava num arquivo temporário e só renomeia no fim: um dump interrompido nunca parece válido.
sudo -u postgres pg_dump -Fc "$DB" > "$tmp"
mv "$tmp" "$file"
chmod 600 "$file"

find "$BACKUP_DIR" -name 'campax-*.dump' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name '*.partial' -mmin +60 -delete

echo "$(date -u +%FT%TZ) backup ok: $file ($(du -h "$file" | cut -f1))"
