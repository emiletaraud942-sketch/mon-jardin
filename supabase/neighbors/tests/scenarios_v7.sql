-- Scénarios de la version 7 : changement de zone limité à 1 fois par semaine, textes sans caractères de contrôle ni invisibles.
-- Base JETABLE uniquement. Lancé par run.sh en dernier.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr');

do $$
declare
  A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
  ins text := 'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.86,2.34)';
begin
 perform t.as(A, format(ins, A, 'Alice'));
 perform t.as(B, format(ins, B, 'Bob'));
 perform t.as(C, format(ins, C, 'Carole'));

 -- ===== Première journée : corrections libres (dans la limite du quota de 5 modifications) =====
 perform t.expect('V7 A (profil du jour) change de zone', t.as(A, 'update public.profiles set cell_lat = 45.76, cell_lon = 4.84'), 'OK rows=1');
 perform t.expect('V7 A (profil du jour) corrige encore sa zone', t.as(A, 'update public.profiles set cell_lat = 43.60, cell_lon = 1.44'), 'OK rows=1');

 -- ===== Profil ancien : une zone par semaine =====
 alter table public.profiles disable trigger neighbors_profile_before_update;
 update public.profiles set created_at = now() - interval '10 days', cell_changed_at = now() - interval '10 days' where user_id = B;
 alter table public.profiles enable trigger neighbors_profile_before_update;
 perform t.expect('V7 B (10 jours, zone inchangée) change de zone', t.as(B, 'update public.profiles set cell_lat = 45.76, cell_lon = 4.84'), 'OK rows=1');
 perform t.expect('V7 ... la date de changement est posée', (select 'OK '||(cell_changed_at > now() - interval '1 minute') from public.profiles where user_id = B), 'OK true');
 perform t.expect('V7 B ne rechange pas de zone tout de suite', t.as(B, 'update public.profiles set cell_lat = 43.60, cell_lon = 1.44'), 'ERR P0001 quota_exceeded:zone');
 perform t.expect('V7 B ne change pas de taille de cellule tout de suite', t.as(B, 'update public.profiles set cell_size = ''large'''), 'ERR P0001 quota_exceeded:zone');
 perform t.expect('V7 ... sa zone n''a pas bougé', (select 'OK '||cell_lat||' '||cell_lon from public.profiles where user_id = B), 'OK 45.76 4.83');
 perform t.expect('V7 B change de pseudo malgré tout (autre quota)', t.as(B, 'update public.profiles set pseudo = ''Bobby'''), 'OK rows=1');
 perform t.expect('V7 B : même zone renvoyée = pas un changement de zone', t.as(B, 'update public.profiles set cell_lat = 45.76, cell_lon = 4.83, pseudo = ''Bobbo'''), 'OK rows=1');

 alter table public.profiles disable trigger neighbors_profile_before_update;
 update public.profiles set created_at = now() - interval '10 days', cell_changed_at = now() - interval '3 days' where user_id = C;
 alter table public.profiles enable trigger neighbors_profile_before_update;
 perform t.expect('V7 C (zone changée il y a 3 jours) refusé', t.as(C, 'update public.profiles set cell_lat = 45.76, cell_lon = 4.84'), 'ERR P0001 quota_exceeded:zone');
 alter table public.profiles disable trigger neighbors_profile_before_update;
 update public.profiles set cell_changed_at = now() - interval '8 days' where user_id = C;
 alter table public.profiles enable trigger neighbors_profile_before_update;
 perform t.expect('V7 C (il y a 8 jours) accepté', t.as(C, 'update public.profiles set cell_lat = 45.76, cell_lon = 4.84'), 'OK rows=1');

 -- ===== La date n'est pas modifiable par le client =====
 perform t.expect('V7 aucun droit d''écriture sur cell_changed_at', t.as(C, 'update public.profiles set cell_changed_at = now() - interval ''30 days'''), 'ERR 42501');
 perform t.expect('V7 aucun droit de lecture sur cell_changed_at', t.as(C, 'select cell_changed_at from public.profiles'), 'ERR 42501');
 perform t.expect('V7 pas d''insertion avec cell_changed_at', t.as(C, 'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon,cell_changed_at) values (gen_random_uuid(),''Zed'',1,1,now())'), 'ERR 42501');
end $$;

-- ===== Textes : caractères de contrôle et invisibles =====
do $$
declare
  A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002';
  post text := 'insert into public.posts(author,kind,title,body) values (%L,''don'',%L,%L)';
begin
 perform t.expect('V7 annonce normale, saut de ligne et tabulation permis', t.as(A, format(post, A, 'Boutures de menthe', E'Deux lignes\nretrait\tok')), 'OK rows=1');
 perform t.expect('V7 titre avec inversion de direction (U+202E) refusé', t.as(A, format(post, A, 'Don' || chr(8238) || 'gnirts', '')), 'ERR 23514');
 perform t.expect('V7 titre avec espace de largeur nulle (U+200B) refusé', t.as(A, format(post, A, 'Don' || chr(8203) || 'x', '')), 'ERR 23514');
 perform t.expect('V7 corps avec caractère de contrôle (BEL) refusé', t.as(A, format(post, A, 'Titre', 'ab' || chr(7) || 'cd')), 'ERR 23514');
 perform t.expect('V7 corps avec ESC (séquence de terminal) refusé', t.as(A, format(post, A, 'Titre', chr(27) || '[31mrouge')), 'ERR 23514');
 perform t.expect('V7 corps avec U+FEFF refusé', t.as(A, format(post, A, 'Titre', chr(65279) || 'x')), 'ERR 23514');
 perform t.expect('V7 titre avec « < » refusé', t.as(A, format(post, A, '<b>gras</b>', '')), 'ERR 23514');
 perform t.expect('V7 un accent ou un emoji reste permis', t.as(A, format(post, A, 'Fraises 🍓 été', 'À donner : très bonnes')), 'OK rows=1');
 -- Signalement : contrainte vérifiée en direct (A et B ne se voient pas : la politique répondrait avant la contrainte).
 begin
   insert into public.reports(reporter,target_kind,target_id,reason,details) values (A,'profile',B,'spam','a' || chr(8238));
   raise notice 'FAIL  V7 signalement : détails avec contrôle refusé  -> inséré';
 exception when check_violation then
   raise notice 'PASS  V7 signalement : détails avec contrôle refusé  -> %', sqlstate;
 end;
end $$;
