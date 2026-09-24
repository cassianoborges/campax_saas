#!/usr/bin/env bash
# Recria os bancos de desenvolvimento/teste.
#
#   campax_dev  — cópia completa do `campax` (schema + dados) + os scripts de prisma/sql/ que o
#                 `campax` ainda não tiver aplicado (registrados em `schema_scripts`)
#   campax_test — só o schema do campax_dev (inclui triggers, funções e o schema `extensions`, que o
#                 `prisma db push` não recria); usado pelo Vitest, que trunca as tabelas
#
# Uso (como root, precisa do superusuário `postgres`):
#   backend/scripts/refresh-dev-db.sh dev|test|all
#
# Parâmetros da empresa inicial para o 001_multiempresa.sql (padrões de desenvolvimento):
#   EMPRESA_NOME, EMPRESA_NOME_EXIBICAO, EMPRESA_SLUG, HASH_PUBLICO (padrão: o hash público original desta
#   instalação, antes em VITE_EMPRESA_HASH — os links de sala já distribuídos usam esse prefixo)
set -euo pipefail

SOURCE_DB=campax
OWNER=campax_local
BACKEND_DIR=$(cd "$(dirname "$0")/.." && pwd)
SQL_DIR="$BACKEND_DIR/prisma/sql"

EMPRESA_NOME=${EMPRESA_NOME:-Campax}
EMPRESA_NOME_EXIBICAO=${EMPRESA_NOME_EXIBICAO:-$EMPRESA_NOME}
EMPRESA_SLUG=${EMPRESA_SLUG:-campax}
HASH_PUBLICO=${HASH_PUBLICO:-d2788b07}

pg() { sudo -u postgres "$@"; }

guard() {
  if [[ "$1" == "$SOURCE_DB" ]]; then
    echo "Recusando: o alvo não pode ser o banco $SOURCE_DB." >&2
    exit 1
  fi
}

recreate_from() {
  local source=$1 target=$2 dump_flags=$3
  guard "$target"
  echo "→ Recriando $target a partir de $source ${dump_flags:-(schema + dados)}"
  pg dropdb --if-exists --force "$target"
  pg createdb -O "$OWNER" "$target"
  # shellcheck disable=SC2086
  pg pg_dump $dump_flags "$source" | pg psql -q -v ON_ERROR_STOP=1 -d "$target" >/dev/null
}

# Aplica, em ordem, os scripts de prisma/sql/ ainda não registrados em schema_scripts.
apply_pending_sql() {
  local target=$1 file name applied
  guard "$target"
  for file in "$SQL_DIR"/*.sql; do
    [[ -e "$file" ]] || continue
    name=$(basename "$file" .sql)
    applied=$(pg psql -d "$target" -Atc \
      "SELECT 1 FROM pg_tables WHERE tablename = 'schema_scripts' AND EXISTS (SELECT 1 FROM schema_scripts WHERE name = '$name')" 2>/dev/null || true)
    if [[ "$applied" == "1" ]]; then
      echo "  · $name já aplicado"
      continue
    fi
    echo "  → aplicando $name"
    # SET ROLE: os objetos criados ficam com o mesmo dono das tabelas existentes.
    pg psql -q -d "$target" -v ON_ERROR_STOP=1 -c "SET ROLE $OWNER" \
      -v empresa_nome="$EMPRESA_NOME" -v empresa_nome_exibicao="$EMPRESA_NOME_EXIBICAO" \
      -v empresa_slug="$EMPRESA_SLUG" -v hash_publico="$HASH_PUBLICO" \
      -f - < "$file" >/dev/null  # stdin: o postgres não lê arquivos em /root
  done
}

refresh_dev() {
  recreate_from "$SOURCE_DB" campax_dev ""
  apply_pending_sql campax_dev
  echo "✓ campax_dev pronto"
}

refresh_test() {
  recreate_from campax_dev campax_test "--schema-only"
  echo "✓ campax_test pronto"
}

case "${1:-}" in
  dev)  refresh_dev ;;
  test) refresh_test ;;
  all)  refresh_dev; refresh_test ;;
  *)    echo "Uso: $0 dev|test|all" >&2; exit 1 ;;
esac
