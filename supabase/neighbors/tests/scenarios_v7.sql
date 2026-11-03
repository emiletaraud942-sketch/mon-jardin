-- Scénarios de la version 7 (audit du 27 octobre 2026) : S3 quartier, S6 schéma privé, S7 textes, S8 masquage, S9 extrait, S4 droits.
-- Base JETABLE uniquement. Lancé par run.sh APRÈS la migration v7. Chaque ligne PASS/FAIL est une règle ou une attaque vérifiée.
truncate auth.users cascade; truncate storage.objects;
create or replace function t.u(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000007' || lpad(n::text, 2, '0'))::uuid $$;
-- Profil créé par la personne elle-même (comme dans l'appli).
create or replace function t.mk(n int, nm text, lat numeric, lon numeric) returns text language sql as $$
  select t.as(t.u(n), format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,%s,%s)', t.u(n), nm, lat, lon)) $$;
-- Vieillit un profil (action de l'éditeur : auth.uid() vide).
create or replace function t.age(n int, i interval) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set created_at = now() - i where user_id = t.u(n);
end $$;
insert into auth.users(id, email) select t.u(n), 'u' || n || '@x.fr' from generate_series(1, 40) n;

do $$
declare
  i int; r text; id1 uuid; id2 uuid; lyon_post uuid;
  hostile text[] := array[chr(8238), chr(8206), chr(8207), chr(8234), chr(8235), chr(8236), chr(8237), chr(8294), chr(8295), chr(8296), chr(8297),
                          chr(1564), chr(1), chr(8), chr(9), chr(11), chr(13), chr(27), chr(31), chr(127), chr(133), chr(159)];
  h text;
begin
 -- =====================================================================
 -- S3 : changer de quartier au plus une fois tous les 30 jours
 -- =====================================================================
 perform t.expect('S3 A (Paris) crée son profil', t.mk(1, 'Alice', 48.86, 2.34), 'OK rows=1');
 perform t.expect('S3 ... aucune date de déplacement à la création', (select 'OK '||coalesce(cell_moved_at::text,'null') from public.profiles where user_id = t.u(1)), 'OK null');
 perform t.expect('S3 A change de pseudo : pas un déplacement', t.as(t.u(1), 'update public.profiles set pseudo = ''Alicia'''), 'OK rows=1');
 perform t.expect('S3 ... toujours aucun déplacement', (select 'OK '||coalesce(cell_moved_at::text,'null') from public.profiles where user_id = t.u(1)), 'OK null');
 perform t.expect('S3 A glisse de 0,004 (même cellule) : pas un déplacement', t.as(t.u(1), 'update public.profiles set cell_lat = cell_lat + 0.004'), 'OK rows=1');
 perform t.expect('S3 ... toujours aucun déplacement', (select 'OK '||coalesce(cell_moved_at::text,'null') from public.profiles where user_id = t.u(1)), 'OK null');
 perform t.expect('S3 A corrige son quartier une première fois (libre)', t.as(t.u(1), 'update public.profiles set cell_lat = 48.90, cell_lon = 2.40'), 'OK rows=1');
 perform t.expect('S3 ... date de déplacement posée par le serveur', (select 'OK '||(cell_moved_at is not null and cell_moved_at > now() - interval '1 minute') from public.profiles where user_id = t.u(1)), 'OK true');
 perform t.expect('S3 A déplace de nouveau tout de suite : refusé', t.as(t.u(1), 'update public.profiles set cell_lat = 45.76, cell_lon = 4.83'), 'ERR P0001 cell_change_too_soon');
 perform t.expect('S3 ... changement de taille qui déplace la cellule : refusé', t.as(t.u(1), 'update public.profiles set cell_size = ''large'', cell_lat = 48.60'), 'ERR P0001 cell_change_too_soon');
 perform t.expect('S3 ... cellule inchangée après les refus', (select 'OK '||cell_lat||' '||cell_lon||' '||cell_size from public.profiles where user_id = t.u(1)), 'OK 48.90 2.40 standard');
 -- « Marche » à travers le pays : 12 pas de 0,45° (50 km) vers le sud. Avant la v7 : 5 par jour ; maintenant aucun.
 for i in 1..12 loop
   r := t.as(t.u(1), format('update public.profiles set cell_lat = %s', 48.90 - 0.44 * i));
   if r <> 'ERR P0001 cell_change_too_soon' then raise notice 'FAIL  S3 pas % de la marche accepté -> %', i, r; end if;
 end loop;
 perform t.expect('S3 la marche de 12 pas n''a pas bougé la cellule', (select 'OK '||cell_lat from public.profiles where user_id = t.u(1)), 'OK 48.90');
 perform t.expect('S3 ... et n''a consommé aucun quota (refus avant)', (select 'OK '||sum(n) from public.quotas where user_id = t.u(1) and action = 'profile'), 'OK 2');
 -- La colonne n'est ni lisible ni modifiable par un client.
 perform t.expect('S3 le client ne lit pas cell_moved_at', t.as(t.u(1), 'select cell_moved_at from public.profiles'), 'ERR 42501');
 perform t.expect('S3 le client ne l''efface pas pour se débloquer', t.as(t.u(1), 'update public.profiles set cell_moved_at = null'), 'ERR 42501');
 perform t.expect('S3 ... ni via insert d''un autre profil', t.as(t.u(2), format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon,cell_moved_at) values (%L,''Bidon'',48,2,now())', t.u(2))), 'ERR 42501');
 perform t.expect('S3 select * reste refusé', t.as(t.u(1), 'select * from public.profiles'), 'ERR 42501');
 perform t.expect('S3 anon : rien', t.as(null, 'update public.profiles set cell_lat = 1'), 'ERR 42501');
 -- Autrui.
 perform t.expect('S3 B ne déplace pas le profil de A', t.as(t.u(2), format('update public.profiles set cell_lat = 10 where user_id = %L', t.u(1))), 'OK rows=0');
 -- Fenêtre de 30 jours.
 perform set_config('request.jwt.claim.sub', '', true);
 update public.profiles set cell_moved_at = now() - interval '29 days 23 hours' where user_id = t.u(1);
 perform t.expect('S3 29 j 23 h après : encore refusé', t.as(t.u(1), 'update public.profiles set cell_lat = 45.76, cell_lon = 4.83'), 'ERR P0001 cell_change_too_soon');
 perform set_config('request.jwt.claim.sub', '', true);
 update public.profiles set cell_moved_at = now() - interval '30 days 1 hour' where user_id = t.u(1);
 perform t.expect('S3 30 j 1 h après : le changement passe (un déménagement)', t.as(t.u(1), 'update public.profiles set cell_lat = 45.76, cell_lon = 4.83'), 'OK rows=1');
 perform t.expect('S3 ... nouvelle cellule (Lyon) et date remise à zéro', (select 'OK '||cell_lat||' '||cell_lon||' '||(cell_moved_at > now() - interval '1 minute') from public.profiles where user_id = t.u(1)), 'OK 45.76 4.83 true');
 perform t.expect('S3 ... et on ne repart pas aussitôt', t.as(t.u(1), 'update public.profiles set cell_lat = 43.30, cell_lon = 5.37'), 'ERR P0001 cell_change_too_soon');
 -- L'éditeur n'est pas limité (SQL Editor : auth.uid() vide) et ne remet pas la date.
 perform set_config('request.jwt.claim.sub', '', true);
 update public.profiles set cell_lat = 43.30, cell_lon = 5.37 where user_id = t.u(1);
 perform t.expect('S3 l''éditeur déplace sans limite', (select 'OK '||cell_lat from public.profiles where user_id = t.u(1)), 'OK 43.30');
 perform t.as(t.u(1), 'update public.profiles set cell_lat = 45.76, cell_lon = 4.83');   -- (refusé, sans effet)

 -- Aspiration : A (Lyon désormais, bloquée) ne voit pas Paris ; un nouveau compte B gagne UNE correction puis est bloqué.
 perform t.expect('S3 C (Paris) crée son profil', t.mk(3, 'Carole', 48.86, 2.34), 'OK rows=1');
 perform t.expect('S3 C publie à Paris', t.as(t.u(3), 'insert into public.posts(kind,title) values (''don'',''Boutures Paris'')'), 'OK rows=1');
 perform t.expect('S3 D (Marseille) crée son profil et publie', t.mk(4, 'Denis', 43.30, 5.38), 'OK rows=1');
 perform t.as(t.u(4), 'insert into public.posts(kind,title) values (''don'',''Boutures Marseille'')');
 perform t.expect('S3 B (Lille) crée son profil', t.mk(2, 'Bob', 50.63, 3.06), 'OK rows=1');
 perform t.expect('S3 B ne voit ni Paris ni Marseille', t.as(t.u(2), 'select count(*) from public.posts'), 'OK 0');
 perform t.expect('S3 B utilise sa correction libre : va à Paris', t.as(t.u(2), 'update public.profiles set cell_lat = 48.86, cell_lon = 2.34'), 'OK rows=1');
 perform t.expect('S3 ... voit Paris', t.as(t.u(2), 'select count(*) from public.posts'), 'OK 1');
 perform t.expect('S3 ... mais ne peut pas poursuivre vers Marseille', t.as(t.u(2), 'update public.profiles set cell_lat = 43.30, cell_lon = 5.38'), 'ERR P0001 cell_change_too_soon');
 perform t.expect('S3 ... il ne voit toujours pas Marseille', t.as(t.u(2), format('select count(*) from public.posts where author = %L', t.u(4))), 'OK 0');

 -- =====================================================================
 -- S6 : neighbors_is_blocked / neighbors_can_contact ne sont plus des fonctions de l'API
 -- =====================================================================
 perform t.expect('S6 public.neighbors_can_contact n''existe plus (membre)', t.as(t.u(3), format('select public.neighbors_can_contact(%L)', t.u(2))), 'ERR 42883');
 perform t.expect('S6 public.neighbors_is_blocked n''existe plus (membre)', t.as(t.u(3), format('select public.neighbors_is_blocked(%L)', t.u(2))), 'ERR 42883');
 perform t.expect('S6 ... anon non plus', t.as(null, format('select public.neighbors_can_contact(%L)', t.u(2))), 'ERR 42883');
 perform t.expect('S6 le schéma privé est fermé à anon', t.as(null, format('select neighbors_private.neighbors_can_contact(%L)', t.u(2))), 'ERR 42501');
 perform t.expect('S6 ... et is_blocked aussi', t.as(null, format('select neighbors_private.neighbors_is_blocked(%L)', t.u(2))), 'ERR 42501');
 perform t.expect('S6 schéma privé : usage refusé à anon', (select 'OK '||has_schema_privilege('anon', 'neighbors_private', 'usage')), 'OK false');
 perform t.expect('S6 schéma privé : usage accordé aux connectés (les politiques en ont besoin)', (select 'OK '||has_schema_privilege('authenticated', 'neighbors_private', 'usage')), 'OK true');
 perform t.expect('S6 aucune fonction exécutable par anon dans public',
   (select 'OK '||coalesce(string_agg(p.proname, ','), '') from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')), 'OK ');
 perform t.expect('S6 fonctions publiques appelables par les connectés : la liste attendue, rien d''autre',
   (select 'OK '||string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')),
   'OK delete_my_account,neighbors_can_see_cell,neighbors_is_member,neighbors_is_organizer,neighbors_my_photo_count');
 perform t.expect('S6 les fonctions du schéma privé sont fermées à public',
   (select 'OK '||count(*) from pg_proc p where p.pronamespace = 'neighbors_private'::regnamespace and has_function_privilege('anon', p.oid, 'execute')), 'OK 0');
 -- Les politiques fonctionnent toujours (elles appellent les fonctions du schéma privé).
 perform t.expect('S6 B (Paris) voit encore l''annonce de C', t.as(t.u(2), format('select count(*) from public.posts where author = %L', t.u(3))), 'OK 1');
 perform t.expect('S6 B voit le profil de C (annonce visible)', t.as(t.u(2), format('select pseudo from public.profiles where user_id = %L', t.u(3))), 'OK Carole');
 perform t.expect('S6 B ouvre une conversation avec C (neighbors_can_contact via la politique)',
   t.as(t.u(2), format('insert into public.threads(user_a,user_b) values (%L,%L)', least(t.u(2), t.u(3)), greatest(t.u(2), t.u(3)))), 'OK rows=1');
 perform t.expect('S6 B lit cette conversation', t.as(t.u(2), 'select count(*) from public.threads'), 'OK 1');
 perform t.expect('S6 B n''ouvre pas de conversation avec D (Marseille, invisible)',
   t.as(t.u(2), format('insert into public.threads(user_a,user_b) values (%L,%L)', least(t.u(2), t.u(4)), greatest(t.u(2), t.u(4)))), 'ERR 42501');
 perform t.expect('S6 B bloque C', t.as(t.u(2), format('insert into public.blocks(blocked) values (%L)', t.u(3))), 'OK rows=1');
 perform t.expect('S6 ... B ne voit plus l''annonce de C (blocage appliqué par la politique)', t.as(t.u(2), format('select count(*) from public.posts where author = %L', t.u(3))), 'OK 0');
 perform t.expect('S6 ... ni son profil', t.as(t.u(2), format('select count(*) from public.profiles where user_id = %L', t.u(3))), 'OK 0');
 perform t.expect('S6 ... ni la conversation', t.as(t.u(2), 'select count(*) from public.threads'), 'OK 0');
 perform t.expect('S6 ... et C ne voit plus B (blocage dans l''autre sens)', t.as(t.u(3), format('select count(*) from public.profiles where user_id = %L', t.u(2))), 'OK 0');
 perform set_config('request.jwt.claim.sub', '', true);
 delete from public.blocks;

 -- =====================================================================
 -- S7 : contrôles et marques de direction refusés au niveau SQL
 -- =====================================================================
 perform t.expect('S7 les 9 contraintes de texte existent et sont validées',
   (select 'OK '||count(*) from pg_constraint where conname like '%\_text\_check' and convalidated), 'OK 9');
 perform t.expect('S7 A (Lyon) crée une question légitime', t.as(t.u(1), 'insert into public.posts(kind,title,body) values (''question'',''Quand tailler ?'',''Ligne 1''||chr(10)||''Ligne 2 : œuf, été, 👩‍🌾 (emoji avec liant), مرحبا'')'), 'OK rows=1');
 perform t.expect('S7 retour à la ligne, emoji à liant U+200D et texte arabe sans marque : acceptés', (select 'OK '||count(*) from public.posts where author = t.u(1) and body like '%'||chr(8205)||'%'), 'OK 1');
 foreach h in array hostile loop
   r := t.as(t.u(1), format('insert into public.posts(kind,title) values (''don'', %L)', 'Titre' || h || 'piégé'));
   if left(r, 9) <> 'ERR 23514' then raise notice 'FAIL  S7 titre d''annonce avec U+% accepté -> %', to_hex(ascii(h)), r; else raise notice 'PASS  S7 titre refusé U+%', to_hex(ascii(h)); end if;
   r := t.as(t.u(1), format('insert into public.posts(kind,title,body) values (''don'',''ok'', %L)', 'Texte' || h || 'piégé'));
   if left(r, 9) <> 'ERR 23514' then raise notice 'FAIL  S7 texte d''annonce avec U+% accepté -> %', to_hex(ascii(h)), r; else raise notice 'PASS  S7 texte refusé U+%', to_hex(ascii(h)); end if;
 end loop;
 perform t.expect('S7 le retour à la ligne seul passe (U+000A)', t.as(t.u(1), 'insert into public.posts(kind,title,body) values (''don'',''Graines'',''a''||chr(10)||''b'')'), 'OK rows=1');
 select id into id1 from public.posts where author = t.u(1) and kind = 'question';
 -- Réponses
 perform t.expect('S7 réponse légitime', t.as(t.u(1), format('insert into public.replies(post_id,body) values (%L,''Au printemps'')', id1)), 'OK rows=1');
 foreach h in array array[chr(8238), chr(8206), chr(13), chr(0 + 7), chr(8297)] loop
   r := t.as(t.u(1), format('insert into public.replies(post_id,body) values (%L,%L)', id1, 'Réponse' || h || 'piégée'));
   if left(r, 9) <> 'ERR 23514' then raise notice 'FAIL  S7 réponse avec U+% acceptée -> %', to_hex(ascii(h)), r; else raise notice 'PASS  S7 réponse refusée U+%', to_hex(ascii(h)); end if;
 end loop;
 -- Messages (A et B doivent avoir une conversation : B a bloqué C puis débloqué ; utiliser A <-> D n'est pas possible : on prend B <-> C)
 select id into id2 from public.threads limit 1;
 perform t.expect('S7 message légitime', t.as(t.u(2), format('insert into public.messages(thread_id,body) values (%L,''Bonjour''||chr(10)||''à bientôt'')', id2)), 'OK rows=1');
 foreach h in array hostile loop
   r := t.as(t.u(2), format('insert into public.messages(thread_id,body) values (%L,%L)', id2, 'Salut' || h || 'toi'));
   if left(r, 9) <> 'ERR 23514' then raise notice 'FAIL  S7 message avec U+% accepté -> %', to_hex(ascii(h)), r; else raise notice 'PASS  S7 message refusé U+%', to_hex(ascii(h)); end if;
 end loop;
 -- Signalement : précisions
 perform t.expect('S7 précisions piégées (inversion de sens)', t.as(t.u(2), format('insert into public.reports(target_kind,target_id,reason,details) values (''post'',%L,''spam'',%L)', (select id from public.posts where author = t.u(3) limit 1), 'a'||chr(8238)||'b')), 'ERR 23514');
 perform t.expect('S7 précisions légitimes', t.as(t.u(2), format('insert into public.reports(target_kind,target_id,reason,details) values (''post'',%L,''spam'',''Vend des plants'')', (select id from public.posts where author = t.u(3) limit 1))), 'OK rows=1');
 -- Événements et organisateurs
 perform t.expect('S7 organisateur : description piégée', t.as(t.u(3), format('insert into public.organizers(user_id,name,description) values (%L,''Jardins du coin'',%L)', t.u(3), 'Asso'||chr(8238)||'x')), 'ERR 23514');
 perform t.expect('S7 organisateur : description légitime', t.as(t.u(3), format('insert into public.organizers(user_id,name,description) values (%L,''Jardins du coin'',''Asso de quartier'')', t.u(3))), 'OK rows=1');
 perform set_config('request.jwt.claim.sub', '', true);
 update public.organizers set verified_at = now() where user_id = t.u(3);
 perform t.expect('S7 événement légitime', t.as(t.u(3), 'insert into public.events(title,description,starts_at,ends_at,place) values (''Troc'',''Apportez vos graines''||chr(10)||''Merci'',now()+interval ''2 days'',now()+interval ''2 days 2 hours'',''Salle des fêtes'')'), 'OK rows=1');
 perform t.expect('S7 événement : titre piégé', t.as(t.u(3), format('insert into public.events(title,starts_at,ends_at,place) values (%L,now()+interval ''2 days'',now()+interval ''3 days'',''Salle'')', 'Troc'||chr(8238)||'x')), 'ERR 23514');
 perform t.expect('S7 événement : description piégée', t.as(t.u(3), format('insert into public.events(title,description,starts_at,ends_at,place) values (''T'',%L,now()+interval ''2 days'',now()+interval ''3 days'',''Salle'')', 'a'||chr(8207)||'b')), 'ERR 23514');
 perform t.expect('S7 événement : lieu piégé', t.as(t.u(3), format('insert into public.events(title,starts_at,ends_at,place) values (''T'',now()+interval ''2 days'',now()+interval ''3 days'',%L)', 'Salle'||chr(0 + 27))), 'ERR 23514');

 -- =====================================================================
 -- S9 : extrait du contenu signalé
 -- =====================================================================
 perform t.mk(10, 'Auteur', 48.86, 2.34); perform t.mk(11, 'Signaleur', 48.86, 2.34); perform t.mk(12, 'Signaleur2', 48.86, 2.34);
 perform t.as(t.u(10), format('insert into public.posts(kind,title,body) values (''don'',''Plants douteux'',%L)', repeat('x', 900)));
 select id into id1 from public.posts where author = t.u(10);
 perform t.expect('S9 signalement d''annonce', t.as(t.u(11), format('insert into public.reports(target_kind,target_id,reason) values (''post'',%L,''commerce'')', id1)), 'OK rows=1');
 perform t.expect('S9 extrait pris au signalement : titre, retour à la ligne, texte, 500 caractères au plus',
   (select 'OK '||left(snapshot, 15)||'|'||char_length(snapshot) from public.reports where target_id = id1), 'OK Plants douteux'||chr(10)||'|500');
 perform t.expect('S9 l''auteur supprime l''annonce', t.as(t.u(10), 'delete from public.posts'), 'OK rows=1');
 perform t.expect('S9 ... la preuve reste dans le signalement', (select 'OK '||(snapshot like 'Plants douteux%') from public.reports where target_id = id1), 'OK true');
 perform t.expect('S9 le signalement existe toujours (cible disparue)', (select 'OK '||count(*) from public.reports where target_id = id1), 'OK 1');
 perform t.as(t.u(10), 'insert into public.posts(kind,title,body) values (''question'',''Avis ?'',''Court'')');
 select id into id2 from public.posts where author = t.u(10);
 perform t.expect('S9 réponse signalée : extrait = texte de la réponse', t.as(t.u(12), format('insert into public.replies(post_id,body) values (%L,''Contenu de la réponse'')', id2)), 'OK rows=1');
 perform t.expect('S9 signalement de la réponse', t.as(t.u(11), format('insert into public.reports(target_kind,target_id,reason) values (''reply'',%L,''abus'')', (select id from public.replies where author = t.u(12)))), 'OK rows=1');
 perform t.expect('S9 ... extrait de la réponse', (select 'OK '||snapshot from public.reports where target_kind = 'reply' and reporter = t.u(11)), 'OK Contenu de la réponse');
 perform t.expect('S9 signalement de profil : extrait = pseudo', t.as(t.u(11), format('insert into public.reports(target_kind,target_id,reason) values (''profile'',%L,''abus'')', t.u(12))), 'OK rows=1');
 perform t.expect('S9 ... extrait du profil', (select 'OK '||snapshot from public.reports where target_kind = 'profile' and reporter = t.u(11)), 'OK Signaleur2');
 perform t.expect('S9 signalement d''événement : extrait = titre + description', t.as(t.u(2), format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''spam'')', (select id from public.events limit 1))), 'OK rows=1');
 perform t.expect('S9 ... extrait de l''événement', (select 'OK '||replace(snapshot, chr(10), '/') from public.reports where target_kind = 'event' and reporter = t.u(2)), 'OK Troc/Apportez vos graines'||'/Merci');
 perform t.expect('S9 signalement de message : extrait = texte du message', t.as(t.u(3), format('insert into public.reports(target_kind,target_id,reason) values (''message'',%L,''abus'')', (select id from public.messages limit 1))), 'OK rows=1');
 perform t.expect('S9 ... extrait du message', (select 'OK '||replace(snapshot, chr(10), '/') from public.reports where target_kind = 'message' and reporter = t.u(3)), 'OK Bonjour/à bientôt');
 -- Le client ne choisit pas l'extrait et ne le relit pas.
 perform t.expect('S9 le client ne peut pas écrire l''extrait', t.as(t.u(12), format('insert into public.reports(target_kind,target_id,reason,snapshot) values (''post'',%L,''spam'',''faux'')', id2)), 'ERR 42501');
 perform t.expect('S9 le client ne relit pas l''extrait', t.as(t.u(11), 'select snapshot from public.reports'), 'ERR 42501');
 perform t.expect('S9 select * sur reports refusé', t.as(t.u(11), 'select * from public.reports'), 'ERR 42501');
 perform t.expect('S9 le client relit encore ses colonnes habituelles', t.as(t.u(11), 'select count(id) from public.reports'), 'OK 3');
 perform t.expect('S9 il ne modifie pas l''extrait', t.as(t.u(11), 'update public.reports set snapshot = null'), 'ERR 42501');
 perform t.expect('S9 il ne supprime pas ses signalements', t.as(t.u(11), 'delete from public.reports'), 'ERR 42501');
  perform t.expect('S9 aucun extrait ne dépasse 500 caractères', (select 'OK '||count(*) from public.reports where char_length(snapshot) > 500), 'OK 0');
 -- Compte supprimé : le signalement (et sa preuve) survit à la disparition de l'auteur du contenu.
 perform t.as(t.u(10), 'insert into public.posts(kind,title) values (''don'',''Autre contenu'')');
 id1 := (select id from public.posts where author = t.u(10) and title = 'Autre contenu');
 perform t.as(t.u(12), format('insert into public.reports(target_kind,target_id,reason) values (''post'',%L,''spam'')', id1));
 perform set_config('request.jwt.claim.sub', '', true);
 delete from auth.users where id = t.u(10);
 perform t.expect('S9 compte de l''auteur supprimé : la preuve reste', (select 'OK '||snapshot from public.reports where target_id = id1), 'OK Autre contenu');

 -- =====================================================================
 -- S4 : droits de la purge (clé service_role seulement)
 -- =====================================================================
 perform t.expect('S4 service_role peut purger', (select 'OK '||has_function_privilege('service_role', 'public.neighbors_purge_expired()', 'execute')), 'OK true');
 perform t.expect('S4 service_role peut lister les orphelins', (select 'OK '||has_function_privilege('service_role', 'public.neighbors_orphan_photos()', 'execute')), 'OK true');
 perform t.expect('S4 un connecté ne purge pas', t.as(t.u(3), 'select public.neighbors_purge_expired()'), 'ERR 42501');
 perform t.expect('S4 anon ne purge pas', t.as(null, 'select public.neighbors_purge_expired()'), 'ERR 42501');
 perform t.expect('S4 un connecté ne liste pas les orphelins', t.as(t.u(3), 'select public.neighbors_orphan_photos()'), 'ERR 42501');
 perform t.expect('S4 anon ne liste pas les orphelins', t.as(null, 'select public.neighbors_orphan_photos()'), 'ERR 42501');
 perform set_config('request.jwt.claim.sub', '', true);
 insert into public.posts(author, kind, title, photo_path) values (t.u(3), 'don', 'Avec photo', t.u(3)::text || '/11111111-1111-4111-8111-111111111111.jpg');
 insert into storage.objects(bucket_id, name, created_at) values
   ('neighbors-photos', t.u(3)::text || '/11111111-1111-4111-8111-111111111111.jpg', now() - interval '3 days'),   -- référencée
   ('neighbors-photos', t.u(3)::text || '/22222222-2222-4222-8222-222222222222.jpg', now() - interval '3 days'),   -- orpheline
   ('neighbors-photos', t.u(3)::text || '/33333333-3333-4333-8333-333333333333.jpg', now() - interval '1 hour');   -- trop récente
 perform t.expect('S4 la liste d''orphelins ne contient que la photo ancienne que plus rien ne référence',
   (select 'OK '||string_agg(split_part(o, '/', 2), ',') from public.neighbors_orphan_photos() o), 'OK 22222222-2222-4222-8222-222222222222.jpg');
end $$;
