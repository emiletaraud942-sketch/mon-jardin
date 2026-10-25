#!/bin/bash
# Rejoue la migration d'entraide (deux fois) et les scénarios hostiles sur un Postgres JETABLE.
# Usage : PGHOST=... PGPORT=... PGUSER=postgres ./run.sh   (crée puis supprime la base « neighbors_test »)
# Code de sortie 1 si une ligne FAIL apparaît. Ne jamais pointer vers une vraie base.
set -u
cd "$(dirname "$0")"
MIG=../migrations/20261023000000_neighbors.sql
MIG2=../migrations/20261025000000_neighbors_v2.sql
MIG3=../migrations/20261025010000_neighbors_v3_read.sql
export PGDATABASE=postgres
psql -q -c 'drop database if exists neighbors_test' -c 'create database neighbors_test' || exit 2
export PGDATABASE=neighbors_test
OUT=$(mktemp)
{
  psql -q -v ON_ERROR_STOP=1 -f stub.sql &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG2" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG3" &&
  psql -q -v ON_ERROR_STOP=1 -f harness.sql &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG" &&   # idempotence : deuxième application de chaque fichier
  psql -q -v ON_ERROR_STOP=1 -f "$MIG2" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG3" &&
  psql -q -f scenarios.sql &&
  psql -q -f scenarios_audit.sql &&
  psql -q -f scenarios_v2.sql &&
  psql -q -f scenarios_v3.sql
} >"$OUT" 2>&1
grep -E "PASS|FAIL|ERROR" "$OUT" | sed 's/^psql:[^ ]* //'
FAILS=$(grep -c "FAIL\|ERROR" "$OUT"); PASSES=$(grep -c "PASS" "$OUT")
echo "== $PASSES PASS, $FAILS FAIL/ERROR"
PGDATABASE=postgres psql -q -c 'drop database neighbors_test'
rm -f "$OUT"
[ "$FAILS" -eq 0 ]
