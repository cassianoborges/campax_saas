#!/usr/bin/env bash
# Teste de restauração: restaura um backup num banco temporário, compara a contagem de linhas
# de todas as tabelas com o banco de produção e apaga o banco temporário.
# Uso: scripts/restore-check.sh [arquivo.dump]   (padrão: o backup mais recente)
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/root/backups/campax}
file=${1:-$(ls -t "$BACKUP_DIR"/campax-*.dump | head -1)}
check_db=campax_restore_check

pg() { sudo -u postgres "$@"; }

counts() {
  pg psql -d "$1" -Atc "
    SELECT string_agg(relname || '=' ||
      (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.' || quote_ident(relname), false, true, '')))[1]::text,
      E'\n' ORDER BY relname)
    FROM pg_stat_user_tables WHERE schemaname = 'public'"
}

echo "→ Restaurando $file em $check_db"
pg dropdb --if-exists --force "$check_db"
pg createdb -O campax_local "$check_db"
trap 'pg dropdb --if-exists --force "$check_db"' EXIT
# O arquivo é do root; entra pelo stdin porque o pg_restore roda como postgres.
pg pg_restore --exit-on-error -d "$check_db" < "$file"

prod=$(counts campax)
restored=$(counts "$check_db")
echo "$restored"

# Diferenças são esperadas se houve escrita em produção depois do backup; o importante é o
# restore completar e as tabelas estarem todas lá com dados.
if [[ "$prod" == "$restored" ]]; then
  echo "✓ Restauração ok — contagens idênticas às de produção"
else
  echo "⚠ Restauração completou, mas as contagens diferem da produção (escritas após o backup?):"
  diff <(echo "$prod") <(echo "$restored") || true
fi
