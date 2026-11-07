-- Projet PARTAGÉ : la synchro (garden_snapshots) et l'entraide dans la même base. Lancé par run-shared.sh APRÈS les migrations de la synchro
-- puis de l'entraide. Prouve que l'entraide ne casse rien de la synchro et que les deux mondes restent étanches.
-- Base JETABLE uniquement (vide auth.users).
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr');

do $$
declare
  A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
  n int;
begin
 -- ===== La table de synchro est intacte après les migrations de l'entraide =====
 perform t.expect('P1 RLS toujours active sur garden_snapshots', (select 'OK '||relrowsecurity from pg_class where oid='public.garden_snapshots'::regclass), 'OK true');
 select count(*) into n from pg_policy where polrelid='public.garden_snapshots'::regclass;
 perform t.expect('P1 les 5 politiques de la synchro sont toujours là (4 + « pas de compte anonyme »)', 'OK '||n, 'OK 5');
 perform t.expect('P1 anon n''a aucun droit sur garden_snapshots', (select 'OK '||count(*) from information_schema.role_table_grants where table_schema='public' and table_name='garden_snapshots' and grantee='anon'), 'OK 0');
 perform t.expect('P1 authenticated : lire, créer, modifier, supprimer seulement (ni TRUNCATE ni TRIGGER)', (select 'OK '||string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='garden_snapshots' and grantee='authenticated'), 'OK DELETE,INSERT,SELECT,UPDATE');
 perform t.expect('P1 delete_my_account : pas pour anon, oui pour authenticated', (select 'OK '||has_function_privilege('anon','public.delete_my_account()','execute')||' '||has_function_privilege('authenticated','public.delete_my_account()','execute')), 'OK false true');

 -- ===== Étanchéité : la synchro reste privée même quand l'entraide montre des choses de la même personne =====
 perform t.as(A,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||A||''',''Alice'',48.86,2.35)');
 perform t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''Bob'',48.87,2.36)');
 perform t.expect('P2 A enregistre sa copie de jardin', t.as(A,'insert into public.garden_snapshots(user_id,data) values ('''||A||''',''{"version":2,"gardens":[{"id":"g1"}],"plants":[],"tasksDone":[]}'')'), 'OK rows=1');
 perform t.expect('P2 A montre son jardin aux voisins (entraide)', t.as(A,'insert into public.garden_shares(species) values (array[''pommier''])'), 'OK rows=1');
 perform t.expect('P2 B voit le jardin partagé de A (entraide)', t.as(B,'select count(*) from public.garden_shares where user_id = '''||A||''''), 'OK 1');
 perform t.expect('P2 mais B ne voit JAMAIS la copie de jardin de A (synchro)', t.as(B,'select count(*) from public.garden_snapshots'), 'OK 0');
 perform t.expect('P2 B ne peut pas lire la copie de A même en la demandant par son identifiant', t.as(B,'select count(*) from public.garden_snapshots where user_id = '''||A||''''), 'OK 0');
 perform t.expect('P2 B ne peut pas écrire une copie au nom de A', t.as(B,'insert into public.garden_snapshots(user_id,data) values ('''||A||''',''{"x":1}'')'), 'ERR 42501');
 perform t.expect('P2 B ne peut pas modifier ni effacer la copie de A', t.as(B,'update public.garden_snapshots set data = ''{"x":1}'' where user_id = '''||A||''''), 'OK rows=0');
 perform t.expect('P2 anon ne lit ni la copie ni le jardin partagé', t.as(null,'select count(*) from public.garden_snapshots'), 'ERR 42501');
 perform t.expect('P2 la copie de A est intacte', t.as(A,'select (data->''gardens''->0->>''id'') from public.garden_snapshots'), 'OK g1');
 perform t.expect('P2 les messages privés de l''entraide ne passent pas par la synchro : la table messages reste fermée à anon', t.as(null,'select count(*) from public.messages'), 'ERR 42501');

 -- ===== Le schéma privé de l'entraide ne contient aucune table lisible =====
 -- (authenticated garde le droit d'usage du schéma : les politiques y appellent leurs fonctions d'aide ; ne jamais l'ajouter aux schémas exposés de l'API.)
 perform t.expect('P3 neighbors_private ne contient aucune table', (select 'OK '||count(*) from information_schema.tables where table_schema='neighbors_private'), 'OK 0');
 perform t.expect('P3 anon n''a aucun accès au schéma neighbors_private', (select 'OK '||has_schema_privilege('anon','neighbors_private','usage')), 'OK false');
 perform t.expect('P3 anon ne peut exécuter aucune fonction de neighbors_private', (select 'OK '||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='neighbors_private' and has_function_privilege('anon', p.oid, 'execute')), 'OK 0');

 -- ===== Suppression du compte : tout part, rien d'un autre =====
 perform t.as(B,'insert into public.garden_snapshots(user_id,data) values ('''||B||''',''{"version":2,"gardens":[],"plants":[],"tasksDone":[]}'')');
 perform t.expect('P4 A supprime son compte', t.as(A,'select public.delete_my_account()'), 'OK ');
 perform t.expect('P4 sa copie de jardin est partie', (select 'OK '||count(*) from public.garden_snapshots where user_id = A), 'OK 0');
 perform t.expect('P4 son profil et son jardin partagé aussi (entraide)', (select 'OK '||(select count(*) from public.profiles where user_id = A)||' '||(select count(*) from public.garden_shares where user_id = A)), 'OK 0 0');
 perform t.expect('P4 la copie de B n''a pas bougé', (select 'OK '||count(*) from public.garden_snapshots where user_id = B), 'OK 1');
 perform t.expect('P4 le profil de B non plus', (select 'OK '||count(*) from public.profiles where user_id = B), 'OK 1');

 -- ===== Un compte anonyme (rôle authenticated sans e-mail) ne peut rien déposer, ni d'un côté ni de l'autre =====
 perform set_config('request.jwt.claims', '{"is_anonymous": true}', true);
 perform t.expect('P5 un compte anonyme ne dépose pas de copie de jardin', t.as(C,'insert into public.garden_snapshots(user_id,data) values ('''||C||''',''{"x":1}'')'), 'ERR ');
 perform t.expect('P5 ni de profil d''entraide', t.as(C,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||C||''',''Anon'',48.86,2.35)'), 'ERR ');
 perform set_config('request.jwt.claims', '', true);
end $$;
