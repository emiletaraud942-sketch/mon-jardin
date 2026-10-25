-- Scénarios de la version 6 : quartier de 2 km (« standard ») ou 5 km (« large »). Base JETABLE uniquement.
-- Lancé par run.sh en dernier. Chaque ligne PASS/FAIL est une règle ou une attaque vérifiée.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
\set D '''dddddddd-0000-4000-8000-000000000004'''
\set E '''eeeeeeee-0000-4000-8000-000000000005'''
\set F '''ffffffff-0000-4000-8000-000000000006'''
\set G '''99999999-0000-4000-8000-000000000007'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr'),(:D,'d@x.fr'),(:E,'e@x.fr'),(:F,'f@x.fr'),(:G,'g@x.fr');

create or replace function t.prof(uid uuid, nm text, lat text, lon text, size text default null) returns text language sql as $$
  select case when size is null
    then format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,%s,%s)', uid, nm, lat, lon)
    else format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon,cell_size) values (%L,%L,%s,%s,%L)', uid, nm, lat, lon, size) end $$;

do $$
declare
  A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
  D uuid:='dddddddd-0000-4000-8000-000000000004'; E uuid:='eeeeeeee-0000-4000-8000-000000000005'; F uuid:='ffffffff-0000-4000-8000-000000000006';
  G uuid:='99999999-0000-4000-8000-000000000007'; i int; r text;
begin
 -- ===== Arrondi selon la taille =====
 perform t.expect('V6 A standard : 48.8566 / 2.3522 -> 48.86 / 2.34', t.as(A, t.prof(A,'Alice','48.8566','2.3522','standard')), 'OK rows=1');
 perform t.expect('V6 ... cellule standard', t.as(A,'select cell_lat||'' ''||cell_lon||'' ''||cell_size from public.profiles where user_id='||quote_literal(A)), 'OK 48.86 2.34 standard');
 perform t.expect('V6 B sans cell_size : défaut standard', t.as(B, t.prof(B,'Bob','48.8566','2.3522')), 'OK rows=1');
 perform t.expect('V6 ... défaut = standard, même cellule', t.as(B,'select cell_lat||'' ''||cell_lon||'' ''||cell_size from public.profiles where user_id='||quote_literal(B)), 'OK 48.86 2.34 standard');
 perform t.expect('V6 C large : 48.8566 / 2.3522 -> 48.85 / 2.38', t.as(C, t.prof(C,'Carole','48.8566','2.3522','large')), 'OK rows=1');
 perform t.expect('V6 ... cellule large', t.as(C,'select cell_lat||'' ''||cell_lon||'' ''||cell_size from public.profiles where user_id='||quote_literal(C)), 'OK 48.85 2.38 large');

 -- ===== cell_size invalide =====
 perform t.expect('V6 cell_size « huge » refusé', t.as(D, t.prof(D,'Denis','48.86','2.34','huge')), 'ERR 23514');
 perform t.expect('V6 cell_size « LARGE » (casse) refusé', t.as(D, t.prof(D,'Denis','48.86','2.34','LARGE')), 'ERR 23514');
 perform t.expect('V6 cell_size vide refusé', t.as(D, t.prof(D,'Denis','48.86','2.34','')), 'ERR 23514');
 perform t.expect('V6 cell_size injection refusé', t.as(D, t.prof(D,'Denis','48.86','2.34','large''; drop table public.posts; --')), 'ERR 23514');
 perform t.expect('V6 cell_size NULL refusé', t.as(D, format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon,cell_size) values (%L,%L,48.86,2.34,null)', D,'Denis')), 'ERR 23502');
 perform t.expect('V6 aucun profil créé par ces essais', (select 'OK '||count(*) from public.profiles where user_id = D), 'OK 0');
 perform t.expect('V6 la table des annonces existe toujours', (select 'OK '||count(*) from public.posts), 'OK 0');

 -- ===== Cellule forgée hors grille : ramenée sur la grille de la taille choisie =====
 perform t.expect('V6 D large avec une valeur de grille 0,01°', t.as(D, t.prof(D,'Denis','47.2234','2.0677','large')), 'OK rows=1');
 perform t.expect('V6 ... ramenée sur la grille large (47.20 ; 2.10)',
   (select 'OK '||(((cell_lat*100)::int % 5 = 0) and ((cell_lon*100)::int % 7 = 0))||' '||cell_lat||' '||cell_lon from public.profiles where user_id = D), 'OK true 47.20 2.10');
 perform t.expect('V6 E standard avec 7 décimales', t.as(E, t.prof(E,'Eloise','45.1234567','5.7654321','standard')), 'OK rows=1');
 perform t.expect('V6 ... sur la grille standard', (select 'OK '||(((cell_lat*100)::int % 2 = 0) and ((cell_lon*100)::int % 3 = 0))||' '||cell_lat||' '||cell_lon from public.profiles where user_id = E), 'OK true 45.12 5.76');
 perform t.expect('V6 hors bornes (90,01 standard -> 90,02) refusé', t.as(F, t.prof(F,'Fabrice','90.01','2.34','standard')), 'ERR 23514');
 perform t.expect('V6 pôle 90 large accepté', t.as(F, t.prof(F,'Fabrice','89.99','179.99','large')), 'OK rows=1');
 perform t.expect('V6 ... 89.99 -> 90.00 ; 179.99 -> 179.97', (select 'OK '||cell_lat||' '||cell_lon from public.profiles where user_id = F), 'OK 90.00 179.97');
 perform t.expect('V6 G hémisphère sud, égalité : -33.87 / 151.21 standard', t.as(G, t.prof(G,'Gaston','-33.87','151.21','standard')), 'OK rows=1');
 perform t.expect('V6 ... -33.86 / 151.20', (select 'OK '||cell_lat||' '||cell_lon from public.profiles where user_id = G), 'OK -33.86 151.20');
 perform t.expect('V6 jamais de -0 (cellule autour de 0)', t.as(E, 'update public.profiles set cell_lat = -0.004, cell_lon = 0.01'), 'OK rows=1');
 perform t.expect('V6 ... 0.00 / 0.00 (pas de « -0.00 »)', (select 'OK '||cell_lat||' '||cell_lon from public.profiles where user_id = E), 'OK 0.00 0.00');
 perform t.as(E, 'update public.profiles set cell_lat = 45.12, cell_lon = 5.76');

 -- ===== Droits sur la colonne =====
 perform t.expect('V6 anon ne lit pas cell_size', t.as(null,'select cell_size from public.profiles'), 'ERR 42501');
 perform t.expect('V6 anon n''écrit pas cell_size', t.as(null, t.prof(D,'Denis','48.86','2.34','large')), 'ERR 42501');
 perform t.expect('V6 un membre lit sa propre taille', t.as(C,'select cell_size from public.profiles where user_id='||quote_literal(C)), 'OK large');
 perform t.expect('V6 select * sur profils reste refusé (banned_at protégé)', t.as(A,'select * from public.profiles'), 'ERR 42501');

 -- ===== Passage de la cellule d'autrui =====
 perform t.expect('V6 A ne peut pas passer le profil de C en standard', t.as(A, format('update public.profiles set cell_size=%L where user_id=%L','standard',C)), 'OK rows=0');
 perform t.expect('V6 ... C est toujours large', (select 'OK '||cell_size||' '||cell_lat from public.profiles where user_id = C), 'OK large 48.85');
 perform t.expect('V6 A ne peut pas déplacer la cellule de C', t.as(A, format('update public.profiles set cell_lat=10 where user_id=%L',C)), 'OK rows=0');
 perform t.expect('V6 A ne crée pas un profil au nom de C', t.as(A, t.prof(C,'Usurpateur','48.86','2.34','large')), 'ERR 42501');
 perform t.expect('V6 A ne peut pas écrire banned_at', t.as(A, 'update public.profiles set banned_at = null'), 'ERR 42501');
 perform t.expect('V6 le quota de C n''a pas bougé', (select 'OK '||count(*) from public.quotas where user_id = C), 'OK 0');

 -- ===== Contournement du quota (5 modifications par jour) =====
 -- Changer seulement de taille, en renvoyant la même cellule, doit coûter une modification.
 perform t.expect('V6 B change de taille sans toucher à la cellule : compté (1)', t.as(B,'update public.profiles set cell_size=''large'''), 'OK rows=1');
 perform t.expect('V6 ... quota pris', (select 'OK '||n from public.quotas where user_id = B and action='profile'), 'OK 1');
 perform t.expect('V6 ... B est large, cellule recalculée sur la grille large', (select 'OK '||cell_size||' '||((cell_lat*100)::int % 5 = 0 and (cell_lon*100)::int % 7 = 0) from public.profiles where user_id = B), 'OK large true');
 perform t.expect('V6 B re-envoie la même valeur : pas de modification, pas de quota', t.as(B,'update public.profiles set cell_size=''large'', cell_lat = cell_lat + 0.004'), 'OK rows=1');
 perform t.expect('V6 ... quota toujours à 1 (valeur arrondie identique)', (select 'OK '||n from public.quotas where user_id = B and action='profile'), 'OK 1');
 for i in 1..4 loop
   perform t.as(B, format('update public.profiles set cell_size=%L', case when i % 2 = 1 then 'standard' else 'large' end));
 end loop;
 perform t.expect('V6 B : 5 modifications consommées', (select 'OK '||n from public.quotas where user_id = B and action='profile'), 'OK 5');
 perform t.expect('V6 B : la 6e (taille seule) est refusée', t.as(B,'update public.profiles set cell_size=''standard'''), 'ERR P0001 quota_exceeded:profile');
 perform t.expect('V6 B : la 6e (cellule seule) est refusée aussi', t.as(B,'update public.profiles set cell_lat = cell_lat + 1'), 'ERR P0001 quota_exceeded:profile');
 perform t.expect('V6 B : le pseudo aussi', t.as(B,'update public.profiles set pseudo = ''Bobby'''), 'ERR P0001 quota_exceeded:profile');
 perform t.expect('V6 B : rien n''a changé après les refus', (select 'OK '||pseudo||' '||cell_size from public.profiles where user_id = B), 'OK Bob large');
 -- Une valeur hors grille qui arrondit à la même cellule ne permet pas non plus de « glisser » la cellule sans quota.
 perform t.expect('V6 A glisse de 0,004 (valeur hors grille) : cellule inchangée', t.as(A,'update public.profiles set cell_lat = cell_lat + 0.004'), 'OK rows=1');
 perform t.expect('V6 ... A reste en 48.86 (0,004 arrondi puis ramené sur la grille)', (select 'OK '||cell_lat from public.profiles where user_id = A), 'OK 48.86');
 perform t.expect('V6 ... aucun quota pris par A', (select 'OK '||count(*) from public.quotas where user_id = A and action='profile'), 'OK 0');
 -- (0,02 d'écart = une vraie modification, donc comptée)
 perform t.expect('V6 A vraie modification de cellule : comptée', t.as(A,'update public.profiles set cell_lat = 48.90'), 'OK rows=1');
 perform t.expect('V6 ... quota pris', (select 'OK '||n from public.quotas where user_id = A and action='profile'), 'OK 1');
 perform t.expect('V6 ... cellule 48.90', (select 'OK '||cell_lat from public.profiles where user_id = A), 'OK 48.90');
 perform t.as(A, 'update public.profiles set cell_lat = 48.86');

 -- ===== Fonctions internes non appelables =====
 perform t.expect('V6 neighbors_cell_snap non appelable par un membre', t.as(A,'select public.neighbors_cell_snap(48.8, ''standard'', ''lat'')'), 'ERR 42501');
 perform t.expect('V6 neighbors_cell_snap non appelable en anonyme', t.as(null,'select public.neighbors_cell_snap(48.8, ''standard'', ''lat'')'), 'ERR 42501');
 perform t.expect('V6 neighbors_profile_round non appelable', t.as(A,'select public.neighbors_profile_round()'), 'ERR 42501');

 -- ===== Annonces et événements =====
 perform t.expect('V6 A publie : cellule copiée du profil (standard)', t.as(A,'insert into public.posts(kind,title) values (''don'',''Boutures'')'), 'OK rows=1');
 perform t.expect('V6 ... 48.86 2.34', (select 'OK '||cell_lat||' '||cell_lon from public.posts where author = A), 'OK 48.86 2.34');
 perform t.expect('V6 A ne force pas la cellule de l''annonce', t.as(A,'insert into public.posts(kind,title,cell_lat,cell_lon) values (''don'',''x'',48.8566,2.3522)'), 'ERR 42501');
 perform t.expect('V6 A ne modifie pas la cellule d''une annonce', t.as(A,'update public.posts set cell_lat = 10'), 'ERR 42501');
 perform t.expect('V6 C (large) publie : cellule large', t.as(C,'insert into public.posts(kind,title) values (''don'',''Graines'')'), 'OK rows=1');
 perform t.expect('V6 ... 48.85 2.38', (select 'OK '||cell_lat||' '||cell_lon from public.posts where author = C), 'OK 48.85 2.38');
 perform t.expect('V6 A passe en large : ses anciennes annonces gardent leur cellule', t.as(A,'update public.profiles set cell_size=''large'''), 'OK rows=1');
 perform t.expect('V6 ... ancienne annonce inchangée (48.86 2.34)', (select 'OK '||cell_lat||' '||cell_lon from public.posts where author = A), 'OK 48.86 2.34');
 perform t.expect('V6 A (large) publie : nouvelle cellule large', t.as(A,'insert into public.posts(kind,title) values (''don'',''Pots'')'), 'OK rows=1');
 perform t.expect('V6 ... sur la grille large', (select 'OK '||count(*) from public.posts where author = A and (cell_lat*100)::int % 5 = 0 and (cell_lon*100)::int % 7 = 0), 'OK 1');
 perform t.expect('V6 un membre lit cell_size d''un voisin dont il voit l''annonce', t.as(A,'select cell_size from public.profiles where user_id='||quote_literal(C)), 'OK large');
 perform t.expect('V6 A lit l''annonce de C (large) et la sienne', t.as(A,'select count(*) from public.posts'), 'OK 3');
 -- Organisateur
 perform t.expect('V6 C demande à être organisateur', t.as(C, format('insert into public.organizers(user_id,name) values (%L,%L)', C, 'Jardins du coin')), 'OK rows=1');
 perform set_config('request.jwt.claim.sub', '', true);   -- éditeur : auth.uid() vide
 update public.organizers set verified_at = now() where user_id = C;
 perform t.expect('V6 organisateur large : événement', t.as(C,'insert into public.events(title,starts_at,ends_at,place) values (''Troc'',now()+interval ''2 days'',now()+interval ''2 days 1 hour'',''Salle'')'), 'OK rows=1');
 perform t.expect('V6 ... cellule large copiée', (select 'OK '||cell_lat||' '||cell_lon from public.events where organizer = C), 'OK 48.85 2.38');

 -- ===== Visibilité (environ 55 km) avec les nouvelles cellules =====
 -- C est en 48.85 / 2.38 (large). Voisins de test : à 0,45° de latitude (50 km) et à 0,60° (67 km).
 perform t.as(F, 'update public.profiles set cell_lat = 48.85, cell_lon = 2.38, cell_size = ''large''');
 perform t.expect('V6 F (large, 48.85 2.38) voit l''annonce de C (même cellule)', t.as(F,'select count(*) from public.posts where author = '||quote_literal(C)), 'OK 1');
 perform t.as(G, 'update public.profiles set cell_lat = 49.30, cell_lon = 2.38, cell_size = ''large''');
 perform t.expect('V6 G (large, 0,45° au nord = 50 km) voit l''annonce de C', t.as(G,'select count(*) from public.posts where author = '||quote_literal(C)), 'OK 1');
 perform t.as(G, 'update public.profiles set cell_lat = 49.45, cell_lon = 2.38, cell_size = ''large''');
 perform t.expect('V6 G à 0,60° au nord (67 km) ne voit plus C', t.as(G,'select count(*) from public.posts where author = '||quote_literal(C)), 'OK 0');
 perform t.expect('V6 ... ni son profil', t.as(G,'select count(*) from public.profiles where user_id = '||quote_literal(C)), 'OK 0');
 perform t.expect('V6 ... ni l''événement', t.as(G,'select count(*) from public.events'), 'OK 0');
 perform t.expect('V6 G ne peut pas écrire à C', t.as(G, format('select public.neighbors_can_contact(%L)', C)), 'OK false');
 -- Un standard au bord de la fenêtre (0,50° exactement) voit encore ; au-delà, non.
 perform t.as(G, 'update public.profiles set cell_lat = 49.34, cell_lon = 2.37, cell_size = ''standard''');
 perform t.expect('V6 G standard à 0,49° (54,6 km) voit C', t.as(G,'select count(*) from public.posts where author = '||quote_literal(C)), 'OK 1');
 perform t.expect('V6 ... et l''événement', t.as(G,'select count(*) from public.events'), 'OK 1');
 -- Longitude : fenêtre 0,55° / cos(lat) = 0,84° à 48,85° N
 perform t.as(G, 'update public.profiles set cell_lat = 48.85, cell_lon = 3.15, cell_size = ''large''');
 perform t.expect('V6 G 0,77° à l''est (56 km) voit encore C (fenêtre est-ouest)', t.as(G,'select count(*) from public.posts where author = '||quote_literal(C)), 'OK 1');
 perform t.as(G, 'update public.profiles set cell_lat = 48.85, cell_lon = 3.43, cell_size = ''large''');
 perform t.expect('V6 G 1,05° à l''est (77 km) ne voit plus C', t.as(G,'select count(*) from public.posts where author = '||quote_literal(C)), 'OK 0');
end $$;
