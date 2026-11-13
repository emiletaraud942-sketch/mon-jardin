-- Scénarios des jardins partagés : droits par ligne, invitations, rôles, conflits, limites, comptes anonymes. Base JETABLE uniquement.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
\set D '''dddddddd-0000-4000-8000-000000000004'''
truncate auth.users cascade;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr'),(:D,'d@x.fr');

do $$
declare
  A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003'; D uuid:='dddddddd-0000-4000-8000-000000000004';
  r text; gid uuid; gid2 uuid; cd text; cd2 text; base1 text; base2 text; i int; res text;
begin
  -- ===== Avant tout : anon n'a rien =====
  perform t.expect('SG anon ne lit aucune table', t.as(null,'select count(*) from public.shared_gardens'), 'ERR 42501');
  perform t.expect('SG anon ne lit pas les plantes', t.as(null,'select count(*) from public.shared_plants'), 'ERR 42501');
  perform t.expect('SG anon ne crée pas de jardin', t.as(null,'select public.create_shared_garden(''X'', ''{}''::jsonb, ''Z'')'), 'ERR 42501');
  perform t.expect('SG anon ne rejoint pas', t.as(null,'select public.join_shared_garden(''ABCDEFGH'', ''Z'')'), 'ERR 42501');

  -- ===== A crée un jardin partagé =====
  r := t.as(A, 'select public.create_shared_garden(''Jardin des Bruyères'', ''{"name":"Bruyères","center":{"lon":1.1,"lat":49.4}}''::jsonb, ''Alice'')');
  perform t.expect('SG A crée un jardin partagé', r, 'OK ');
  gid := substr(r, 4)::uuid;
  perform t.expect('SG A est responsable', t.as(A,'select role from public.shared_garden_members where garden_id = '''||gid||''' and user_id = '''||A||''''), 'OK admin');
  perform t.expect('SG B (étranger) ne voit pas le jardin', t.as(B,'select count(*) from public.shared_gardens'), 'OK 0');
  perform t.expect('SG B ne voit pas les membres', t.as(B,'select count(*) from public.shared_garden_members'), 'OK 0');
  perform t.expect('SG B ne se glisse pas comme membre', t.as(B,'insert into public.shared_garden_members(garden_id,user_id,role,display_name) values ('''||gid||''','''||B||''',''admin'',''B'')'), 'ERR 42501');
  perform t.expect('SG B ne crée pas de jardin à la main', t.as(B,'insert into public.shared_gardens(name,garden) values (''X'',''{}'')'), 'ERR 42501');
  perform t.expect('SG B ne modifie pas le jardin', t.as(B,'update public.shared_gardens set name = ''Pris'' where id = '''||gid||''''), 'OK rows=0');
  perform t.expect('SG B n''écrit pas de plante chez A', t.as(B,'insert into public.shared_plants(garden_id,id,data) values ('''||gid||''',''p1'',''{}'')'), 'ERR 42501');
  perform t.expect('SG B ne crée pas d''invitation', t.as(B,'select public.create_shared_invite('''||gid||''')'), 'ERR 42501');
  perform t.expect('SG B ne supprime pas le jardin', t.as(B,'select public.delete_shared_garden('''||gid||''')'), 'ERR 42501');
  perform t.expect('SG B ne se donne pas de rôle', t.as(B,'select public.set_shared_role('''||gid||''','''||B||''',''admin'')'), 'ERR 42501');
  perform t.expect('SG nom trop long refusé', t.as(A,'select public.create_shared_garden('''||repeat('x',61)||''', ''{}''::jsonb, ''Alice'')'), 'ERR 23514');
  perform t.expect('SG nom d''affichage vide refusé', t.as(A,'select public.create_shared_garden(''Ok'', ''{}''::jsonb, '''')'), 'ERR 23514');
  perform t.expect('SG le jardin doit être un objet JSON', t.as(A,'select public.create_shared_garden(''Ok'', ''[1]''::jsonb, ''Alice'')'), 'ERR 23514');

  -- ===== Invitation =====
  r := t.as(A, 'select public.create_shared_invite('''||gid||''')');
  perform t.expect('SG A crée une invitation', r, 'OK ');
  cd := substr(r, 4);
  perform t.expect('SG le code a 8 caractères sans lettre ambiguë', 'OK ' || (cd ~ '^[A-HJ-NP-Z2-9]{8}$' and cd !~ '[ILO01]'), 'OK true');
  perform t.expect('SG A voit son invitation', t.as(A,'select count(*) from public.shared_garden_invites'), 'OK 1');
  perform t.expect('SG B ne voit aucune invitation', t.as(B,'select count(*) from public.shared_garden_invites'), 'OK 0');
  perform t.expect('SG B ne retire pas l''invitation', t.as(B,'delete from public.shared_garden_invites'), 'OK rows=0');
  perform t.expect('SG B n''écrit pas d''invitation à la main', t.as(B,'insert into public.shared_garden_invites(code,garden_id,expires_at) values (''AAAAAAAA'','''||gid||''', now() + interval ''1 day'')'), 'ERR 42501');
  perform t.expect('SG mauvais code refusé', t.as(B,'select public.join_shared_garden(''ZZZZZZZZ'', ''Bob'')'), 'ERR P0002');
  perform t.expect('SG code vide refusé', t.as(B,'select public.join_shared_garden('''', ''Bob'')'), 'ERR P0002');
  perform t.expect('SG code en minuscules et avec espaces accepté', t.as(B,'select public.join_shared_garden('''||lower(substr(cd,1,4))||' '||substr(cd,5)||''', ''Bob'')'), 'OK ');
  perform t.expect('SG B est membre (pas responsable)', t.as(B,'select role from public.shared_garden_members where garden_id = '''||gid||''' and user_id = '''||B||''''), 'OK member');
  perform t.expect('SG B voit le jardin', t.as(B,'select name from public.shared_gardens'), 'OK Jardin des Bruyères');
  perform t.expect('SG B voit les 2 membres', t.as(B,'select count(*) from public.shared_garden_members'), 'OK 2');
  perform t.expect('SG rejoindre deux fois ne double pas', t.as(B,'select public.join_shared_garden('''||cd||''', ''Bob'')'), 'OK ');
  perform t.expect('SG toujours 2 membres', t.as(A,'select count(*) from public.shared_garden_members'), 'OK 2');
  perform t.expect('SG l''invitation compte 1 utilisation', t.as(A,'select uses from public.shared_garden_invites'), 'OK 1');
  perform t.expect('SG B (membre) ne crée pas d''invitation', t.as(B,'select public.create_shared_invite('''||gid||''')'), 'ERR 42501');
  perform t.expect('SG B ne modifie pas le jardin (membre simple)', t.as(B,'update public.shared_gardens set name = ''Pris'' where id = '''||gid||''''), 'OK rows=0');
  perform t.expect('SG B ne retire pas A', t.as(B,'select public.remove_shared_member('''||gid||''','''||A||''')'), 'ERR 42501');
  perform t.expect('SG B ne se promeut pas', t.as(B,'select public.set_shared_role('''||gid||''','''||B||''',''admin'')'), 'ERR 42501');
  perform t.expect('SG B ne change pas le nom d''un autre', t.as(B,'update public.shared_garden_members set display_name = ''X'' where user_id = '''||A||''''), 'ERR 42501');
  perform t.expect('SG B change son nom via la fonction', t.as(B,'select public.rename_me_in_shared_garden('''||gid||''', ''Robert'')'), 'OK ');
  perform t.expect('SG le nom a changé', t.as(A,'select display_name from public.shared_garden_members where user_id = '''||B||''''), 'OK Robert');
  perform t.expect('SG C (étranger) ne rejoint pas sans code', t.as(C,'select count(*) from public.shared_gardens'), 'OK 0');

  -- ===== Plantes : ajout, modification, conflit, suppression douce =====
  res := t.as(A, 'select public.push_shared_plants('''||gid||''', ''[{"id":"p1","data":{"speciesId":"pommier","position":{"x":1,"y":2}},"deleted":false}]''::jsonb)');
  perform t.expect('SG A envoie une plante', res, 'OK {"ok": [{"id": "p1"');
  base1 := (select updated_at::text from public.shared_plants where garden_id = gid and id = 'p1');
  perform t.expect('SG l''auteur est A (le serveur décide)', 'OK ' || (select updated_by = A from public.shared_plants where id = 'p1'), 'OK true');
  perform t.expect('SG B lit la plante', t.as(B,'select id from public.shared_plants'), 'OK p1');
  perform t.expect('SG C ne lit pas la plante', t.as(C,'select count(*) from public.shared_plants'), 'OK 0');
  perform t.expect('SG renvoyer une plante « nouvelle » qui existe déjà = conflit', t.as(B,'select public.push_shared_plants('''||gid||''', ''[{"id":"p1","data":{"speciesId":"x"},"deleted":false}]''::jsonb)'), 'OK {"ok": [], "conflicts": ["p1"]}');
  res := t.as(B, 'select public.push_shared_plants('''||gid||''', ''[{"id":"p1","base":"'||base1||'","data":{"speciesId":"pommier","position":{"x":3,"y":4}},"deleted":false}]''::jsonb)');
  perform t.expect('SG B modifie la plante avec la bonne base', res, 'OK {"ok": [{"id": "p1"');
  perform t.expect('SG la modification est au nom de B', 'OK ' || (select updated_by = B from public.shared_plants where id = 'p1'), 'OK true');
  perform t.expect('SG A, resté sur l''ancienne base, est refusé (conflit)', t.as(A,'select public.push_shared_plants('''||gid||''', ''[{"id":"p1","base":"'||base1||'","data":{"speciesId":"pommier","position":{"x":9,"y":9}},"deleted":false}]''::jsonb)'), 'OK {"ok": [], "conflicts": ["p1"]}');
  perform t.expect('SG la version de B est restée', t.as(A,'select data->''position''->>''x'' from public.shared_plants where id = ''p1'''), 'OK 3');
  base2 := (select updated_at::text from public.shared_plants where garden_id = gid and id = 'p1');
  perform t.expect('SG suppression douce par un membre', t.as(A,'select public.push_shared_plants('''||gid||''', ''[{"id":"p1","base":"'||base2||'","data":{},"deleted":true}]''::jsonb)'), 'OK {"ok": [{"id": "p1"');
  perform t.expect('SG la ligne reste, marquée supprimée', t.as(B,'select deleted from public.shared_plants where id = ''p1'''), 'OK true');
  perform t.expect('SG aucune suppression dure par un membre', t.as(B,'delete from public.shared_plants'), 'ERR 42501');
  perform t.expect('SG B ne déplace pas une plante vers un autre jardin', t.as(B,'update public.shared_plants set garden_id = gen_random_uuid() where id = ''p1'''), 'ERR 42501');
  perform t.expect('SG B ne change pas l''heure à la main', t.as(B,'update public.shared_plants set updated_at = ''2000-01-01'' where id = ''p1'''), 'ERR 42501');
  perform t.expect('SG envoi de plus de 100 plantes refusé', t.as(A,'select public.push_shared_plants('''||gid||''', (select jsonb_agg(jsonb_build_object(''id'',''x''||g,''data'',''{}''::jsonb)) from generate_series(1,101) g))'), 'ERR 22023');
  perform t.expect('SG plante trop grosse refusée', t.as(A,'select public.push_shared_plants('''||gid||''', jsonb_build_array(jsonb_build_object(''id'',''gros'',''data'',jsonb_build_object(''notes'',repeat(''x'',25000)))))'), 'ERR 23514');
  perform t.expect('SG identifiant trop long refusé', t.as(A,'select public.push_shared_plants('''||gid||''', jsonb_build_array(jsonb_build_object(''id'',repeat(''i'',65),''data'',''{}''::jsonb)))'), 'ERR 23514');

  -- ===== Plafond de 500 plantes =====
  perform t.as(A, 'select public.push_shared_plants('''||gid||''', (select jsonb_agg(jsonb_build_object(''id'',''n''||g,''data'',''{}''::jsonb)) from generate_series(1,99) g))');
  for i in 0..3 loop
    perform t.as(A, 'select public.push_shared_plants('''||gid||''', (select jsonb_agg(jsonb_build_object(''id'',''m''||'||i||'||''_''||g,''data'',''{}''::jsonb)) from generate_series(1,100) g))');
  end loop;
  perform t.expect('SG le jardin compte 500 plantes', t.as(A,'select count(*) from public.shared_plants'), 'OK 500');
  perform t.expect('SG la 501e est refusée', t.as(A,'select public.push_shared_plants('''||gid||''', ''[{"id":"trop","data":{}}]''::jsonb)'), 'ERR 23514');

  -- ===== Responsable : membres, rôles, quitter =====
  perform t.expect('SG A promeut B', t.as(A,'select public.set_shared_role('''||gid||''','''||B||''',''admin'')'), 'OK ');
  perform t.expect('SG rôle inconnu refusé', t.as(A,'select public.set_shared_role('''||gid||''','''||B||''',''roi'')'), 'ERR 22023');
  perform t.expect('SG B (responsable) crée une invitation', t.as(B,'select public.create_shared_invite('''||gid||''')'), 'OK ');
  perform t.expect('SG A ne se retire pas lui-même (il « quitte »)', t.as(A,'select public.remove_shared_member('''||gid||''','''||A||''')'), 'ERR 23514');
  perform t.expect('SG A quitte', t.as(A,'select public.leave_shared_garden('''||gid||''')'), 'OK ');
  perform t.expect('SG A ne voit plus rien', t.as(A,'select count(*) from public.shared_plants'), 'OK 0');
  perform t.expect('SG B reste responsable', t.as(B,'select role from public.shared_garden_members where user_id = '''||B||''''), 'OK admin');
  -- Le dernier responsable qui part laisse la place au plus ancien membre.
  perform t.as(B,'select public.join_shared_garden('''||(select i.code from public.shared_garden_invites i limit 1)||''', ''Bob'')');
  r := t.as(B, 'select public.create_shared_invite('''||gid||''')');
  cd2 := substr(r,4);
  perform t.expect('SG C rejoint avec un code de B', t.as(C,'select public.join_shared_garden('''||cd2||''', ''Carole'')'), 'OK ');
  perform t.expect('SG B quitte : C devient responsable', t.as(B,'select public.leave_shared_garden('''||gid||''')'), 'OK ');
  perform t.expect('SG C est responsable', t.as(C,'select role from public.shared_garden_members where user_id = '''||C||''''), 'OK admin');
  perform t.expect('SG C retire quelqu''un qui n''est pas là sans erreur', t.as(C,'select public.remove_shared_member('''||gid||''','''||D||''')'), 'OK ');

  -- ===== Codes : expiration, utilisations, retrait =====
  r := t.as(C, 'select public.create_shared_invite('''||gid||''')'); cd := substr(r,4);
    update public.shared_garden_invites set expires_at = now() - interval '1 minute';
  perform t.expect('SG code périmé refusé', t.as(D,'select public.join_shared_garden('''||cd||''', ''Denis'')'), 'ERR P0002');
  r := t.as(C, 'select public.create_shared_invite('''||gid||''')'); cd := substr(r,4);
  update public.shared_garden_invites set uses = max_uses where code = cd;
  perform t.expect('SG code épuisé refusé', t.as(D,'select public.join_shared_garden('''||cd||''', ''Denis'')'), 'ERR P0002');
  r := t.as(C, 'select public.create_shared_invite('''||gid||''')'); cd := substr(r,4);
  perform t.expect('SG C retire l''invitation', t.as(C,'delete from public.shared_garden_invites where code = '''||cd||''''), 'OK rows=1');
  perform t.expect('SG code retiré refusé', t.as(D,'select public.join_shared_garden('''||cd||''', ''Denis'')'), 'ERR P0002');

  -- ===== Compte anonyme =====
  r := t.as(C, 'select public.create_shared_invite('''||gid||''')'); cd := substr(r,4);
  perform set_config('request.jwt.claims', '{"is_anonymous": true}', true);
  perform t.expect('SG compte anonyme : pas de création', t.as(D,'select public.create_shared_garden(''Ok'', ''{}''::jsonb, ''Denis'')'), 'ERR 28000');
  perform t.expect('SG compte anonyme : ne rejoint pas', t.as(D,'select public.join_shared_garden('''||cd||''', ''Denis'')'), 'ERR 28000');
  perform set_config('request.jwt.claims', '', true);

  -- ===== Limites =====
  update public.shared_garden_invites set max_uses = 50 where code = cd;
  for i in 1..30 loop
    insert into auth.users(id,email) values (gen_random_uuid(), 'u'||i||'@x.fr');
  end loop;
  for i in 1..30 loop
    select id into D from auth.users where email = 'u'||i||'@x.fr';
    res := t.as(D, 'select public.join_shared_garden('''||cd||''', ''U'||i||''')');
    exit when res like 'ERR%';
  end loop;
  perform t.expect('SG 20 membres au plus', t.as(C,'select count(*) from public.shared_garden_members where garden_id = '''||gid||''''), 'OK 20');
  perform t.expect('SG le 21e est refusé', res, 'ERR 23514');

  -- ===== Suppression du jardin et des comptes =====
  perform t.expect('SG C supprime le jardin partagé', t.as(C,'select public.delete_shared_garden('''||gid||''')'), 'OK ');
  perform t.expect('SG plus aucune plante en ligne', 'OK ' || (select count(*) from public.shared_plants), 'OK 0');
  perform t.expect('SG plus aucune invitation', 'OK ' || (select count(*) from public.shared_garden_invites), 'OK 0');
  r := t.as(A, 'select public.create_shared_garden(''Solo'', ''{}''::jsonb, ''Alice'')'); gid2 := substr(r,4)::uuid;
  delete from auth.users where id = A;
  perform t.expect('SG le compte supprimé emporte son jardin sans membre', 'OK ' || (select count(*) from public.shared_gardens where id = gid2), 'OK 0');
  for i in 1..11 loop
    r := t.as(B, 'select public.create_shared_garden(''J'||i||''', ''{}''::jsonb, ''Bob'')');
    exit when r like 'ERR%';
  end loop;
  perform t.expect('SG 10 jardins partagés au plus par personne', r, 'ERR 23514');

  -- ===== Fonctions : rien pour anon ni le public =====
  perform t.expect('SG aucune fonction d''écriture ouverte à anon',
    'OK ' || (select count(*) from information_schema.routine_privileges where grantee in ('anon','PUBLIC') and routine_schema = 'public' and routine_name like '%shared%'), 'OK 0');
  perform t.expect('SG aucune table ouverte à anon',
    'OK ' || (select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_name like 'shared_%'), 'OK 0');
  perform t.expect('SG le schéma privé n''est pas ouvert à anon', 'OK ' || has_schema_privilege('anon','shared_private','usage'), 'OK false');
end $$;
