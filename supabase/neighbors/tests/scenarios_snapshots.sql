-- Synchro privée (supabase/migrations) : garden_snapshots refuse les comptes anonymes (20261027010000_snapshots_no_anon.sql).
-- Base JETABLE uniquement. Les jetons sont simulés par request.jwt.claims (comme PostgREST le fait), le rôle reste « authenticated ».
truncate auth.users cascade;
create or replace function t.u(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000008' || lpad(n::text, 2, '0'))::uuid $$;
insert into auth.users(id, email) select t.u(n), 'u' || n || '@x.fr' from generate_series(1, 6) n;
create or replace function t.claims(c text) returns void language sql as $$ select set_config('request.jwt.claims', c, false) $$;
create or replace function t.snap(n int) returns text language sql as $$
  select format('insert into public.garden_snapshots(user_id,data) values (%L, ''{"jardins":[1]}'')', t.u(n)) $$;

do $$
begin
 -- Compte normal (jeton de lien magique : is_anonymous false).
 perform t.claims('{"is_anonymous": false}');
 perform t.expect('G1 compte normal : crée son instantané', t.as(t.u(1), t.snap(1)), 'OK rows=1');
 perform t.expect('G1 ... le relit', t.as(t.u(1), 'select count(*) from public.garden_snapshots'), 'OK 1');
 perform t.expect('G1 ... le met à jour', t.as(t.u(1), 'update public.garden_snapshots set data = ''{"jardins":[2]}'''), 'OK rows=1');
 -- Jeton sans la clé is_anonymous (anciens jetons, tests) : traité comme non anonyme.
 perform t.claims('{}');
 perform t.expect('G2 jeton sans is_anonymous : crée son instantané', t.as(t.u(2), t.snap(2)), 'OK rows=1');
 perform t.claims('');
 perform t.expect('G2 aucun jeton lisible (claims vides) : accepté comme non anonyme, rôle authenticated', t.as(t.u(3), t.snap(3)), 'OK rows=1');

 -- Compte anonyme.
 perform t.claims('{"is_anonymous": true}');
 perform t.expect('G3 compte anonyme : création refusée', t.as(t.u(4), t.snap(4)), 'ERR 42501');
 perform t.expect('G3 ... aucune ligne créée', (select 'OK '||count(*) from public.garden_snapshots where user_id = t.u(4)), 'OK 0');
 perform t.expect('G3 ... anonyme : ne lit rien (même pas la ligne d''un autre)', t.as(t.u(4), 'select count(*) from public.garden_snapshots'), 'OK 0');
 perform t.expect('G3 ... ne lit pas l''instantané de u1', t.as(t.u(4), format('select count(*) from public.garden_snapshots where user_id = %L', t.u(1))), 'OK 0');
 perform t.expect('G3 ... ne peut pas se réaffecter celui de u1', t.as(t.u(4), format('update public.garden_snapshots set user_id = %L', t.u(4))), 'OK rows=0');
 -- Une ligne antérieure d'un compte devenu anonyme (ou créée avant la règle) : ni lecture ni écriture, mais effaçable.
 perform set_config('request.jwt.claim.sub', '', true);
 insert into public.garden_snapshots(user_id, data) values (t.u(5), '{"ancien":true}');
 perform t.claims('{"is_anonymous": true}');
 perform t.expect('G4 ligne antérieure d''un anonyme : non lisible', t.as(t.u(5), 'select count(*) from public.garden_snapshots'), 'OK 0');
 perform t.expect('G4 ... non modifiable', t.as(t.u(5), 'update public.garden_snapshots set data = ''{"x":1}'''), 'OK rows=0');
 perform t.expect('G4 ... mais effaçable (droit à l''effacement)', t.as(t.u(5), 'delete from public.garden_snapshots'), 'OK rows=1');
 perform t.expect('G4 ... effacée', (select 'OK '||count(*) from public.garden_snapshots where user_id = t.u(5)), 'OK 0');

 -- Valeurs étranges du claim : seule la chaîne « false » (ou l'absence) passe.
 perform t.claims('{"is_anonymous": "yes"}');
 perform t.expect('G5 is_anonymous = "yes" : refusé', t.as(t.u(6), t.snap(6)), 'ERR 42501');
 perform t.claims('{"is_anonymous": 1}');
 perform t.expect('G5 is_anonymous = 1 : refusé', t.as(t.u(6), t.snap(6)), 'ERR 42501');
 perform t.claims('{"is_anonymous": "true"}');
 perform t.expect('G5 is_anonymous = "true" : refusé', t.as(t.u(6), t.snap(6)), 'ERR 42501');
 perform t.claims('{"is_anonymous": null}');
 perform t.expect('G5 is_anonymous = null : traité comme absent', t.as(t.u(6), t.snap(6)), 'OK rows=1');

 -- Les règles d'avant restent vraies.
 perform t.claims('{"is_anonymous": false}');
 perform t.expect('G6 un compte normal ne lit pas l''instantané d''un autre', t.as(t.u(2), 'select count(*) from public.garden_snapshots where user_id <> '||quote_literal(t.u(2))), 'OK 0');
 perform t.expect('G6 ... ne crée pas pour un autre', t.as(t.u(2), format('insert into public.garden_snapshots(user_id,data) values (%L,''{}'')', t.u(5))), 'ERR 42501');
 perform t.expect('G6 ... ne modifie pas celui d''un autre', t.as(t.u(2), format('update public.garden_snapshots set data = ''{}'' where user_id = %L', t.u(1))), 'OK rows=0');
 perform t.expect('G6 ... ne supprime pas celui d''un autre', t.as(t.u(2), format('delete from public.garden_snapshots where user_id = %L', t.u(1))), 'OK rows=0');
 perform t.expect('G6 anon (non connecté) : rien', t.as(null, 'select count(*) from public.garden_snapshots'), 'ERR 42501');
 perform t.expect('G6 tableau JSON refusé (contrainte d''avant)', t.as(t.u(1), 'update public.garden_snapshots set data = ''[1]'''), 'ERR 23514');
 perform t.expect('G6 les 4 politiques existent, une seule fois chacune', (select 'OK '||count(*) from pg_policies where tablename = 'garden_snapshots'), 'OK 4');
 perform t.expect('G6 lecture/création/mise à jour exigent un jeton non anonyme',
   (select 'OK '||count(*) from pg_policies where tablename = 'garden_snapshots' and cmd in ('SELECT','INSERT','UPDATE') and coalesce(qual,'')||coalesce(with_check,'') like '%is_anonymous%'), 'OK 3');
 perform t.claims('');
end $$;
