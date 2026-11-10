#!/bin/bash
# PROJET PARTAGÉ : applique d'abord les migrations de la SYNCHRO (supabase/migrations), puis celles de l'entraide, puis tous les scénarios
# de l'entraide ET scenarios_shared.sql (étanchéité des deux mondes). Sur un Postgres JETABLE.
# Usage : PGHOST=... PGPORT=... PGUSER=postgres ./run.sh   (crée puis supprime la base « shared_test »)
# Code de sortie 1 si une ligne FAIL apparaît. Ne jamais pointer vers une vraie base.
set -u
cd "$(dirname "$0")"
MIG=../migrations/20261023000000_neighbors.sql
MIG2=../migrations/20261025000000_neighbors_v2.sql
MIG3=../migrations/20261025010000_neighbors_v3_read.sql
MIG4=../migrations/20261025020000_neighbors_v4_events.sql
MIG5=../migrations/20261025030000_neighbors_v5_push.sql
MIG6=../migrations/20261025040000_neighbors_v6_cell_size.sql
MIG7=../migrations/20261027000000_neighbors_v7_hardening.sql
MIG8=../migrations/20261029000000_neighbors_v8_gardens.sql
MIG9=../migrations/20261104000000_neighbors_v9_hardening2.sql
MIG10=../migrations/20261110000000_neighbors_v10_public_events.sql
export PGDATABASE=postgres
psql -q -c 'drop database if exists shared_test' -c 'create database shared_test' || exit 2
export PGDATABASE=shared_test
OUT=$(mktemp)
PRE=$(mktemp); POST=$(mktemp)
# Politiques (public et storage) normalisées : le nom du schéma des fonctions d'aide est retiré pour comparer avant/après la v9.
dump_policies() {
  psql -At -c "select schemaname||'.'||tablename||' | '||policyname||' | '||permissive||' | '||cmd||' | '||roles::text||' | '||coalesce(qual,'')||' | '||coalesce(with_check,'') from pg_policies where schemaname in ('public','storage') order by 1" \
    | sed -e 's/neighbors_private\.//g' -e 's/public\.//g'
}
{
  psql -q -v ON_ERROR_STOP=1 -f stub.sql &&
  for f in ../../migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -f "$f" || exit 1; done &&   # la synchro d'abord
  psql -q -v ON_ERROR_STOP=1 -f "$MIG" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG2" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG3" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG4" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG5" &&
  psql -q -v ON_ERROR_STOP=1 -f harness.sql &&
  psql -q -v ON_ERROR_STOP=1 -f v6_legacy_seed.sql &&   # données d'avant la v6 (cellules de 0,01°), puis migration v6 deux fois
  psql -q -v ON_ERROR_STOP=1 -f "$MIG6" &&
  psql -q -v pass=1 -f scenarios_v6_migration.sql &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG6" &&
  psql -q -v pass=2 -f scenarios_v6_migration.sql &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG7" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG8" &&
  dump_policies >"$PRE" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG9" &&   # v9 juste après la v8, puis rejeu de tout, puis v9 de nouveau en dernier
  psql -q -v ON_ERROR_STOP=1 -f "$MIG" &&   # idempotence : deuxième application de chaque fichier
  psql -q -v ON_ERROR_STOP=1 -f "$MIG2" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG3" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG4" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG5" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG6" &&   # v6 puis v7 en dernier : un ancien fichier rejoué remet l'ancien arrondi ou l'ancien déclencheur
  psql -q -v ON_ERROR_STOP=1 -f "$MIG7" &&
  psql -q -v ON_ERROR_STOP=1 -f "$MIG8" &&   # v8 : elle remplace neighbors_can_contact et profiles_select de la v1
  psql -q -v ON_ERROR_STOP=1 -f "$MIG9" &&   # v9 TOUT À LA FIN : elle remet les fonctions d'aide dans neighbors_private et ré-écrase les anciennes versions rejouées
  psql -q -v ON_ERROR_STOP=1 -f "$MIG9" &&   # et elle est elle-même rejouable
  psql -q -v ON_ERROR_STOP=1 -f "$MIG10" &&  # v10 (liste publique d'événements), puis rejouée
  psql -q -v ON_ERROR_STOP=1 -f "$MIG10" &&
  dump_policies >"$POST" &&
  { if diff -q "$PRE" "$POST" >/dev/null; then echo "NOTICE:  PASS  V9 politiques RLS identiques avant/après hors nom de schéma ($(wc -l <"$PRE") politiques)"; else echo "NOTICE:  FAIL  V9 politiques RLS différentes après la v9"; diff "$PRE" "$POST"; fi; } &&
  psql -q -f scenarios.sql &&
  psql -q -f scenarios_audit.sql &&
  psql -q -f scenarios_v2.sql &&
  psql -q -f scenarios_v3.sql &&
  psql -q -f scenarios_v4.sql &&
  psql -q -f scenarios_v5.sql &&
  psql -q -f scenarios_v6.sql &&
  psql -q -f scenarios_v7.sql &&
  psql -q -f scenarios_v8.sql &&
  psql -q -f scenarios_v9.sql &&
  psql -q -f scenarios_v10.sql &&
  psql -q -f scenarios_shared.sql
} >"$OUT" 2>&1
grep -E "PASS|FAIL|ERROR" "$OUT" | sed 's/^psql:[^ ]* //'
FAILS=$(grep -c "FAIL\|ERROR" "$OUT"); PASSES=$(grep -c "PASS" "$OUT")
echo "== $PASSES PASS, $FAILS FAIL/ERROR"
PGDATABASE=postgres psql -q -c 'drop database shared_test'
rm -f "$OUT" "$PRE" "$POST"
[ "$FAILS" -eq 0 ]
