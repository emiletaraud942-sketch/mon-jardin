-- Scénarios de la version 10 : liste publique d'événements (neighbors_public_events), lisible SANS compte.
-- Base JETABLE uniquement (vide auth.users). Lancé par run.sh en dernier, APRÈS la v10. Chaque ligne PASS/FAIL est une règle ou une attaque vérifiée.
create or replace function t.u10(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000010' || lpad(n::text, 2, '0'))::uuid $$;
-- Profil créé par la personne elle-même, puis organisateur (en attente) créé par elle aussi.
create or replace function t.org10(n int, nm text, lat numeric, lon numeric) returns void language plpgsql as $$
begin
  perform t.as(t.u10(n), format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,%s,%s)', t.u10(n), 'Pseudo' || n, lat, lon));
  perform t.as(t.u10(n), format('insert into public.organizers(user_id,name) values (%L,%L)', t.u10(n), nm));
end $$;

truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id, email) select t.u10(n), 'u' || n || '@x.fr' from generate_series(1, 12) n;

do $$
declare
  r text; a text; b text;
begin
 -- Organisateurs : 1 Paris (validé), 2 Paris (en attente), 3 Paris (validé puis banni), 4 Lyon (validé), 5 Orléans (validé, ≈ 100 km),
 -- 6 Versailles (validé, ≈ 17 km). 7 est un simple membre de Paris, sans organisation.
 perform t.org10(1, 'Les Jardiniers du quartier', 48.86, 2.35);
 perform t.org10(2, 'En attente', 48.86, 2.35);
 perform t.org10(3, 'Futur banni', 48.86, 2.35);
 perform t.org10(4, 'Jardin partagé de Lyon', 45.76, 4.83);
 perform t.org10(5, 'Association d''Orléans', 47.90, 1.90);
 perform t.org10(6, 'Verger de Versailles', 48.80, 2.13);
 perform t.as(t.u10(7), format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.86,2.35)', t.u10(7), 'Simple membre'));
 -- Validation par l'éditeur (auth.uid() vide), puis bannissement de 3.
 perform set_config('request.jwt.claim.sub', '', true);
 update public.organizers set verified_at = now() where user_id in (t.u10(1), t.u10(3), t.u10(4), t.u10(5), t.u10(6));
 update public.profiles set banned_at = now() where user_id = t.u10(3);

 -- Événements écrits par l'éditeur (le déclencheur d'insertion est coupé : on fixe statut, dates et cellule pour le test).
 alter table public.events disable trigger neighbors_event_before_insert;
 insert into public.events(organizer, title, starts_at, ends_at, place, cell_lat, cell_lon, status, signup_url, description) values
  (t.u10(1), 'Ouvert dans 3 jours',   now() + interval '3 days',   now() + interval '3 days 2 hours',   'Square des Lilas', 48.86, 2.35, 'open',      'https://exemple.fr/inscription', 'Description privée'),
  (t.u10(1), 'Ouvert demain',          now() + interval '1 day',    now() + interval '1 day 2 hours',    'Place du marché',  48.86, 2.35, 'open',      null, ''),
  (t.u10(1), 'Masqué',                 now() + interval '2 days',   now() + interval '2 days 2 hours',   'Ailleurs',         48.86, 2.35, 'hidden',    null, ''),
  (t.u10(1), 'Annulé',                 now() + interval '2 days',   now() + interval '2 days 2 hours',   'Ailleurs',         48.86, 2.35, 'cancelled', null, ''),
  (t.u10(1), 'Déjà fini',              now() - interval '2 days',   now() - interval '1 day',            'Ailleurs',         48.86, 2.35, 'open',      null, ''),
  (t.u10(1), 'Trop loin dans le temps', now() + interval '120 days', now() + interval '120 days 2 hours', 'Ailleurs',         48.86, 2.35, 'open',      null, ''),
  (t.u10(2), 'Organisateur en attente', now() + interval '2 days',   now() + interval '2 days 2 hours',   'Ailleurs',         48.86, 2.35, 'open',      null, ''),
  (t.u10(3), 'Organisateur banni',      now() + interval '2 days',   now() + interval '2 days 2 hours',   'Ailleurs',         48.86, 2.35, 'open',      null, ''),
  (t.u10(4), 'À Lyon',                  now() + interval '2 days',   now() + interval '2 days 2 hours',   'Parc de Lyon',     45.76, 4.83, 'open',      null, ''),
  (t.u10(5), 'À Orléans',               now() + interval '2 days',   now() + interval '2 days 2 hours',   'Jardin d''Orléans', 47.90, 1.90, 'open',     null, ''),
  (t.u10(6), 'À Versailles',            now() + interval '4 days',   now() + interval '4 days 2 hours',   'Potager du Roi',   48.80, 2.13, 'open',      null, '');
 alter table public.events enable trigger neighbors_event_before_insert;

 -- ===== Droits : aucun accès direct aux tables pour anon, une seule fonction =====
 perform t.expect('V10 anon ne lit pas la table events', t.as(null, 'select count(*) from public.events'), 'ERR 42501');
 perform t.expect('V10 anon ne lit pas la table organizers', t.as(null, 'select count(*) from public.organizers'), 'ERR 42501');
 perform t.expect('V10 anon ne lit pas la table profiles', t.as(null, 'select count(*) from public.profiles'), 'ERR 42501');
 perform t.expect('V10 anon n''écrit pas dans events', t.as(null, 'delete from public.events'), 'ERR 42501');
 perform t.expect('V10 anon peut appeler la fonction', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35)'), 'OK ');
 perform t.expect('V10 la fonction est la seule de l''API ouverte à anon dans l''entraide (hors 3 ci-dessous : aucune autre)',
   (select 'OK ' || coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'neighbors\_%' and has_function_privilege('anon', p.oid, 'execute')), 'OK neighbors_public_events');
 perform t.expect('V10 aucune fonction de neighbors_private n''est ouverte à anon',
   (select 'OK ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'neighbors_private' and has_function_privilege('anon', p.oid, 'execute')), 'OK 0');
 perform t.expect('V10 colonnes rendues : titre, dates, lieu, organisateur (ni id, ni description, ni lien, ni cellule, ni distance)',
   (select 'OK ' || pg_get_function_result('public.neighbors_public_events(numeric,numeric)'::regprocedure)),
   'OK TABLE(title text, starts_at timestamp with time zone, ends_at timestamp with time zone, place text, organizer_name text)');
 perform t.expect('V10 la fonction est en lecture seule (stable)', (select 'OK ' || provolatile::text from pg_proc where proname = 'neighbors_public_events'), 'OK s');

 -- ===== Ce qui est visible depuis Paris =====
 perform t.expect('V10 depuis Paris : 3 événements (3 jours, demain, Versailles à 17 km)', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35)'), 'OK 3');
 perform t.expect('V10 triés par date : demain, 3 jours, Versailles', t.as(null, 'select title from public.neighbors_public_events(48.86, 2.35)'), E'OK Ouvert demain\nOuvert dans 3 jours\nÀ Versailles');
 perform t.expect('V10 titre, lieu et nom de l''organisateur sont rendus', t.as(null, 'select title || '' / '' || place || '' / '' || organizer_name from public.neighbors_public_events(48.86, 2.35) where title = ''Ouvert dans 3 jours'''), 'OK Ouvert dans 3 jours / Square des Lilas / Les Jardiniers du quartier');
 perform t.expect('V10 un événement masqué n''apparaît jamais', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35) where title = ''Masqué'''), 'OK 0');
 perform t.expect('V10 un événement annulé n''apparaît pas', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35) where title = ''Annulé'''), 'OK 0');
 perform t.expect('V10 un événement fini n''apparaît pas', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35) where title = ''Déjà fini'''), 'OK 0');
 perform t.expect('V10 un événement dans plus de 90 jours n''apparaît pas', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35) where title like ''Trop loin%'''), 'OK 0');
 perform t.expect('V10 un organisateur en attente n''apparaît pas', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35) where title = ''Organisateur en attente'''), 'OK 0');
 perform t.expect('V10 un organisateur banni n''apparaît pas', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35) where title = ''Organisateur banni'''), 'OK 0');
 perform t.expect('V10 Orléans (≈ 100 km) n''apparaît pas depuis Paris', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35) where title = ''À Orléans'''), 'OK 0');
 perform t.expect('V10 Lyon n''apparaît pas depuis Paris', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35) where title = ''À Lyon'''), 'OK 0');
 perform t.expect('V10 depuis Lyon : seulement Lyon', t.as(null, 'select title from public.neighbors_public_events(45.76, 4.83)'), 'OK À Lyon');
 perform t.expect('V10 depuis Orléans : seulement Orléans', t.as(null, 'select title from public.neighbors_public_events(47.90, 1.90)'), 'OK À Orléans');
 perform t.expect('V10 depuis la campagne sans événement : liste vide', t.as(null, 'select count(*) from public.neighbors_public_events(44.0, 0.0)'), 'OK 0');

 -- ===== Position fine : arrondie, jamais utilisée telle quelle =====
 a := t.as(null, 'select title from public.neighbors_public_events(48.8601, 2.3501)');
 b := t.as(null, 'select title from public.neighbors_public_events(48.8700, 2.3800)');
 perform t.expect('V10 deux points de la même grande cellule donnent la même liste (arrondi côté serveur)', case when a = b then 'OK same' else 'DIFF ' || a || ' | ' || b end, 'OK same');
 perform t.expect('V10 un point à 3 décimales est accepté', t.as(null, 'select count(*) from public.neighbors_public_events(48.859, 2.351)'), 'OK 3');

 -- ===== Entrées hostiles =====
 perform t.expect('V10 latitude vide refusée', t.as(null, 'select count(*) from public.neighbors_public_events(null, 2.35)'), 'ERR 22023');
 perform t.expect('V10 longitude vide refusée', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, null)'), 'ERR 22023');
 perform t.expect('V10 latitude 91 refusée', t.as(null, 'select count(*) from public.neighbors_public_events(91, 2.35)'), 'ERR 22023');
 perform t.expect('V10 latitude -91 refusée', t.as(null, 'select count(*) from public.neighbors_public_events(-91, 2.35)'), 'ERR 22023');
 perform t.expect('V10 longitude 181 refusée', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 181)'), 'ERR 22023');
 perform t.expect('V10 NaN refusé', t.as(null, 'select count(*) from public.neighbors_public_events(''NaN''::numeric, 2.35)'), 'ERR 22023');
 perform t.expect('V10 aux pôles et à la ligne de date : pas d''erreur', t.as(null, 'select count(*) from public.neighbors_public_events(90, 180)'), 'OK 0');
 perform t.expect('V10 injection dans un paramètre : refus de type', t.as(null, 'select count(*) from public.neighbors_public_events(''1; drop table public.events'', 2)'), 'ERR 22P02');
 perform t.expect('V10 la table events existe toujours', (select 'OK ' || count(*) from public.events), 'OK 11');

 -- ===== Plafond de 20 =====
 alter table public.events disable trigger neighbors_event_before_insert;
 insert into public.events(organizer, title, starts_at, ends_at, place, cell_lat, cell_lon, status)
   select t.u10(1), 'Série ' || lpad(i::text, 2, '0'), now() + (i + 10) * interval '1 day', now() + (i + 10) * interval '1 day' + interval '2 hours', 'Salle ' || i, 48.86, 2.35, 'open' from generate_series(1, 25) i;
 alter table public.events enable trigger neighbors_event_before_insert;
 perform t.expect('V10 jamais plus de 20 événements', t.as(null, 'select count(*) from public.neighbors_public_events(48.86, 2.35)'), 'OK 20');
 perform t.expect('V10 les plus proches dans le temps d''abord (le premier est « Ouvert demain »)', t.as(null, 'select title from public.neighbors_public_events(48.86, 2.35) limit 1'), 'OK Ouvert demain');

 -- ===== Un membre connecté peut aussi l'appeler ; ses droits sur les tables ne changent pas =====
 perform t.expect('V10 un membre connecté appelle la fonction', t.as(t.u10(7), 'select count(*) from public.neighbors_public_events(48.86, 2.35)'), 'OK 20');
 perform t.expect('V10 un membre ne lit toujours pas les événements d''un organisateur masqué', t.as(t.u10(7), 'select count(*) from public.events where title = ''Masqué'''), 'OK 0');
 -- (Un organisateur banni voit ses événements masqués au moment du bannissement ; la fonction ajoute malgré tout son propre contrôle, par prudence.)
 perform t.expect('V10 un membre lit un événement ouvert de son quartier (politique inchangée)', t.as(t.u10(7), 'select count(*) from public.events where title = ''Ouvert demain'''), 'OK 1');
end $$;
