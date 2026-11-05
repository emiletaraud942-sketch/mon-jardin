-- Scénarios de la version 9 : S6 schéma privé, S7 (complément) textes, S8 masquage automatique, S4 droits de la purge.
-- Base JETABLE uniquement (vide auth.users). Lancé par run.sh en dernier, APRÈS la v9. Chaque ligne PASS/FAIL est une règle ou une attaque vérifiée.
create or replace function t.u9(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000009' || lpad(n::text, 2, '0'))::uuid $$;
-- Profil créé par la personne elle-même (comme dans l'appli).
create or replace function t.mk9(n int, nm text, lat numeric, lon numeric) returns text language sql as $$
  select t.as(t.u9(n), format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,%s,%s)', t.u9(n), nm, lat, lon)) $$;
-- Vieillit un profil (action de l'éditeur : auth.uid() vide).
create or replace function t.age9(n int, i interval) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set created_at = now() - i where user_id = t.u9(n);
end $$;
-- Essaie un gabarit d'insertion avec chaque caractère : liste ceux qui ont été ACCEPTÉS (23514 attendu partout).
create or replace function t.accepted(uid uuid, tpl text, chars text[]) returns text language plpgsql as $$
declare h text; r text; acc text := '';
begin
  foreach h in array chars loop
    r := t.as(uid, format(tpl, h));
    if left(r, 9) <> 'ERR 23514' then acc := acc || 'U+' || to_hex(ascii(h)) || ' (' || left(r, 40) || ') '; end if;
  end loop;
  return coalesce(nullif(acc, ''), 'none');
end $$;

truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id, email) select t.u9(n), 'u' || n || '@x.fr' from generate_series(1, 40) n;

-- =====================================================================
-- S6 : neighbors_is_blocked / neighbors_can_contact / neighbors_can_see_user ne sont plus des fonctions de l'API
-- =====================================================================
do $$
declare
  th uuid; q uuid; ev uuid; r text;
begin
 -- 2 = B (Paris), 3 = C (Paris, annonce + question + événement), 4 = D (Marseille, annonce), 5 = E (Paris, jardin partagé seulement), 6 = F (Paris, répond à C)
 perform t.expect('S6 profil B', t.mk9(2, 'Bernard', 48.86, 2.34), 'OK rows=1');
 perform t.expect('S6 profil C', t.mk9(3, 'Carole', 48.86, 2.34), 'OK rows=1');
 perform t.expect('S6 profil D (Marseille)', t.mk9(4, 'Didier', 43.30, 5.38), 'OK rows=1');
 perform t.expect('S6 profil E', t.mk9(5, 'Estelle', 48.86, 2.34), 'OK rows=1');
 perform t.expect('S6 profil F', t.mk9(6, 'Fabrice', 48.86, 2.34), 'OK rows=1');
 perform t.as(t.u9(3), 'insert into public.posts(kind,title) values (''don'',''Graines de C'')');
 perform t.as(t.u9(3), 'insert into public.posts(kind,title) values (''question'',''Quand semer ?'')');
 perform t.as(t.u9(4), 'insert into public.posts(kind,title) values (''don'',''Boutures de D'')');
 perform t.as(t.u9(5), 'insert into public.garden_shares(species) values (array[''pommier'',''thym''])');
 select id into q from public.posts where title = 'Quand semer ?';
 perform t.as(t.u9(6), format('insert into public.replies(post_id,body) values (%L,''En mars'')', q));
 perform t.expect('S6 C devient organisateur', t.as(t.u9(3), format('insert into public.organizers(user_id,name) values (%L,''Jardins ouverts'')', t.u9(3))), 'OK rows=1');
 perform set_config('request.jwt.claim.sub', '', true);
 update public.organizers set verified_at = now() where user_id = t.u9(3);
 perform t.as(t.u9(3), 'insert into public.events(title,starts_at,ends_at,place) values (''Troc'',now()+interval ''2 days'',now()+interval ''3 days'',''Salle'')');

 -- Les trois sondes n'existent plus dans public : ni pour un membre, ni pour anon (42883 = fonction inconnue).
 perform t.expect('S6 public.neighbors_is_blocked n''existe plus (membre)', t.as(t.u9(2), format('select public.neighbors_is_blocked(%L)', t.u9(3))), 'ERR 42883');
 perform t.expect('S6 public.neighbors_can_contact n''existe plus (membre)', t.as(t.u9(2), format('select public.neighbors_can_contact(%L)', t.u9(3))), 'ERR 42883');
 perform t.expect('S6 public.neighbors_can_see_user n''existe plus (membre)', t.as(t.u9(2), format('select public.neighbors_can_see_user(%L)', t.u9(3))), 'ERR 42883');
 perform t.expect('S6 ... anon non plus (is_blocked)', t.as(null, format('select public.neighbors_is_blocked(%L)', t.u9(3))), 'ERR 42883');
 perform t.expect('S6 ... anon non plus (can_contact)', t.as(null, format('select public.neighbors_can_contact(%L)', t.u9(3))), 'ERR 42883');
 perform t.expect('S6 ... anon non plus (can_see_user)', t.as(null, format('select public.neighbors_can_see_user(%L)', t.u9(3))), 'ERR 42883');
 perform t.expect('S6 aucune des trois n''existe dans public (catalogue)',
   (select 'OK '||count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('neighbors_is_blocked', 'neighbors_can_contact', 'neighbors_can_see_user')), 'OK 0');
 perform t.expect('S6 les trois existent dans neighbors_private (catalogue)',
   (select 'OK '||string_agg(proname, ',' order by proname) from pg_proc where pronamespace = 'neighbors_private'::regnamespace), 'OK neighbors_can_contact,neighbors_can_see_user,neighbors_is_blocked');
 -- Le schéma privé est fermé à anon (PostgREST ne l'expose de toute façon pas).
 perform t.expect('S6 schéma privé fermé à anon (is_blocked)', t.as(null, format('select neighbors_private.neighbors_is_blocked(%L)', t.u9(3))), 'ERR 42501');
 perform t.expect('S6 ... can_contact', t.as(null, format('select neighbors_private.neighbors_can_contact(%L)', t.u9(3))), 'ERR 42501');
 perform t.expect('S6 ... can_see_user', t.as(null, format('select neighbors_private.neighbors_can_see_user(%L)', t.u9(3))), 'ERR 42501');
 perform t.expect('S6 schéma privé : usage refusé à anon', (select 'OK '||has_schema_privilege('anon', 'neighbors_private', 'usage')), 'OK false');
 perform t.expect('S6 schéma privé : usage accordé aux connectés (les politiques en ont besoin)', (select 'OK '||has_schema_privilege('authenticated', 'neighbors_private', 'usage')), 'OK true');
 perform t.expect('S6 schéma privé : aucun droit pour public', (select 'OK '||has_schema_privilege('public', 'neighbors_private', 'usage')), 'OK false');
 perform t.expect('S6 aucune fonction du schéma privé exécutable par anon',
   (select 'OK '||count(*) from pg_proc p where p.pronamespace = 'neighbors_private'::regnamespace and has_function_privilege('anon', p.oid, 'execute')), 'OK 0');
 perform t.expect('S6 aucune fonction exécutable par anon dans public',
   (select 'OK '||coalesce(string_agg(p.proname, ','), '') from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')), 'OK ');
 perform t.expect('S6 fonctions publiques appelables par les connectés : la liste attendue, rien d''autre',
   (select 'OK '||string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')),
   'LISTE');
 perform t.expect('S6 aucune politique ne mentionne encore une fonction publique supprimée',
   (select 'OK '||count(*) from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ~ 'public\.neighbors_(is_blocked|can_contact|can_see_user)'), 'OK 0');

 -- Les politiques fonctionnent toujours (elles appellent les fonctions du schéma privé) : lecture.
 perform t.expect('S6 B voit l''annonce de C', t.as(t.u9(2), format('select count(*) from public.posts where author = %L', t.u9(3))), 'OK 2');
 perform t.expect('S6 B voit le profil de C (annonce visible)', t.as(t.u9(2), format('select pseudo from public.profiles where user_id = %L', t.u9(3))), 'OK Carole');
 perform t.expect('S6 B ne voit pas l''annonce de D (Marseille)', t.as(t.u9(2), format('select count(*) from public.posts where author = %L', t.u9(4))), 'OK 0');
 perform t.expect('S6 B voit le jardin de E et son pseudo', t.as(t.u9(2), format('select count(*) from public.garden_shares g join public.profiles p on p.user_id = g.user_id where g.user_id = %L', t.u9(5))), 'OK 1');
 perform t.expect('S6 B voit l''événement de C', t.as(t.u9(2), 'select count(*) from public.events'), 'OK 1');
 perform t.expect('S6 B voit la réponse de F', t.as(t.u9(2), format('select count(*) from public.replies where post_id = %L', q)), 'OK 1');
 -- Contact : conversation avec C (annonce), avec E (jardin partagé seulement), refusée avec D (hors zone).
 perform t.expect('S6 B ouvre une conversation avec C (neighbors_can_contact via la politique)',
   t.as(t.u9(2), format('insert into public.threads(user_a,user_b) values (%L,%L)', least(t.u9(2), t.u9(3)), greatest(t.u9(2), t.u9(3)))), 'OK rows=1');
 perform t.expect('S6 B ouvre une conversation avec E (jardin partagé visible)',
   t.as(t.u9(2), format('insert into public.threads(user_a,user_b) values (%L,%L)', least(t.u9(2), t.u9(5)), greatest(t.u9(2), t.u9(5)))), 'OK rows=1');
 perform t.expect('S6 B lit ses deux conversations', t.as(t.u9(2), 'select count(*) from public.threads'), 'OK 2');
 perform t.expect('S6 B n''ouvre pas de conversation avec D (Marseille, invisible)',
   t.as(t.u9(2), format('insert into public.threads(user_a,user_b) values (%L,%L)', least(t.u9(2), t.u9(4)), greatest(t.u9(2), t.u9(4)))), 'ERR 42501');
 perform t.expect('S6 B n''ouvre pas de conversation avec lui-même', t.as(t.u9(2), format('insert into public.threads(user_a,user_b) values (%L,%L)', t.u9(2), t.u9(2))), 'ERR');

 -- Blocage : appliqué dans les deux sens par les politiques.
 perform t.expect('S6 B bloque C', t.as(t.u9(2), format('insert into public.blocks(blocked) values (%L)', t.u9(3))), 'OK rows=1');
 perform t.expect('S6 ... B ne voit plus les annonces de C', t.as(t.u9(2), format('select count(*) from public.posts where author = %L', t.u9(3))), 'OK 0');
 perform t.expect('S6 ... ni son profil', t.as(t.u9(2), format('select count(*) from public.profiles where user_id = %L', t.u9(3))), 'OK 0');
 perform t.expect('S6 ... ni la conversation avec C (reste celle avec E)', t.as(t.u9(2), 'select count(*) from public.threads'), 'OK 1');
 perform t.expect('S6 ... ni son événement', t.as(t.u9(2), 'select count(*) from public.events'), 'OK 0');
 perform t.expect('S6 ... et C ne voit plus B (blocage dans l''autre sens)', t.as(t.u9(3), format('select count(*) from public.profiles where user_id = %L', t.u9(2))), 'OK 0');
 perform t.expect('S6 B bloque E', t.as(t.u9(2), format('insert into public.blocks(blocked) values (%L)', t.u9(5))), 'OK rows=1');
 perform t.expect('S6 ... B ne voit plus le jardin de E', t.as(t.u9(2), format('select count(*) from public.garden_shares where user_id = %L', t.u9(5))), 'OK 0');
 perform t.expect('S6 ... et E ne voit plus rien de B', t.as(t.u9(5), format('select count(*) from public.profiles where user_id = %L', t.u9(2))), 'OK 0');
 perform t.expect('S6 ... E ne peut pas non plus rouvrir (fil existant masqué)', t.as(t.u9(2), 'select count(*) from public.threads'), 'OK 0');
 perform t.expect('S6 F (non bloquée) voit encore le jardin de E', t.as(t.u9(6), format('select count(*) from public.garden_shares where user_id = %L', t.u9(5))), 'OK 1');
 -- Réponses : bloquer l'auteur d'une réponse la masque.
 perform t.expect('S6 B bloque F', t.as(t.u9(2), format('insert into public.blocks(blocked) values (%L)', t.u9(6))), 'OK rows=1');
 perform t.expect('S6 ... B ne voit plus la réponse de F', t.as(t.u9(2), 'select count(*) from public.replies'), 'OK 0');
 -- Bannissement : le jardin d'une personne bannie disparaît, le contact aussi.
 perform set_config('request.jwt.claim.sub', '', true);
 delete from public.blocks;
 update public.profiles set banned_at = now() where user_id = t.u9(5);
 perform t.expect('S6 E bannie : son jardin n''est plus visible', t.as(t.u9(6), format('select count(*) from public.garden_shares where user_id = %L', t.u9(5))), 'OK 0');
 perform t.expect('S6 E bannie : F ne peut plus lui écrire', t.as(t.u9(6), format('insert into public.threads(user_a,user_b) values (%L,%L)', least(t.u9(6), t.u9(5)), greatest(t.u9(6), t.u9(5)))), 'ERR 42501');
 update public.profiles set banned_at = null where user_id = t.u9(5);
 perform t.expect('S6 bannissement levé : F voit à nouveau le jardin de E', t.as(t.u9(6), format('select count(*) from public.garden_shares where user_id = %L', t.u9(5))), 'OK 1');
end $$;

-- =====================================================================
-- S7 (complément) : C1, marques de direction complètes, organisateurs
-- =====================================================================
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id, email) select t.u9(n), 'u' || n || '@x.fr' from generate_series(1, 40) n;

do $$
declare
  hostile text[] := array[chr(1), chr(8), chr(11), chr(12), chr(14), chr(27), chr(31), chr(127),
                          chr(128), chr(133), chr(141), chr(150), chr(159),
                          chr(173), chr(1564), chr(8203), chr(8204), chr(8205), chr(8206), chr(8207),
                          chr(8232), chr(8233), chr(8234), chr(8235), chr(8236), chr(8237), chr(8238),
                          chr(8288), chr(8294), chr(8295), chr(8296), chr(8297), chr(8300), chr(65279)];
  c1 text[] := array[chr(128), chr(133), chr(150), chr(159)];
  bidi text[] := array[chr(8206), chr(8207), chr(8234), chr(8235), chr(8236), chr(8237), chr(8238), chr(8294), chr(8295), chr(8296), chr(8297)];
  v7class constant text := '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f­؜​-‏ -‮⁠-⁯﻿]';
  v9class constant text := '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f­؜​-‏ -‮⁠-⁯﻿]';
  lost int; added int; pid uuid; th uuid; i int; r text;
begin
 perform t.expect('S7 profil B (auteur)', t.mk9(2, 'Bernard', 48.86, 2.34), 'OK rows=1');
 perform t.expect('S7 profil C (lecteur)', t.mk9(3, 'Carole', 48.86, 2.34), 'OK rows=1');
 perform t.expect('S7 profil D (organisateur)', t.mk9(4, 'Denis', 48.86, 2.34), 'OK rows=1');
 perform t.expect('S7 les 6 contraintes de texte existent et sont validées',
   (select 'OK '||count(*) from pg_constraint where convalidated and conname in ('posts_text_clean', 'replies_text_clean', 'messages_text_clean', 'reports_text_clean', 'events_text_clean', 'organizers_text_clean')), 'OK 6');
 perform t.expect('S7 chaque contrainte de texte n''existe qu''une fois par table (pas de doublon)',
   (select 'OK '||count(*) from pg_constraint where conname ~ '_text_(clean|check)$'), 'OK 6');
 -- La règle de la v9 contient celle de la v7 (rien de perdu) et ajoute exactement U+0080-U+009F.
 select count(*) into lost from generate_series(1, 65535) g where g not between 55296 and 57343 and chr(g) ~ v7class and chr(g) !~ v9class;
 select count(*) into added from generate_series(1, 65535) g where g not between 55296 and 57343 and chr(g) ~ v9class and chr(g) !~ v7class;
 perform t.expect('S7 aucun caractère de la règle v7 n''est perdu', 'OK ' || lost, 'OK 0');
 perform t.expect('S7 la v9 ajoute exactement les 32 contrôles C1', 'OK ' || added, 'OK 32');
 perform t.expect('S7 marques de direction complètes dans la règle (U+200E/F, U+202A-E, U+2066-9)',
   (select 'OK ' || count(*) from unnest(bidi) h where h ~ v9class), 'OK 11');
 perform t.expect('S7 retour à la ligne, tabulation, accents et emoji simple ne sont pas touchés',
   (select 'OK ' || count(*) from unnest(array[chr(9), chr(10), chr(13), 'é', 'œ', '€', chr(128512)]) h where h ~ v9class), 'OK 0');

 -- Annonces, réponses, messages, signalements
 perform t.expect('S7 annonce légitime (retour à la ligne, accents, emoji)', t.as(t.u9(2), 'insert into public.posts(kind,title,body) values (''question'',''Quand tailler le noyer ? 😀'',''Ligne 1''||chr(10)||''Ligne 2 : œuf, été'')'), 'OK rows=1');
 select id into pid from public.posts limit 1;
 perform t.expect('S7 posts.title : tous les caractères interdits refusés', 'OK ' || t.accepted(t.u9(2), 'insert into public.posts(kind,title,body) values (''don'', ''T''||%L, ''x'')', hostile), 'OK none');
 perform t.expect('S7 posts.body : tous refusés', 'OK ' || t.accepted(t.u9(2), 'insert into public.posts(kind,title,body) values (''don'', ''T'', ''x''||%L)', hostile), 'OK none');
 perform t.expect('S7 posts.title : < refusé', t.as(t.u9(2), 'insert into public.posts(kind,title) values (''don'', ''<b>'')'), 'ERR 23514');
 perform t.expect('S7 replies.body : tous refusés', 'OK ' || t.accepted(t.u9(3), format('insert into public.replies(post_id,body) values (%L, ''x''||%%L)', pid), hostile), 'OK none');
 perform t.expect('S7 réponse légitime', t.as(t.u9(3), format('insert into public.replies(post_id,body) values (%L,''Au printemps'')', pid)), 'OK rows=1');
 perform t.expect('S7 C ouvre une conversation avec B', t.as(t.u9(3), format('insert into public.threads(user_a,user_b) values (%L,%L)', least(t.u9(2), t.u9(3)), greatest(t.u9(2), t.u9(3)))), 'OK rows=1');
 select id into th from public.threads limit 1;
 perform t.expect('S7 messages.body : tous refusés', 'OK ' || t.accepted(t.u9(3), format('insert into public.messages(thread_id,body) values (%L, ''x''||%%L)', th), hostile), 'OK none');
 perform t.expect('S7 message légitime', t.as(t.u9(3), format('insert into public.messages(thread_id,body) values (%L,''Bonjour''||chr(10)||''à bientôt'')', th)), 'OK rows=1');
 perform t.expect('S7 reports.details : tous refusés', 'OK ' || t.accepted(t.u9(3), format('insert into public.reports(target_kind,target_id,reason,details) values (''post'', %L, ''spam'', ''x''||%%L)', pid), hostile), 'OK none');
 perform t.expect('S7 précisions légitimes', t.as(t.u9(3), format('insert into public.reports(target_kind,target_id,reason,details) values (''post'',%L,''spam'',''Vend des plants'')', pid)), 'OK rows=1');

 -- Organisateurs : nom et description
 perform t.expect('S7 organizers.description : tous refusés', 'OK ' || t.accepted(t.u9(4), format('insert into public.organizers(user_id,name,description) values (%L, ''Jardins du coin'', ''Asso''||%%L)', t.u9(4)), hostile), 'OK none');
 perform t.expect('S7 organizers.name : tous refusés', 'OK ' || t.accepted(t.u9(4), format('insert into public.organizers(user_id,name,description) values (%L, ''Jardins''||%%L||''coin'', ''x'')', t.u9(4)), hostile), 'OK none');
 perform t.expect('S7 organisateur : demande légitime', t.as(t.u9(4), format('insert into public.organizers(user_id,name,description) values (%L,''Jardins du coin'',''Asso de quartier''||chr(10)||''Ouverte à tous'')', t.u9(4))), 'OK rows=1');
 perform t.expect('S7 organisateur : description corrigée avec un contrôle C1 refusée', t.as(t.u9(4), 'update public.organizers set description = ''x''||chr(133)'), 'ERR 23514');
 perform set_config('request.jwt.claim.sub', '', true);
 update public.organizers set verified_at = now() where user_id = t.u9(4);

 -- Événements
 perform t.expect('S7 events.title : tous refusés', 'OK ' || t.accepted(t.u9(4), 'insert into public.events(title,starts_at,ends_at,place) values (''T''||%L, now()+interval ''2 days'', now()+interval ''3 days'', ''Salle'')', hostile), 'OK none');
 perform t.expect('S7 events.description : tous refusés', 'OK ' || t.accepted(t.u9(4), 'insert into public.events(title,description,starts_at,ends_at,place) values (''T'', ''x''||%L, now()+interval ''2 days'', now()+interval ''3 days'', ''Salle'')', hostile), 'OK none');
 perform t.expect('S7 events.place : tous refusés', 'OK ' || t.accepted(t.u9(4), 'insert into public.events(title,starts_at,ends_at,place) values (''T'', now()+interval ''2 days'', now()+interval ''3 days'', ''Salle''||%L)', hostile), 'OK none');
 perform t.expect('S7 événement légitime', t.as(t.u9(4), 'insert into public.events(title,description,starts_at,ends_at,place) values (''Troc'',''Apportez vos graines''||chr(10)||''Merci'',now()+interval ''2 days'',now()+interval ''3 days'',''Salle des fêtes'')'), 'OK rows=1');

 -- Pseudo : sa propre contrainte, vérifiée avec les mêmes caractères (profiles_pseudo_check)
 perform t.expect('S7 pseudo : les caractères interdits sont refusés aussi',
   'OK ' || t.accepted(t.u9(5), 'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (''' || t.u9(5) || ''', ''Ab''||%L||''cd'', 48.86, 2.34)', hostile), 'OK none');
end $$;

-- =====================================================================
-- S8 : masquage automatique (signaleurs de plus de 7 jours ET déjà actifs) et avertissements avant masquage
-- =====================================================================
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id, email) select t.u9(n), 'u' || n || '@x.fr' from generate_series(1, 40) n;

create or replace function t.logs(kind text, tid uuid) returns text language sql as $$
  select coalesce(string_agg(action, ',' order by id), '-') from public.moderation_log where target_kind = kind and target_id = tid $$;
create or replace function t.rep(n int, kind text, tid uuid) returns text language sql as $$
  select t.as(t.u9(n), format('insert into public.reports(target_kind,target_id,reason) values (%L,%L,''spam'')', kind, tid)) $$;
-- Rend un signaleur « qualifié » : profil de 8 jours et une annonce publiée.
create or replace function t.qualify(n int) returns void language plpgsql as $$
begin
  perform t.age9(n, interval '8 days');
  perform t.as(t.u9(n), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')');
end $$;

do $$
declare
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; q uuid; ev uuid; rid uuid; i int; w1 int; w2 int; th uuid;
begin
 -- Tous au même endroit. 1 = auteur ; 2..9 = signaleurs.
 for i in 1..9 loop perform t.mk9(i, 'Membre' || i, 48.86, 2.34); end loop;
 for i in 1..9 loop perform t.age9(i, interval '30 days'); end loop;   -- tous anciens ; on ajuste ensuite
 perform t.as(t.u9(1), 'insert into public.posts(kind,title,body) values (''don'',''Annonce 1'',''x'')');
 perform t.as(t.u9(1), 'insert into public.posts(kind,title,body) values (''don'',''Annonce 2'',''x'')');
 perform t.as(t.u9(1), 'insert into public.posts(kind,title,body) values (''don'',''Annonce 3'',''x'')');
 perform t.as(t.u9(1), 'insert into public.posts(kind,title,body) values (''don'',''Annonce 4'',''x'')');
 select id into p1 from public.posts where title = 'Annonce 1';
 select id into p2 from public.posts where title = 'Annonce 2';
 select id into p3 from public.posts where title = 'Annonce 3';
 select id into p4 from public.posts where title = 'Annonce 4';

 -- ===== Cas 1 : 3 comptes de plus de 24 h mais de moins de 7 jours, tous actifs (le scénario d'avant la v7) : PAS de masquage =====
 for i in 2..4 loop perform t.age9(i, interval '3 days'); perform t.as(t.u9(i), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')'); end loop;
 perform t.expect('S8 jeunes comptes (3 jours, actifs) : 1er signalement', t.rep(2, 'post', p1), 'OK rows=1');
 perform t.expect('S8 ... 2e', t.rep(3, 'post', p1), 'OK rows=1');
 perform t.expect('S8 ... 3e', t.rep(4, 'post', p1), 'OK rows=1');
 perform t.expect('S8 ... l''annonce reste ouverte (3 faux comptes de 3 jours ne masquent plus)', (select 'OK '||status from public.posts where id = p1), 'OK open');
 perform t.expect('S8 ... l''éditeur est prévenu : 3 signalements dont 0 qualifié, pas de masquage', t.logs('post', p1), 'warn');
 perform t.expect('S8 ... avec la raison', (select 'OK '||reason from public.moderation_log where target_id = p1), 'OK 3 signalements dont seulement 0 de comptes qualifiés');
 perform t.expect('S8 ... aucun auto_hide', (select 'OK '||count(*) from public.moderation_log where target_id = p1 and action = 'auto_hide'), 'OK 0');

 -- ===== Cas 2 : 3 comptes de 8 jours mais SANS aucune activité : pas de masquage =====
 for i in 5..7 loop perform t.age9(i, interval '8 days'); end loop;
 perform t.rep(5, 'post', p2); perform t.rep(6, 'post', p2); perform t.rep(7, 'post', p2);
 perform t.expect('S8 comptes de 8 jours sans aucune activité : annonce ouverte', (select 'OK '||status from public.posts where id = p2), 'OK open');
 perform t.expect('S8 ... avertissement « à examiner » seulement', t.logs('post', p2), 'warn');

 -- ===== Cas 3 : 3 comptes qualifiés (8 jours + annonce / réponse / message) : masquage, avertissement AVANT =====
 -- 5 : annonce ; 6 : réponse à une question ; 7 : message privé.
 perform t.as(t.u9(5), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')');
 perform t.as(t.u9(2), 'insert into public.posts(kind,title) values (''question'',''Quand semer ?'')');
 select id into q from public.posts where kind = 'question' and author = t.u9(2);
 perform t.as(t.u9(6), format('insert into public.replies(post_id,body) values (%L,''En mars'')', q));
 perform t.expect('S8 7 ouvre une conversation avec l''auteur (annonce visible)', t.as(t.u9(7), format('insert into public.threads(user_a,user_b) values (%L,%L)', least(t.u9(1), t.u9(7)), greatest(t.u9(1), t.u9(7)))), 'OK rows=1');
 select id into th from public.threads where t.u9(7) in (user_a, user_b);
 perform t.expect('S8 ... et lui écrit', t.as(t.u9(7), format('insert into public.messages(thread_id,body) values (%L,''Bonjour'')', th)), 'OK rows=1');
 perform t.expect('S8 signaleur qualifié (annonce) : 1er signalement de p3', t.rep(5, 'post', p3), 'OK rows=1');
 perform t.expect('S8 ... p3 ouverte', (select 'OK '||status from public.posts where id = p3), 'OK open');
 perform t.expect('S8 signaleur qualifié (réponse) : 2e signalement', t.rep(6, 'post', p3), 'OK rows=1');
 perform t.expect('S8 ... l''éditeur est prévenu au 2e signalement qualifié', t.logs('post', p3), 'warn');
 perform t.expect('S8 ... « le prochain masquera »', (select 'OK '||reason from public.moderation_log where target_id = p3), 'OK 2 signalements de comptes qualifiés : le prochain masquera automatiquement');
 perform t.expect('S8 signaleur qualifié (message) : 3e signalement', t.rep(7, 'post', p3), 'OK rows=1');
 perform t.expect('S8 ... p3 masquée', (select 'OK '||status from public.posts where id = p3), 'OK hidden');
 perform t.expect('S8 ... journal : avertissement D''ABORD, puis masquage', t.logs('post', p3), 'warn,warn,auto_hide');
 perform t.expect('S8 ... l''avertissement « seuil atteint » précède auto_hide',
   (select 'OK '||(select reason from public.moderation_log where target_id = p3 and action = 'warn' order by id desc limit 1)), 'OK seuil atteint : 3 signalements');
 perform t.expect('S8 ... l''auteur ne la rouvre pas', t.as(t.u9(1), format('update public.posts set status = ''open'' where id = %L', p3)), 'OK rows=0');
 -- Signalements suivants sur un contenu déjà masqué : pas de nouvelle ligne de journal.
 perform t.age9(8, interval '9 days'); perform t.as(t.u9(8), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')');
 select count(*) into w1 from public.moderation_log where target_id = p3;
 perform t.expect('S8 4e signalement d''un contenu déjà masqué (le contenu n''est plus visible : refusé)', t.rep(8, 'post', p3), 'ERR 42501');
 select count(*) into w2 from public.moderation_log where target_id = p3;
 perform t.expect('S8 ... le journal n''a pas bougé', 'OK ' || (w2 - w1), 'OK 0');

 -- ===== Cas 4 : 2 qualifiés + 1 non qualifié : pas de masquage ; le 4e (qualifié) masque =====
 perform t.expect('S8 5 signale p4', t.rep(5, 'post', p4), 'OK rows=1');
 perform t.expect('S8 6 signale p4', t.rep(6, 'post', p4), 'OK rows=1');
 perform t.expect('S8 9 (aucune activité, ancien) signale p4', t.rep(9, 'post', p4), 'OK rows=1');
 perform t.expect('S8 ... p4 ouverte : 2 qualifiés + 1 inactif ne suffisent pas', (select 'OK '||status from public.posts where id = p4), 'OK open');
 perform t.expect('S8 ... journal : avertissement (2 qualifiés), puis avertissement (3 signalements dont 2 qualifiés)', t.logs('post', p4), 'warn,warn');
 perform t.expect('S8 7 (qualifié) signale p4 : seuil atteint', t.rep(7, 'post', p4), 'OK rows=1');
 perform t.expect('S8 ... p4 masquée', (select 'OK '||status from public.posts where id = p4), 'OK hidden');
 perform t.expect('S8 ... journal complet', t.logs('post', p4), 'warn,warn,warn,auto_hide');

 -- ===== Cas 5 : un signaleur banni ne compte pas (avant comme après son signalement) =====
 perform t.as(t.u9(1), 'insert into public.posts(kind,title) values (''don'',''Annonce 5'')');
 select id into p5 from public.posts where title = 'Annonce 5';
 perform set_config('request.jwt.claim.sub', '', true);
 update public.profiles set banned_at = now() where user_id = t.u9(8);
 perform t.expect('S8 un banni ne peut plus signaler', t.rep(8, 'post', p5), 'ERR 42501');
 perform t.age9(9, interval '9 days'); perform t.as(t.u9(9), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')');
 perform t.rep(5, 'post', p5); perform t.rep(6, 'post', p5);
 perform set_config('request.jwt.claim.sub', '', true);
 update public.profiles set banned_at = now() where user_id = t.u9(6);
 perform t.expect('S8 7 signale après le bannissement de 6 : 5 et 7 seulement comptent, pas de masquage', t.rep(7, 'post', p5), 'OK rows=1');
 perform t.expect('S8 ... p5 ouverte (le signalement du banni ne compte plus)', (select 'OK '||status from public.posts where id = p5), 'OK open');
 perform t.expect('S8 9 signale : 5, 7, 9 = 3 qualifiés', t.rep(9, 'post', p5), 'OK rows=1');
 perform t.expect('S8 ... p5 masquée', (select 'OK '||status from public.posts where id = p5), 'OK hidden');

 -- ===== Cas 6 : réponse =====
 perform t.as(t.u9(3), 'insert into public.posts(kind,title) values (''question'',''Quand tailler ?'')');
 q := (select id from public.posts where title = 'Quand tailler ?');
 perform t.as(t.u9(4), format('insert into public.replies(post_id,body) values (%L,''Réponse douteuse'')', q));
 rid := (select id from public.replies where post_id = q);
 perform t.rep(5, 'reply', rid); perform t.rep(7, 'reply', rid);
 perform t.expect('S8 réponse : 2 qualifiés, encore ouverte', (select 'OK '||status from public.replies where id = rid), 'OK open');
 perform t.rep(9, 'reply', rid);
 perform t.expect('S8 réponse : 3 qualifiés, masquée', (select 'OK '||status from public.replies where id = rid), 'OK hidden');
 perform t.expect('S8 ... journal de la réponse', t.logs('reply', rid), 'warn,warn,auto_hide');

 -- ===== Cas 7 : événement =====
 perform t.expect('S8 3 devient organisateur', t.as(t.u9(3), format('insert into public.organizers(user_id,name) values (%L,''Jardins ouverts'')', t.u9(3))), 'OK rows=1');
 perform set_config('request.jwt.claim.sub', '', true);
 update public.organizers set verified_at = now() where user_id = t.u9(3);
 perform t.as(t.u9(3), 'insert into public.events(title,starts_at,ends_at,place) values (''Troc'',now()+interval ''2 days'',now()+interval ''3 days'',''Salle'')');
 ev := (select id from public.events limit 1);
 perform t.rep(5, 'event', ev); perform t.rep(7, 'event', ev);
 perform t.expect('S8 événement : 2 qualifiés, encore ouvert', (select 'OK '||status from public.events where id = ev), 'OK open');
 perform t.rep(9, 'event', ev);
 perform t.expect('S8 événement : 3 qualifiés, masqué', (select 'OK '||status from public.events where id = ev), 'OK hidden');
 perform t.expect('S8 ... journal de l''événement', t.logs('event', ev), 'warn,warn,auto_hide');

 -- ===== Cas 8 : profil et message (jamais masqués seuls ; l'éditeur est prévenu une fois au 3e) =====
 perform t.rep(5, 'profile', t.u9(2)); perform t.rep(7, 'profile', t.u9(2));
 perform t.expect('S8 profil : 2 qualifiés, rien dans le journal', t.logs('profile', t.u9(2)), '-');
 perform t.rep(9, 'profile', t.u9(2));
 perform t.expect('S8 profil : 3 qualifiés, l''éditeur est prévenu (pas de masquage)', t.logs('profile', t.u9(2)), 'warn');
 perform t.expect('S8 ... le profil n''est pas banni', (select 'OK '||(banned_at is null) from public.profiles where user_id = t.u9(2)), 'OK true');
 perform t.expect('S8 un 4e signalement du profil n''ajoute rien', t.as(t.u9(1), format('insert into public.reports(target_kind,target_id,reason) values (''profile'',%L,''spam'')', t.u9(2))), 'OK rows=1');
 perform t.expect('S8 ... journal inchangé', t.logs('profile', t.u9(2)), 'warn');

 -- ===== Cas 9 : le même compte ne compte qu'une fois ; contenu déjà masqué =====
 perform t.expect('S8 doublon refusé', t.rep(5, 'event', ev), 'ERR');
end $$;


-- =====================================================================
-- S4 : droits de la purge (clé service_role seulement)
-- =====================================================================
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id, email) select t.u9(n), 'u' || n || '@x.fr' from generate_series(1, 5) n;
do $$
begin
 perform t.mk9(3, 'Carole', 48.86, 2.34);
 perform t.expect('S4 service_role peut purger', (select 'OK '||has_function_privilege('service_role', 'public.neighbors_purge_expired()', 'execute')), 'OK true');
 perform t.expect('S4 service_role peut lister les orphelins', (select 'OK '||has_function_privilege('service_role', 'public.neighbors_orphan_photos()', 'execute')), 'OK true');
 perform t.expect('S4 un connecté ne purge pas', t.as(t.u9(3), 'select public.neighbors_purge_expired()'), 'ERR 42501');
 perform t.expect('S4 anon ne purge pas', t.as(null, 'select public.neighbors_purge_expired()'), 'ERR 42501');
 perform t.expect('S4 un connecté ne liste pas les orphelins', t.as(t.u9(3), 'select public.neighbors_orphan_photos()'), 'ERR 42501');
 perform t.expect('S4 anon ne liste pas les orphelins', t.as(null, 'select public.neighbors_orphan_photos()'), 'ERR 42501');
 perform set_config('request.jwt.claim.sub', '', true);
 insert into public.posts(author, kind, title, photo_path) values (t.u9(3), 'don', 'Avec photo', t.u9(3)::text || '/11111111-1111-4111-8111-111111111111.jpg');
 insert into storage.objects(bucket_id, name, created_at) values
   ('neighbors-photos', t.u9(3)::text || '/11111111-1111-4111-8111-111111111111.jpg', now() - interval '3 days'),   -- référencée
   ('neighbors-photos', t.u9(3)::text || '/22222222-2222-4222-8222-222222222222.jpg', now() - interval '3 days'),   -- orpheline
   ('neighbors-photos', t.u9(3)::text || '/33333333-3333-4333-8333-333333333333.jpg', now() - interval '1 hour');   -- trop récente
 perform t.expect('S4 la liste d''orphelins ne contient que la photo ancienne que plus rien ne référence',
   (select 'OK '||string_agg(split_part(o, '/', 2), ',') from public.neighbors_orphan_photos() o), 'OK 22222222-2222-4222-8222-222222222222.jpg');
end $$;
