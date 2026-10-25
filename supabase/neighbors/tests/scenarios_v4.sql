-- Scénarios de la version 4 : organisateurs validés, événements, intérêt, signalement. Base JETABLE uniquement (vide auth.users).
-- Lancé par run.sh en dernier. Chaque ligne PASS/FAIL est une attaque ou une règle vérifiée.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
\set D '''dddddddd-0000-4000-8000-000000000004'''
\set E '''eeeeeeee-0000-4000-8000-000000000005'''
\set F '''ffffffff-0000-4000-8000-000000000006'''
\set G '''99999999-0000-4000-8000-000000000007'''
\set H '''88888888-0000-4000-8000-000000000008'''
\set I '''77777777-0000-4000-8000-000000000009'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr'),(:D,'d@x.fr'),(:E,'e@x.fr'),(:F,'f@x.fr'),(:G,'g@x.fr'),(:H,'h@x.fr'),(:I,'i@x.fr');

-- Insertion d'un événement par SQL (textes entre guillemets sûrs par format %L ; dates en SQL brut).
create or replace function t.evsql(title text default 'Troc de plantes', st text default 'now() + interval ''3 days''', en text default 'now() + interval ''3 days 2 hours''',
  place text default 'Salle des fêtes', url text default null, cap text default 'null', descr text default '') returns text language sql as $$
  select format('insert into public.events(title,description,starts_at,ends_at,place,signup_url,capacity) values (%L,%L,%s,%s,%L,%L,%s)', title, descr, st, en, place, url, cap) $$;
create or replace function t.orgsql(uid uuid, nm text, descr text default '') returns text language sql as $$
  select format('insert into public.organizers(user_id,name,description) values (%L,%L,%L)', uid, nm, descr) $$;

do $$
declare
  A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
  D uuid:='dddddddd-0000-4000-8000-000000000004'; E uuid:='eeeeeeee-0000-4000-8000-000000000005'; F uuid:='ffffffff-0000-4000-8000-000000000006';
  G uuid:='99999999-0000-4000-8000-000000000007'; H uuid:='88888888-0000-4000-8000-000000000008'; I uuid:='77777777-0000-4000-8000-000000000009';
  e1 uuid; e2 uuid; e3 uuid; e4 uuid; k int; u text; ok_urls text[]; bad_urls text[];
  sts text[]; ens text[]; wants text[]; lab text[];
begin
 perform t.as(A,format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.86,2.35)',A,'Alice'));
 perform t.as(B,format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.87,2.36)',B,'Bob'));
 perform t.as(C,format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.86,2.36)',C,'Carole'));
 perform t.as(D,format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,50.86,2.34)',D,'Denis'));
 perform t.as(E,format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.85,2.34)',E,'Eloise'));
 perform t.as(F,format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.86,2.34)',F,'Fabrice'));
 perform t.as(G,format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.87,2.35)',G,'Gaelle'));
 perform t.as(H,format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.88,2.35)',H,'Hugo'));
 perform t.as(I,format('insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values (%L,%L,48.86,2.36)',I,'Irene'));
 update public.profiles set created_at = now() - interval '2 days' where user_id in (F,G,H);   -- signaleurs de plus de 24 h
 update public.profiles set banned_at = now() where user_id = I;

 ---------- 1. Devenir organisateur : sans validation, on ne publie pas ----------
 perform t.expect('V4 B demande à devenir organisateur', t.as(B,t.orgsql(B,'Les Jardins de Bob','Ateliers de greffe')), 'OK rows=1');
 perform t.expect('V4 C s''auto-valide à l''insertion (verified_at)', t.as(C,format('insert into public.organizers(user_id,name,verified_at) values (%L,%L,now())',C,'Faux Valide')), 'ERR 42501');
 perform t.expect('V4 B s''auto-valide par update', t.as(B,'update public.organizers set verified_at = now()'), 'ERR 42501');
 perform t.expect('V4 B met verified_at à null (même refus)', t.as(B,'update public.organizers set verified_at = null'), 'ERR 42501');
 perform t.expect('V4 B s''auto-valide par upsert', t.as(B,format('insert into public.organizers(user_id,name) values (%L,%L) on conflict (user_id) do update set verified_at = now()',B,'Les Jardins de Bob')), 'ERR 42501');
 perform t.expect('V4 B usurpe : demande au nom de A', t.as(B,t.orgsql(A,'Nom de Alice')), 'ERR 42501');
 perform t.expect('V4 B 2e demande (une par personne)', t.as(B,t.orgsql(B,'Autre nom')), 'ERR 23505');
 perform t.expect('V4 nom déjà pris, sans tenir compte des majuscules', t.as(C,t.orgsql(C,'LES JARDINS DE BOB')), 'ERR 23505');
 perform t.expect('V4 anon ne demande rien', t.as(null,t.orgsql(A,'Anonyme Org')), 'ERR 42501');
 perform t.expect('V4 banni ne demande rien', t.as(I,t.orgsql(I,'Banni Org')), 'ERR P0001 not_member');
 perform t.expect('V4 sans profil : refus', t.as(gen_random_uuid(),t.orgsql(gen_random_uuid(),'Fantome Org')), 'ERR 42501');
 perform t.expect('V4 nom trop court', t.as(C,t.orgsql(C,'ab')), 'ERR 23514');
 perform t.expect('V4 nom trop long (61)', t.as(C,t.orgsql(C,repeat('x',61))), 'ERR 23514');
 perform t.expect('V4 nom avec balise', t.as(C,t.orgsql(C,'<b>Mairie</b>')), 'ERR 23514');
 perform t.expect('V4 nom avec caractère invisible', t.as(C,t.orgsql(C,'Mai'||chr(8203)||'rie de Paris')), 'ERR 23514');
 perform t.expect('V4 nom avec inversion de sens', t.as(C,t.orgsql(C,'Mairie '||chr(8238)||'edalP')), 'ERR 23514');
 perform t.expect('V4 nom avec espaces autour', t.as(C,t.orgsql(C,' Mairie Verte ')), 'ERR 23514');
 perform t.expect('V4 nom sans lettre ni chiffre', t.as(C,t.orgsql(C,'!!!!')), 'ERR 23514');
 perform t.expect('V4 description de 501 caractères', t.as(C,t.orgsql(C,'Nom Correct',repeat('d',501))), 'ERR 23514');
 perform t.expect('V4 description de 500 caractères', t.as(C,t.orgsql(C,'Association des jardins',repeat('d',500))), 'OK rows=1');
 perform t.expect('V4 colonne created_at non écrivable', t.as(F,format('insert into public.organizers(user_id,name,created_at) values (%L,%L,now())',F,'Nom Daté')), 'ERR 42501');
 perform t.expect('V4 B voit sa demande en attente', t.as(B,'select verified_at is null from public.organizers'), 'OK true');
 perform t.expect('V4 B n''est pas encore organisateur', t.as(B,'select public.neighbors_is_organizer()'), 'OK false');
 perform t.expect('V4 B corrige sa demande en attente', t.as(B,'update public.organizers set description = ''Ateliers de greffe et de taille'''), 'OK rows=1');
 perform t.expect('V4 B ne change pas user_id', t.as(B,format('update public.organizers set user_id = %L',A)), 'ERR 42501');
 perform t.expect('V4 A ne voit pas la demande de B', t.as(A,'select count(*) from public.organizers'), 'OK 0');
 perform t.expect('V4 anon ne lit pas les organisateurs', t.as(null,'select count(*) from public.organizers'), 'ERR 42501');

 -- Sans validation, aucun événement
 perform t.expect('V4 B (en attente) ne publie pas', t.as(B,t.evsql()), 'ERR P0001 not_organizer');
 perform t.expect('V4 B (en attente) : événement sous le nom de A', t.as(B,format('insert into public.events(organizer,title,starts_at,ends_at,place) values (%L,%L,now()+interval ''2 days'',now()+interval ''2 days 1 hour'',%L)',A,'Usurpation','Place')), 'ERR 42501');
 perform t.expect('V4 membre sans demande ne publie pas', t.as(F,t.evsql()), 'ERR P0001 not_organizer');
 perform t.expect('V4 anon ne publie pas', t.as(null,t.evsql()), 'ERR 42501');
 perform t.expect('V4 aucun événement en base', (select 'OK '||count(*) from public.events), 'OK 0');

 -- L'éditeur valide A, D et E (rôle postgres, auth.uid() vide)
 perform t.as(A,t.orgsql(A,'Association Graines Libres','Troc et ateliers'));
 perform t.as(D,t.orgsql(D,'Verger de Denis'));
 perform t.as(E,t.orgsql(E,'Les Semeurs du quartier'));
 perform t.expect('V4 trois demandes en attente', (select 'OK '||count(*) from public.organizers where verified_at is null), 'OK 5');
 perform set_config('request.jwt.claim.sub', '', true);   -- éditeur : auth.uid() vide (t.as laisse le dernier utilisateur en place)
 update public.organizers set verified_at = now() where user_id in (A, D, E);
 perform t.expect('V4 validation écrite au journal', (select 'OK '||count(*) from public.moderation_log where reason = 'organisateur validé' and target_kind = 'profile'), 'OK 3');
 perform t.expect('V4 A est organisateur validé', t.as(A,'select public.neighbors_is_organizer()'), 'OK true');
 perform t.expect('V4 B reste non validé', t.as(B,'select public.neighbors_is_organizer()'), 'OK false');
 perform t.expect('V4 A voit sa validation', t.as(A,'select verified_at is not null from public.organizers'), 'OK true');
 perform t.expect('V4 A (validé) ne change plus son nom seul', t.as(A,'update public.organizers set name = ''Mairie de Paris'''), 'OK rows=0');
 perform t.expect('V4 A (validé) ne change plus sa description', t.as(A,'update public.organizers set description = ''x'''), 'OK rows=0');
 perform t.expect('V4 A change de nom par upsert : refus', t.as(A,format('insert into public.organizers(user_id,name) values (%L,%L) on conflict (user_id) do update set name = excluded.name',A,'Mairie de Paris')), 'ERR 42501');
 perform t.expect('V4 le nom de A est resté', (select 'OK '||name from public.organizers where user_id = A), 'OK Association Graines Libres');

 ---------- 2. Création : cellule, liens, dates, longueurs ----------
 perform t.expect('V4 A publie un événement', t.as(A,t.evsql('Troc de plantes', place => 'Salle des fêtes d''Ancenis', url => 'https://exemple.fr/inscription?id=3#haut', cap => '40', descr => 'Apportez vos boutures.')), 'OK rows=1');
 select id into e1 from public.events where title = 'Troc de plantes';
 perform t.expect('V4 cellule recopiée du profil de A', (select 'OK '||cell_lat||'/'||cell_lon from public.events where id = e1), 'OK 48.86/2.35');
 perform t.expect('V4 statut open et compteur à 0 au départ', (select 'OK '||status||'/'||interest_count from public.events where id = e1), 'OK open/0');
 perform t.expect('V4 A tente cell_lat à l''insertion', t.as(A,format('insert into public.events(title,starts_at,ends_at,place,cell_lat) values (%L,now()+interval ''2 days'',now()+interval ''2 days 1 hour'',%L,10)','Hors cellule','Place')), 'ERR 42501');
 perform t.expect('V4 A tente cell_lon à l''insertion', t.as(A,format('insert into public.events(title,starts_at,ends_at,place,cell_lon) values (%L,now()+interval ''2 days'',now()+interval ''2 days 1 hour'',%L,10)','Hors cellule','Place')), 'ERR 42501');
 perform t.expect('V4 A tente status à l''insertion', t.as(A,format('insert into public.events(title,starts_at,ends_at,place,status) values (%L,now()+interval ''2 days'',now()+interval ''2 days 1 hour'',%L,%L)','Statut','Place','cancelled')), 'ERR 42501');
 perform t.expect('V4 A tente interest_count à l''insertion', t.as(A,format('insert into public.events(title,starts_at,ends_at,place,interest_count) values (%L,now()+interval ''2 days'',now()+interval ''2 days 1 hour'',%L,500)','Compteur','Place')), 'ERR 42501');
 perform t.expect('V4 A tente created_at à l''insertion', t.as(A,format('insert into public.events(title,starts_at,ends_at,place,created_at) values (%L,now()+interval ''2 days'',now()+interval ''2 days 1 hour'',%L,now()-interval ''30 days'')','Date','Place')), 'ERR 42501');
 perform t.expect('V4 A tente id à l''insertion', t.as(A,format('insert into public.events(id,title,starts_at,ends_at,place) values (gen_random_uuid(),%L,now()+interval ''2 days'',now()+interval ''2 days 1 hour'',%L)','Identifiant','Place')), 'ERR 42501');
 perform t.expect('V4 aucun événement fantôme en base', (select 'OK '||count(*) from public.events), 'OK 1');
 perform t.expect('V4 aucune colonne d''adresse ou d''e-mail', (select 'OK '||count(*) from information_schema.columns where table_schema='public' and table_name in ('events','organizers','event_interest') and column_name ~ '(lat$|lon$|mail|address|adresse|phone|tel)' and column_name not in ('cell_lat','cell_lon')), 'OK 0');

 -- Liens d'inscription : on repart d'un quota neuf à chaque essai, avec l'organisateur E.
 ok_urls := array['https://exemple.fr/inscription?id=3#haut', 'HTTPS://Exemple.FR/x', 'https://asso.exemple.fr:8443/a/b', 'https://exemple.fr', 'https://xn--jardin-bzb.exemple.fr/ete', 'https://exemple.fr/ski-inscriptions-kiosque-Ismael%C3%AB'];
 foreach u in array ok_urls loop
   delete from public.quotas; delete from public.events where organizer = E;
   perform t.expect('V4 lien accepté : '||u, t.as(E,t.evsql('Lien', place => 'Place', url => u)), 'OK rows=1');
 end loop;
 bad_urls := array['http://exemple.fr/x', 'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', 'vbscript:msgbox(1)',
   'https://exemple', 'https://user:pass@exemple.fr/x', 'https://exemple.fr@evil.example/x', 'https://1.2.3.4/x', 'https://[::1]/x', 'https://exemple.fr/a b',
   'https://exemple.fr/"onmouseover="x', 'https://exemple.fr/<script>', ' https://exemple.fr', 'ftp://exemple.fr/x', '//exemple.fr/x', 'https://', 'https://exemple.fr\evil',
   'https://-exemple.fr/x', 'https://exemple..fr/x', 'https://exemple.fr/' || chr(10) || 'x', 'https://exemple.fr/' || repeat('a', 290), 'https://exemple.fr/`x`', 'https://exemple.fr/é', 'https://exemple.fr/' || chr(8238) || 'abc', 'https://exemple.fr/' || chr(160) || 'x', 'https://éxemple.fr/x', 'https://exemple.fr/' || chr(8203) || 'x'];
 foreach u in array bad_urls loop
   delete from public.quotas;
   perform t.expect('V4 lien refusé : '||left(replace(u, chr(10), '\n'), 40), t.as(E,t.evsql('Lien', place => 'Place', url => u)), 'ERR 23514');
 end loop;
 perform t.expect('V4 lien de 300 caractères accepté', (select t.as(E,t.evsql('Lien', place => 'Place', url => 'https://exemple.fr/'||repeat('a',281)))), 'OK rows=1');
 delete from public.quotas; delete from public.events where organizer = E;

 -- Dates
 sts  := array['now() + interval ''3 days''',  'now() - interval ''2 days''', 'now() - interval ''30 minutes''', 'now() + interval ''3 days''', 'now() + interval ''3 days''',         'now() + interval ''400 days''',  'now() + interval ''3 days''', 'now() + interval ''3 days'''];
 ens  := array['now() + interval ''2 days''',  'now() + interval ''1 day''',  'now() + interval ''1 hour''',     'now() + interval ''3 days''', 'now() + interval ''2 years''',     'now() + interval ''1 year 1 day''', 'now() + interval ''364 days''', 'null'];
 wants:= array['ERR 23514',                    'ERR P0001 event_past',        'OK rows=1',                       'OK rows=1',                   'ERR P0001 event_far',               'ERR P0001 event_far',             'OK rows=1',                   'ERR 23502'];
 lab  := array['fin avant le début', 'début dans le passé', 'début il y a 30 min (tolérance)', 'début = fin', 'fin dans 2 ans', 'fin dans 1 an et 1 jour', 'fin dans 364 jours', 'fin vide'];
 for k in 1..array_length(sts,1) loop
   delete from public.quotas; delete from public.events where organizer = E;
   perform t.expect('V4 dates : '||lab[k], t.as(E,t.evsql('Dates', st => sts[k], en => ens[k])), wants[k]);
 end loop;
 delete from public.quotas; delete from public.events where organizer = E;
 perform t.expect('V4 début vide', t.as(E,t.evsql('Dates', st => 'null')), 'ERR 23502');

 -- Longueurs
 delete from public.quotas;
 perform t.expect('V4 titre vide', t.as(E,t.evsql('')), 'ERR 23514');
 perform t.expect('V4 titre d''espaces', t.as(E,t.evsql('    ')), 'ERR 23514');
 perform t.expect('V4 titre de 81', t.as(E,t.evsql(repeat('t',81))), 'ERR 23514');
 perform t.expect('V4 titre de 80', t.as(E,t.evsql(repeat('t',80))), 'OK rows=1');
 delete from public.quotas; delete from public.events where organizer = E;
 perform t.expect('V4 description de 2001', t.as(E,t.evsql('Desc', descr => repeat('d',2001))), 'ERR 23514');
 perform t.expect('V4 description de 2000', t.as(E,t.evsql('Desc', descr => repeat('d',2000))), 'OK rows=1');
 delete from public.quotas; delete from public.events where organizer = E;
 perform t.expect('V4 lieu vide', t.as(E,t.evsql('Lieu', place => '')), 'ERR 23514');
 perform t.expect('V4 lieu de 121', t.as(E,t.evsql('Lieu', place => repeat('l',121))), 'ERR 23514');
 perform t.expect('V4 lieu de 120', t.as(E,t.evsql('Lieu', place => repeat('l',120))), 'OK rows=1');
 delete from public.quotas; delete from public.events where organizer = E;
 perform t.expect('V4 capacité 0', t.as(E,t.evsql('Cap', cap => '0')), 'ERR 23514');
 perform t.expect('V4 capacité négative', t.as(E,t.evsql('Cap', cap => '-5')), 'ERR 23514');
 perform t.expect('V4 capacité 10001', t.as(E,t.evsql('Cap', cap => '10001')), 'ERR 23514');
 perform t.expect('V4 capacité 1', t.as(E,t.evsql('Cap', cap => '1')), 'OK rows=1');
 perform t.expect('V4 capacité 10000', t.as(E,t.evsql('Cap2', cap => '10000')), 'OK rows=1');
 delete from public.quotas; delete from public.events where organizer = E;

 -- Quotas : 3 événements par jour, jamais rendus
 perform t.expect('V4 E : 1er événement du jour', t.as(E,t.evsql('Q1')), 'OK rows=1');
 perform t.expect('V4 E : 2e événement du jour', t.as(E,t.evsql('Q2')), 'OK rows=1');
 perform t.expect('V4 E : 3e événement du jour', t.as(E,t.evsql('Q3')), 'OK rows=1');
 perform t.expect('V4 E : 4e événement refusé', t.as(E,t.evsql('Q4')), 'ERR P0001 quota_exceeded:event');
 perform t.expect('V4 E supprime un événement', t.as(E,'delete from public.events where title = ''Q1'''), 'OK rows=1');
 perform t.expect('V4 supprimer ne rend pas le quota', t.as(E,t.evsql('Q5')), 'ERR P0001 quota_exceeded:event');
 delete from public.quotas where user_id = E and action = 'event';

 -- Plafond d'événements ouverts en même temps (20)
 delete from public.events where organizer = E;
 for k in 1..20 loop
   delete from public.quotas where user_id = E;
   perform t.as(E,t.evsql('Ouvert '||k));
 end loop;
 delete from public.quotas where user_id = E;
 perform t.expect('V4 20 événements ouverts en base', (select 'OK '||count(*) from public.events where organizer = E), 'OK 20');
 perform t.expect('V4 21e événement ouvert refusé', t.as(E,t.evsql('Ouvert 21')), 'ERR P0001 quota_exceeded:event_open');
 delete from public.events where organizer = E; delete from public.quotas;

 ---------- 3. Lecture : zone, blocage, masqués, terminés ----------
 delete from public.quotas;
 perform t.as(A,t.evsql('Atelier greffe','now() + interval ''10 days''','now() + interval ''10 days 3 hours''','Jardin partagé'));
 perform t.as(D,t.evsql('Fête du houblon','now() + interval ''5 days''','now() + interval ''5 days 4 hours''','Place du marché'));
 select id into e2 from public.events where title = 'Atelier greffe';
 perform t.expect('V4 D (organisateur lointain) a publié', (select 'OK '||cell_lat from public.events where title = 'Fête du houblon'), 'OK 50.86');
 perform t.expect('V4 B (proche) voit l''événement de A', t.as(B,'select count(*) from public.events where title in (''Troc de plantes'',''Atelier greffe'')'), 'OK 2');
 perform t.expect('V4 C (proche) voit les événements de A', t.as(C,'select count(*) from public.events where organizer = '||quote_literal(A)), 'OK 2');
 perform t.expect('V4 B ne voit pas l''événement lointain de D', t.as(B,'select count(*) from public.events where title = ''Fête du houblon'''), 'OK 0');
 perform t.expect('V4 D (hors zone) ne voit pas ceux de A', t.as(D,'select count(*) from public.events where organizer = '||quote_literal(A)), 'OK 0');
 perform t.expect('V4 D voit le sien', t.as(D,'select count(*) from public.events'), 'OK 1');
 perform t.expect('V4 anon ne lit aucun événement', t.as(null,'select count(*) from public.events'), 'ERR 42501');
 perform t.expect('V4 B voit le nom de l''organisateur de A', t.as(B,'select o.name from public.events e join public.organizers o on o.user_id = e.organizer where e.id = '||quote_literal(e1)), 'OK Association Graines Libres');
 perform t.expect('V4 B ne voit que l''organisateur dont il voit un événement', t.as(B,'select count(*) from public.organizers where user_id <> auth.uid()'), 'OK 1');
 perform t.expect('V4 D ne voit aucun organisateur voisin', t.as(D,'select count(*) from public.organizers where user_id <> auth.uid()'), 'OK 0');
 perform t.expect('V4 B lit sa fiche et celle de A, pas celle de C', t.as(B,'select count(*) from public.organizers where description is not null'), 'OK 2');

 -- Terminé depuis 3 jours : visible ; depuis 8 jours : invisible
 delete from public.quotas;
 perform t.as(A,t.evsql('Vieux 3 jours'));
 perform t.as(A,t.evsql('Vieux 8 jours'));
 update public.events set starts_at = now() - interval '3 days 2 hours', ends_at = now() - interval '3 days' where title = 'Vieux 3 jours';
 update public.events set starts_at = now() - interval '8 days 2 hours', ends_at = now() - interval '8 days' where title = 'Vieux 8 jours';
 perform t.expect('V4 B voit un événement fini depuis 3 jours', t.as(B,'select count(*) from public.events where title = ''Vieux 3 jours'''), 'OK 1');
 perform t.expect('V4 B ne voit pas un événement fini depuis 8 jours', t.as(B,'select count(*) from public.events where title = ''Vieux 8 jours'''), 'OK 0');
 perform t.expect('V4 A garde la lecture des siens', t.as(A,'select count(*) from public.events where title = ''Vieux 8 jours'''), 'OK 1');
 delete from public.events where title like 'Vieux%';

 -- Masqué : invisible aux membres, visible de l'auteur
 delete from public.quotas;
 perform t.as(A,t.evsql('Caché par erreur'));
 update public.events set status = 'hidden' where title = 'Caché par erreur';
 perform t.expect('V4 B ne voit pas un événement masqué', t.as(B,'select count(*) from public.events where title = ''Caché par erreur'''), 'OK 0');
 perform t.expect('V4 A voit son événement masqué', t.as(A,'select count(*) from public.events where title = ''Caché par erreur'''), 'OK 1');
 perform t.expect('V4 A ne rouvre pas un événement masqué', t.as(A,'update public.events set status = ''open'' where title = ''Caché par erreur'''), 'OK rows=0');
 perform t.expect('V4 A ne le « annule » pas non plus', t.as(A,'update public.events set status = ''cancelled'' where title = ''Caché par erreur'''), 'OK rows=0');
 perform t.expect('V4 A ne ré-masque pas', t.as(A,'update public.events set status = ''hidden'' where title = ''Atelier greffe'''), 'ERR 42501');
 delete from public.events where title = 'Caché par erreur';

 -- Blocage dans un sens ou l'autre
 perform t.as(A,'insert into public.posts(kind,title) values (''don'',''Boutures'')');
 perform t.expect('V4 B bloque A', t.as(B,format('insert into public.blocks(blocker,blocked) values (%L,%L)',B,A)), 'OK rows=1');
 perform t.expect('V4 B ne voit plus les événements de A', t.as(B,'select count(*) from public.events where organizer = '||quote_literal(A)), 'OK 0');
 perform t.expect('V4 B ne voit plus le nom de A', t.as(B,'select count(*) from public.organizers where user_id = '||quote_literal(A)), 'OK 0');
 perform t.expect('V4 C voit toujours les événements de A', t.as(C,'select count(*) from public.events where organizer = '||quote_literal(A)), 'OK 2');
 perform t.expect('V4 B ne s''intéresse pas à un événement qu''il ne voit plus', t.as(B,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e1,B)), 'ERR 42501');
 perform t.expect('V4 B ne signale pas un événement qu''il ne voit plus', t.as(B,format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''spam'')',e1)), 'ERR 42501');
 delete from public.blocks;

 -- Compte banni : plus de lecture
 update public.profiles set banned_at = now() where user_id = C;
 perform t.expect('V4 C banni ne lit aucun événement', t.as(C,'select count(*) from public.events'), 'OK 0');
 perform t.expect('V4 C banni ne s''intéresse à rien', t.as(C,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e1,C)), 'ERR 42501');
 update public.profiles set banned_at = null where user_id = C;

 ---------- 4. Modifier : annuler / rouvrir seulement ----------
 perform t.expect('V4 A annule son événement', t.as(A,format('update public.events set status = ''cancelled'' where id = %L',e2)), 'OK rows=1');
 perform t.expect('V4 B voit l''événement annulé', t.as(B,format('select status from public.events where id = %L',e2)), 'OK cancelled');
 perform t.expect('V4 A rouvre son événement', t.as(A,format('update public.events set status = ''open'' where id = %L',e2)), 'OK rows=1');
 perform t.expect('V4 A : statut inconnu', t.as(A,format('update public.events set status = ''termine'' where id = %L',e2)), 'ERR 42501');
 perform t.expect('V4 A ne change pas le titre', t.as(A,format('update public.events set title = ''Autre'' where id = %L',e2)), 'ERR 42501');
 perform t.expect('V4 A ne change pas les dates', t.as(A,format('update public.events set ends_at = now() + interval ''2 years'' where id = %L',e2)), 'ERR 42501');
 perform t.expect('V4 A ne change pas le lien', t.as(A,format('update public.events set signup_url = ''javascript:alert(1)'' where id = %L',e2)), 'ERR 42501');
 perform t.expect('V4 A ne change pas la capacité', t.as(A,format('update public.events set capacity = 5 where id = %L',e2)), 'ERR 42501');
 perform t.expect('V4 A ne change pas l''organisateur', t.as(A,format('update public.events set organizer = %L where id = %L',B,e2)), 'ERR 42501');
 perform t.expect('V4 A ne change pas la cellule', t.as(A,format('update public.events set cell_lat = 10 where id = %L',e2)), 'ERR 42501');
 perform t.expect('V4 A ne triche pas sur le compteur', t.as(A,format('update public.events set interest_count = 999 where id = %L',e2)), 'ERR 42501');
 perform t.expect('V4 B (autre membre) n''annule pas l''événement de A', t.as(B,format('update public.events set status = ''cancelled'' where id = %L',e2)), 'OK rows=0');
 perform t.expect('V4 B (en attente) ne masque pas celui de A', t.as(B,format('update public.events set status = ''hidden'' where id = %L',e2)), 'OK rows=0');
 perform t.expect('V4 l''événement de A est resté ouvert', (select 'OK '||status from public.events where id = e2), 'OK open');
 perform t.expect('V4 B ne supprime pas l''événement de A', t.as(B,format('delete from public.events where id = %L',e2)), 'OK rows=0');
 perform t.expect('V4 anon ne supprime rien', t.as(null,'delete from public.events'), 'ERR 42501');
 perform t.expect('V4 anon ne modifie rien', t.as(null,'update public.events set status = ''open'''), 'ERR 42501');

 ---------- 5. Intérêt ----------
 perform t.expect('V4 B s''intéresse à l''événement de A', t.as(B,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e1,B)), 'OK rows=1');
 perform t.expect('V4 compteur à 1', (select 'OK '||interest_count from public.events where id = e1), 'OK 1');
 perform t.expect('V4 B 2e fois : refus (une ligne par membre)', t.as(B,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e1,B)), 'ERR 23505');
 perform t.expect('V4 compteur inchangé après refus', (select 'OK '||interest_count from public.events where id = e1), 'OK 1');
 perform t.expect('V4 C s''intéresse aussi', t.as(C,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e1,C)), 'OK rows=1');
 perform t.expect('V4 compteur à 2', (select 'OK '||interest_count from public.events where id = e1), 'OK 2');
 perform t.expect('V4 B voit le compteur', t.as(B,format('select interest_count from public.events where id = %L',e1)), 'OK 2');
 perform t.expect('V4 B ne voit que sa propre ligne d''intérêt', t.as(B,'select count(*) from public.event_interest'), 'OK 1');
 perform t.expect('V4 A (organisateur) ne voit pas QUI est intéressé', t.as(A,'select count(*) from public.event_interest'), 'OK 0');
 perform t.expect('V4 anon ne lit pas les intérêts', t.as(null,'select count(*) from public.event_interest'), 'ERR 42501');
 perform t.expect('V4 B s''intéresse au nom de C', t.as(B,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e2,C)), 'ERR 42501');
 perform t.expect('V4 D (hors zone) ne s''intéresse pas', t.as(D,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e1,D)), 'ERR 42501');
 perform t.expect('V4 anon ne s''intéresse pas', t.as(null,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e1,D)), 'ERR 42501');
 perform t.expect('V4 intérêt pour un événement inconnu', t.as(B,format('insert into public.event_interest(event_id,user_id) values (gen_random_uuid(),%L)',B)), 'ERR 42501');
 perform t.expect('V4 B ne modifie pas une ligne d''intérêt', t.as(B,format('update public.event_interest set user_id = %L',F)), 'ERR 42501');
 perform t.expect('V4 B ne retire pas l''intérêt de C', t.as(B,format('delete from public.event_interest where user_id = %L',C)), 'OK rows=0');
 perform t.expect('V4 compteur toujours à 2', (select 'OK '||interest_count from public.events where id = e1), 'OK 2');
 perform t.expect('V4 B retire son intérêt', t.as(B,format('delete from public.event_interest where event_id = %L',e1)), 'OK rows=1');
 perform t.expect('V4 compteur revenu à 1', (select 'OK '||interest_count from public.events where id = e1), 'OK 1');
 perform t.expect('V4 B retire encore : rien à retirer', t.as(B,format('delete from public.event_interest where event_id = %L',e1)), 'OK rows=0');
 perform t.expect('V4 compteur jamais négatif', (select 'OK '||interest_count from public.events where id = e1), 'OK 1');
 -- Événement annulé, masqué ou fini : pas de nouvel intérêt
 update public.events set status = 'cancelled' where id = e2;
 perform t.expect('V4 pas d''intérêt pour un événement annulé', t.as(B,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e2,B)), 'ERR 42501');
 update public.events set status = 'open', starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = e2;
 perform t.expect('V4 pas d''intérêt pour un événement fini', t.as(B,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e2,B)), 'ERR 42501');
 update public.events set starts_at = now() + interval '10 days', ends_at = now() + interval '10 days 3 hours' where id = e2;
 -- Quota : 50 par jour. On remplit 49 puis on essaie deux fois.
 delete from public.quotas;
 for k in 1..49 loop perform public.neighbors_take_quota(G, 'interest', 50); end loop;
 perform t.expect('V4 G : 50e intérêt du jour', t.as(G,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e1,G)), 'OK rows=1');
 perform t.expect('V4 G : 51e intérêt refusé', t.as(G,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e2,G)), 'ERR P0001 quota_exceeded:interest');
 perform t.expect('V4 G retire : le quota n''est pas rendu', t.as(G,format('delete from public.event_interest where event_id = %L',e1)), 'OK rows=1');
 perform t.expect('V4 G ne peut plus en ajouter', t.as(G,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e1,G)), 'ERR P0001 quota_exceeded:interest');
 delete from public.quotas;

 ---------- 6. Signalement et masquage automatique ----------
 perform t.expect('V4 B signale l''événement', t.as(B,format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''commerce'')',e2)), 'OK rows=1');
 perform t.expect('V4 B signale deux fois : refus', t.as(B,format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''spam'')',e2)), 'ERR 23505');
 perform t.expect('V4 A ne se signale pas lui-même', t.as(A,format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''spam'')',e2)), 'ERR P0001 report_self');
 perform t.expect('V4 D (hors zone) ne signale pas', t.as(D,format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''spam'')',e2)), 'ERR 42501');
 perform t.expect('V4 signaler un événement inconnu', t.as(B,'insert into public.reports(target_kind,target_id,reason) values (''event'',gen_random_uuid(),''spam'')'), 'ERR 42501');
 perform t.expect('V4 type de cible inconnu', t.as(B,format('insert into public.reports(target_kind,target_id,reason) values (''evenement'',%L,''spam'')',e2)), 'ERR P0001');
 perform t.expect('V4 anon ne signale pas', t.as(null,format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''spam'')',e2)), 'ERR 42501');
 perform t.expect('V4 B (compte récent) ne compte pas : pas encore masqué', (select 'OK '||status from public.events where id = e2), 'OK open');
 perform t.expect('V4 F signale (1 compte ancien)', t.as(F,format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''abus'')',e2)), 'OK rows=1');
 perform t.expect('V4 G signale (2 comptes anciens)', t.as(G,format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''abus'')',e2)), 'OK rows=1');
 perform t.expect('V4 pas masqué à 2 comptes anciens', (select 'OK '||status from public.events where id = e2), 'OK open');
 perform t.expect('V4 H signale (3 comptes anciens)', t.as(H,format('insert into public.reports(target_kind,target_id,reason) values (''event'',%L,''dangereux'')',e2)), 'OK rows=1');
 perform t.expect('V4 masqué automatiquement à 3 signalements', (select 'OK '||status from public.events where id = e2), 'OK hidden');
 perform t.expect('V4 masquage écrit au journal', (select 'OK '||count(*) from public.moderation_log where action = 'auto_hide' and target_kind = 'event' and target_id = e2), 'OK 1');
 perform t.expect('V4 B ne voit plus l''événement masqué', t.as(B,format('select count(*) from public.events where id = %L',e2)), 'OK 0');
 perform t.expect('V4 A ne le rouvre pas', t.as(A,format('update public.events set status = ''open'' where id = %L',e2)), 'OK rows=0');
 perform t.expect('V4 A ne lit ni signalements ni journal', t.as(A,'select count(*) from public.reports'), 'OK 0');
 perform t.expect('V4 A ne lit pas le journal', t.as(A,'select count(*) from public.moderation_log'), 'ERR 42501');
 perform t.expect('V4 le signalement est compté dans le quota', (select 'OK '||n from public.quotas where user_id = B and action = 'report' limit 1), 'OK 1');
 -- L'éditeur rétablit
 update public.events set status = 'open' where id = e2;
 perform t.expect('V4 l''éditeur rétablit : B revoit l''événement', t.as(B,format('select count(*) from public.events where id = %L',e2)), 'OK 1');

 ---------- 7. Retrait d'un organisateur, bannissement, suppression ----------
 perform t.expect('V4 E crée un événement avant son retrait', t.as(E,t.evsql('Avant retrait')), 'OK rows=1');
 perform set_config('request.jwt.claim.sub', '', true);   -- éditeur : auth.uid() vide (t.as laisse le dernier utilisateur en place)
 update public.organizers set verified_at = null where user_id = E;
 perform t.expect('V4 retrait : événements de E masqués', (select 'OK '||count(*) from public.events where organizer = E and status <> 'hidden'), 'OK 0');
 perform t.expect('V4 retrait écrit au journal', (select 'OK '||count(*) from public.moderation_log where reason like 'organisateur retiré%' and target_id = E), 'OK 1');
 perform t.expect('V4 E (retiré) ne publie plus', t.as(E,t.evsql('Après retrait')), 'ERR P0001 not_organizer');
 perform t.expect('V4 E (retiré) n''est plus organisateur', t.as(E,'select public.neighbors_is_organizer()'), 'OK false');
 perform t.expect('V4 E (retiré) ne rouvre rien', t.as(E,'update public.events set status = ''open'''), 'OK rows=0');
 perform t.expect('V4 E peut corriger sa demande à nouveau', t.as(E,'update public.organizers set description = ''Nouvelle description'''), 'OK rows=1');
 -- Contourner en supprimant puis recréant la demande : on repart « non validé »
 perform t.expect('V4 A supprime sa fiche organisateur', t.as(A,'delete from public.organizers'), 'OK rows=1');
 perform t.expect('V4 ses événements partent avec elle', (select 'OK '||count(*) from public.events where organizer = A), 'OK 0');
 perform t.expect('V4 A recrée la fiche', t.as(A,t.orgsql(A,'Association Graines Libres')), 'OK rows=1');
 perform t.expect('V4 la nouvelle fiche n''est pas validée', t.as(A,'select verified_at is null from public.organizers'), 'OK true');
 perform t.expect('V4 A ne publie plus sans nouvelle validation', t.as(A,t.evsql('Sans validation')), 'ERR P0001 not_organizer');
 perform set_config('request.jwt.claim.sub', '', true);   -- éditeur : auth.uid() vide (t.as laisse le dernier utilisateur en place)
 update public.organizers set verified_at = now() where user_id = A;
 -- Bannissement
 perform t.expect('V4 A republie après validation', t.as(A,t.evsql('Avant bannissement')), 'OK rows=1');
 update public.profiles set banned_at = now() where user_id = A;
 perform t.expect('V4 bannissement : événements de A masqués', (select 'OK '||count(*) from public.events where organizer = A and status <> 'hidden'), 'OK 0');
 perform t.expect('V4 A banni ne publie plus', t.as(A,t.evsql('Banni')), 'ERR P0001 not_member');
 perform t.expect('V4 A banni n''est plus organisateur', t.as(A,'select public.neighbors_is_organizer()'), 'OK false');
 perform t.expect('V4 A banni ne lit plus ceux des autres', t.as(A,'select count(*) from public.events where organizer <> auth.uid()'), 'OK 0');
 update public.profiles set banned_at = null where user_id = A;
 perform t.expect('V4 levée du bannissement : événements restent masqués', (select 'OK '||count(*) from public.events where organizer = A and status <> 'hidden'), 'OK 0');

 ---------- 8. Purge et suppression de compte ----------
 perform t.as(E,'update public.organizers set description = ''x''');
 perform set_config('request.jwt.claim.sub', '', true);   -- éditeur : auth.uid() vide (t.as laisse le dernier utilisateur en place)
 update public.organizers set verified_at = now() where user_id = E;
 delete from public.quotas;
 perform t.as(E,t.evsql('Fini depuis 31 jours'));
 perform t.as(E,t.evsql('Fini depuis 29 jours'));
 select id into e3 from public.events where title = 'Fini depuis 31 jours';
 select id into e4 from public.events where title = 'Fini depuis 29 jours';
 perform t.as(B,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e3,B));
 perform t.as(B,format('insert into public.event_interest(event_id,user_id) values (%L,%L)',e4,B));
 update public.events set starts_at = now() - interval '31 days 2 hours', ends_at = now() - interval '31 days' where id = e3;
 update public.events set starts_at = now() - interval '29 days 2 hours', ends_at = now() - interval '29 days' where id = e4;
 perform t.expect('V4 aucun client n''appelle la purge', t.as(E,'select public.neighbors_purge_expired()'), 'ERR 42501');
 perform t.expect('V4 aucun client n''appelle le déclencheur d''événement', t.as(E,'select public.neighbors_event_before_insert()'), 'ERR 42501');
 perform t.expect('V4 aucun client n''appelle le déclencheur d''organisateur', t.as(E,'select public.neighbors_organizer_after_verify()'), 'ERR 42501');
 perform t.expect('V4 aucun client n''appelle le compteur', t.as(E,'select public.neighbors_interest_count()'), 'ERR 42501');
 perform t.expect('V4 anon n''appelle pas neighbors_is_organizer', t.as(null,'select public.neighbors_is_organizer()'), 'ERR 42501');
 perform count(*) from public.neighbors_purge_expired();
 perform t.expect('V4 purge : événement fini depuis 31 jours supprimé', (select 'OK '||count(*) from public.events where id = e3), 'OK 0');
 perform t.expect('V4 purge : événement fini depuis 29 jours conservé', (select 'OK '||count(*) from public.events where id = e4), 'OK 1');
 perform t.expect('V4 purge : ses intérêts partent en cascade', (select 'OK '||count(*) from public.event_interest where event_id = e3), 'OK 0');
 -- Suppression du compte de B : sa demande d'organisateur et ses intérêts partent
 perform t.expect('V4 le compteur compte B', (select 'OK '||interest_count from public.events where id = e4), 'OK 1');
 delete from auth.users where id = B;
 perform t.expect('V4 compte supprimé : demande d''organisateur effacée', (select 'OK '||count(*) from public.organizers where user_id = B), 'OK 0');
 perform t.expect('V4 compte supprimé : intérêts effacés', (select 'OK '||count(*) from public.event_interest where user_id = B), 'OK 0');
 perform t.expect('V4 compte supprimé : compteur décrémenté', (select 'OK '||interest_count from public.events where id = e4), 'OK 0');
 delete from auth.users where id = E;
 perform t.expect('V4 compte d''organisateur supprimé : événements effacés', (select 'OK '||count(*) from public.events where organizer = E), 'OK 0');

 ---------- 9. Droits et RLS : inventaire ----------
 perform t.expect('V4 RLS active sur les trois tables', (select 'OK '||count(*) from pg_class where relname in ('organizers','events','event_interest') and relrowsecurity), 'OK 3');
 perform t.expect('V4 anon : aucun droit sur les tables', (select 'OK '||count(*) from information_schema.role_table_grants where grantee = 'anon' and table_name in ('organizers','events','event_interest')), 'OK 0');
 perform t.expect('V4 aucun droit d''écriture sur verified_at', (select 'OK '||count(*) from information_schema.column_privileges where table_name = 'organizers' and column_name = 'verified_at' and grantee in ('authenticated','anon','public') and privilege_type in ('INSERT','UPDATE')), 'OK 0');
 perform t.expect('V4 aucun droit d''écriture sur interest_count, cell_*, status à l''insertion', (select 'OK '||count(*) from information_schema.column_privileges where table_name = 'events' and column_name in ('interest_count','cell_lat','cell_lon','created_at','id') and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE')), 'OK 0');
 perform t.expect('V4 seul status est modifiable sur events', (select 'OK '||string_agg(column_name, ',' order by column_name) from information_schema.column_privileges where table_name = 'events' and grantee = 'authenticated' and privilege_type = 'UPDATE'), 'OK status');
 perform t.expect('V4 le journal accepte la cible event', (select 'OK '||count(*) from pg_constraint where conname = 'moderation_log_target_kind_check' and pg_get_constraintdef(oid) like '%event%'), 'OK 1');
 perform t.expect('V4 aucune fonction de v4 appelable par anon', (select 'OK '||count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('neighbors_is_organizer','neighbors_event_before_insert','neighbors_organizer_before_write','neighbors_organizer_after_verify','neighbors_interest_before_insert','neighbors_interest_count') and has_function_privilege('anon', p.oid, 'execute')), 'OK 0');
 perform t.expect('V4 seule neighbors_is_organizer est appelable par les connectés', (select 'OK '||string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('neighbors_is_organizer','neighbors_event_before_insert','neighbors_organizer_before_write','neighbors_organizer_after_verify','neighbors_interest_before_insert','neighbors_interest_count','neighbors_report_before_insert','neighbors_report_after_insert','neighbors_profile_after_ban','neighbors_purge_expired') and has_function_privilege('authenticated', p.oid, 'execute')), 'OK neighbors_is_organizer');
 perform t.expect('V4 aucune table de v4 sans politique', (select 'OK '||count(*) from pg_class c where c.relname in ('organizers','events','event_interest') and not exists (select 1 from pg_policy pl where pl.polrelid = c.oid)), 'OK 0');
 perform t.expect('V4 toutes les politiques de v4 visent authenticated seulement', (select 'OK '||count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid where c.relname in ('organizers','events','event_interest') and not (pl.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[])), 'OK 0');
end $$;
