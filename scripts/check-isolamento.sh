#!/usr/bin/env bash
# Roda backend/scripts/check-isolamento.sql num banco (padrão: campax) e falha (exit 1) se alguma
# checagem encontrar problema. Semanal via /etc/cron.d/campax-check-isolamento; log em logs/check-isolamento.log.
# Uso: scripts/check-isolamento.sh [banco]
set -euo pipefail

DB=${1:-campax}
SQL="$(dirname "$0")/../backend/scripts/check-isolamento.sql"

result=$(sudo -u postgres psql -d "$DB" -At -F ' | ' -v ON_ERROR_STOP=1 < "$SQL")
echo "$(date -u +%FT%TZ) verificação de isolamento em $DB"
echo "$result" | sed 's/^/  /'

if echo "$result" | awk -F ' [|] ' '$2 > 0 { found = 1 } END { exit !found }'; then
  echo "✗ PROBLEMAS ENCONTRADOS — investigar antes de qualquer outra coisa"
  exit 1
fi
echo "✓ nenhum problema"
