#!/bin/bash
# Rejoue la migration des jardins partagés (deux fois) et les scénarios hostiles sur un Postgres JETABLE.
# Usage : PGHOST=... PGPORT=... PGUSER=postgres ./run.sh   (crée puis supprime la base « shared_test »)
# Code de sortie 1 si une ligne FAIL apparaît. Ne jamais pointer vers une vraie base.
set -u
cd "$(dirname "$0")"
NEIGH=../../neighbors/tests
MIG=../../migrations/20261113000000_shared_gardens.sql
export PGDATABASE=postgres
psql -q -c 'drop database if exists shared_test' -c 'create database shared_test' || exit 2
export PGDATABASE=shared_test
OUT=$(mktemp)
{
  psql -q -v ON_ERROR_STOP=1 -f "$NEIGH/stub.sql" &&
  psql -q -v ON_ERROR_STOP=1 -f "$NEIGH/harness.sql" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG" &&   # idempotence : deuxième application
  psql -q -f scenarios.sql
} >"$OUT" 2>&1
grep -E "PASS|FAIL|ERROR" "$OUT" | sed 's/^psql:[^ ]* //'
FAILS=$(grep -c "FAIL\|ERROR" "$OUT"); PASSES=$(grep -c "PASS" "$OUT")
echo "== $PASSES PASS, $FAILS FAIL/ERROR"
PGDATABASE=postgres psql -q -c 'drop database shared_test'
rm -f "$OUT"
[ "$FAILS" -eq 0 ]
