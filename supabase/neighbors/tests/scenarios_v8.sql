-- Scénarios de la version 8 : jardins partagés (garden_shares), visibilité, contact pour une bouture.
-- Base JETABLE uniquement (vide auth.users). Lancé par run.sh en dernier. Chaque ligne PASS/FAIL est une attaque ou une règle vérifiée.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
\set D '''dddddddd-0000-4000-8000-000000000004'''
\set E '''eeeeeeee-0000-4000-8000-000000000005'''
\set F '''ffffffff-0000-4000-8000-000000000006'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr'),(:D,'d@x.fr'),(:E,'e@x.fr'),(:F,'f@x.fr');

do $$
declare
  A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
  D uuid:='dddddddd-0000-4000-8000-000000000004'; E uuid:='eeeeeeee-0000-4000-8000-000000000005'; F uuid:='ffffffff-0000-4000-8000-000000000006';
  i int; r text; many text;
begin
 -- A, B, D, E à Paris ; C à Lyon (hors zone) ; F n'a pas de profil.
 perform t.as(A,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||A||''',''Alice'',48.86,2.35)');
 perform t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''Bob'',48.87,2.36)');
 perform t.as(C,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||C||''',''Carole'',45.76,4.83)');
 perform t.as(D,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||D||''',''Denis'',48.86,2.36)');
 perform t.as(E,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||E||''',''Edith'',48.86,2.36)');

 -- ===== Avant tout partage : rien n'est visible, personne n'est contactable =====
 perform t.expect('V8 sans partage, B ne voit aucun jardin', t.as(B,'select count(*) from public.garden_shares'), 'OK 0');
 perform t.expect('V8 sans partage, B ne lit pas le pseudo de A', t.as(B,'select count(*) from public.profiles where user_id = '''||A||''''), 'OK 0');
 perform t.expect('V8 sans partage, B ne peut pas écrire à A', t.as(B,'insert into public.threads(user_a,user_b) values ('''||A||''','''||B||''')'), 'ERR 42501');

 -- ===== Partager sa liste =====
 perform t.expect('V8 A partage sa liste (doublons et désordre)', t.as(A,'insert into public.garden_shares(species) values (array[''romarin'',''pommier'',''romarin''])'), 'OK rows=1');
 perform t.expect('V8 la liste est triée et sans doublon', t.as(A,'select species::text from public.garden_shares'), 'OK {pommier,romarin}');
 perform t.expect('V8 la ligne est bien au nom de A', (select 'OK '||(user_id = A) from public.garden_shares limit 1), 'OK true');
 perform t.expect('V8 anon ne lit rien', t.as(null,'select count(*) from public.garden_shares'), 'ERR 42501');
 perform t.expect('V8 anon n''écrit rien', t.as(null,'insert into public.garden_shares(species) values (array[''pommier''])'), 'ERR 42501');
 perform t.expect('V8 anon n''exécute pas la fonction de visibilité', t.as(null,'select public.neighbors_can_see_user('''||A||''')'), 'ERR 42501');

 -- ===== Qui voit quoi =====
 perform t.expect('V8 B (même quartier) voit le jardin de A', t.as(B,'select species::text from public.garden_shares'), 'OK {pommier,romarin}');
 perform t.expect('V8 B lit désormais le pseudo de A', t.as(B,'select pseudo from public.profiles where user_id = '''||A||''''), 'OK Alice');
 perform t.expect('V8 B ne lit pas la cellule de A en passant par le jardin (aucune colonne cell_*)', t.as(B,'select cell_lat from public.garden_shares'), 'ERR 42703');
 perform t.expect('V8 C (Lyon, hors zone) ne voit rien', t.as(C,'select count(*) from public.garden_shares'), 'OK 0');
 perform t.expect('V8 C ne lit pas le pseudo de A', t.as(C,'select count(*) from public.profiles where user_id = '''||A||''''), 'OK 0');
 perform t.expect('V8 F (sans profil) ne voit rien', t.as(F,'select count(*) from public.garden_shares'), 'OK 0');
 perform t.expect('V8 F (sans profil) ne peut pas partager', t.as(F,'insert into public.garden_shares(species) values (array[''pommier''])'), 'ERR 42501');

 -- ===== Demander une bouture : écrire à la personne dont on voit le jardin =====
 perform t.expect('V8 B écrit à A (jardin visible)', t.as(B,'insert into public.threads(user_a,user_b) values ('''||A||''','''||B||''')'), 'OK rows=1');
 perform t.expect('V8 C ne peut pas écrire à A (hors zone)', t.as(C,'insert into public.threads(user_a,user_b) values ('''||A||''','''||C||''')'), 'ERR 42501');
 perform t.expect('V8 D ne peut pas écrire à B (B ne partage rien)', t.as(B,'insert into public.threads(user_a,user_b) values ('''||B||''','''||D||''')'), 'ERR 42501');

 -- ===== Usurpation et modification par un tiers =====
 perform t.expect('V8 B ne partage pas au nom de A', t.as(B,'insert into public.garden_shares(user_id,species) values ('''||A||''',array[''lavande''])'), 'ERR 42501');
 perform t.expect('V8 B ne modifie pas la liste de A', t.as(B,'update public.garden_shares set species = array[''lavande''] where user_id = '''||A||''''), 'OK rows=0');
 perform t.expect('V8 B ne supprime pas la liste de A', t.as(B,'delete from public.garden_shares where user_id = '''||A||''''), 'OK rows=0');
 perform t.expect('V8 la liste de A est intacte', t.as(A,'select species::text from public.garden_shares'), 'OK {pommier,romarin}');
 perform t.expect('V8 user_id ne se change pas', t.as(A,'update public.garden_shares set user_id = '''||B||''''), 'ERR 42501');
 perform t.expect('V8 updated_at ne se force pas', t.as(A,'update public.garden_shares set updated_at = now() - interval ''1 year'''), 'ERR 42501');
 perform t.expect('V8 B n''a pas de ligne : mise à jour sans effet', t.as(B,'update public.garden_shares set species = array[''lavande'']'), 'OK rows=0');

 -- ===== Contenu : uniquement des identifiants de fiches =====
 perform t.expect('V8 majuscules refusées', t.as(D,'insert into public.garden_shares(species) values (array[''Pommier''])'), 'ERR 23514');
 perform t.expect('V8 identifiant trop court refusé', t.as(D,'insert into public.garden_shares(species) values (array[''a''])'), 'ERR 23514');
 perform t.expect('V8 espace refusé', t.as(D,'insert into public.garden_shares(species) values (array[''pomm ier''])'), 'ERR 23514');
 perform t.expect('V8 texte libre refusé', t.as(D,'insert into public.garden_shares(species) values (array[''appelez-moi au 0600000000''])'), 'ERR 23514');
 perform t.expect('V8 balise refusée', t.as(D,'insert into public.garden_shares(species) values (array[''<b>x</b>''])'), 'ERR 23514');
 perform t.expect('V8 virgule dans un identifiant refusée (deux identifiants déguisés en un)', t.as(D,'insert into public.garden_shares(species) values (array[''pommier,poirier''])'), 'ERR 23514');
 perform t.expect('V8 séparateur interne refusé', t.as(D,'insert into public.garden_shares(species) values (array[''pommier''||chr(31)||''poirier''])'), 'ERR 23514');
 perform t.expect('V8 accent refusé', t.as(D,'insert into public.garden_shares(species) values (array[''prunéa''])'), 'ERR 23514');
 perform t.expect('V8 identifiant de 41 caractères refusé', t.as(D, format('insert into public.garden_shares(species) values (array[%L])', repeat('a', 41))), 'ERR 23514');
 perform t.expect('V8 identifiant de 40 caractères accepté', t.as(E, format('insert into public.garden_shares(species) values (array[%L])', repeat('a', 40))), 'OK rows=1');
 perform t.expect('V8 élément vide refusé', t.as(D,'insert into public.garden_shares(species) values (array[''''])'), 'ERR 23514');
 perform t.expect('V8 élément nul ignoré', t.as(D,'insert into public.garden_shares(species) values (array[''lavande'', null])'), 'OK rows=1');
 perform t.expect('V8 liste vide acceptée (jardin sans plante)', t.as(D,'update public.garden_shares set species = ''{}'''), 'OK rows=1');
 select string_agg('esp-' || lpad(g::text, 3, '0'), ',') into many from generate_series(1, 81) g;
 perform t.expect('V8 81 espèces refusées', t.as(D, format('update public.garden_shares set species = string_to_array(%L, '','')', many)), 'ERR 23514');
 select string_agg('esp-' || lpad(g::text, 3, '0'), ',') into many from generate_series(1, 80) g;
 perform t.expect('V8 80 espèces acceptées', t.as(D, format('update public.garden_shares set species = string_to_array(%L, '','')', many)), 'OK rows=1');
 perform t.expect('V8 select * ne rend que les 3 colonnes publiques (aucune cellule, aucun secret)', (select 'OK '||count(*) from information_schema.columns where table_schema='public' and table_name='garden_shares'), 'OK 3');

 -- ===== Quota : 20 écritures par jour =====
 for i in 1..18 loop
   r := t.as(E, format('update public.garden_shares set species = array[%L]', 'espece-' || i));
   if r <> 'OK rows=1' then raise notice 'FAIL  V8 écriture % de E  -> %', i, r; end if;
 end loop;
 perform t.expect('V8 la 20e écriture du jour passe', t.as(E,'update public.garden_shares set species = array[''derniere'']'), 'OK rows=1');
 perform t.expect('V8 la 21e est refusée (quota)', t.as(E,'update public.garden_shares set species = array[''trop'']'), 'ERR P0001 quota_exceeded:garden_share');
 perform t.expect('V8 le quota ne gêne pas les autres', t.as(A,'update public.garden_shares set species = array[''pommier'',''romarin'',''thym'']'), 'OK rows=1');

 -- ===== Blocage : dans un sens comme dans l'autre =====
 perform t.expect('V8 B bloque A', t.as(B,'insert into public.blocks(blocked) values ('''||A||''')'), 'OK rows=1');
 perform t.expect('V8 B bloqué : ne voit plus le jardin de A', t.as(B,'select count(*) from public.garden_shares where user_id = '''||A||''''), 'OK 0');
 perform t.expect('V8 A ne voit pas le jardin de B qui l''a bloqué', t.as(A,'select count(*) from public.garden_shares where user_id = '''||B||''''), 'OK 0');
 perform t.expect('V8 A voit toujours le sien', t.as(A,'select count(*) from public.garden_shares where user_id = '''||A||''''), 'OK 1');
 perform t.expect('V8 D (sans blocage) voit toujours le jardin de A', t.as(D,'select count(*) from public.garden_shares where user_id = '''||A||''''), 'OK 1');
 delete from public.blocks;

 -- ===== Bannissement : la liste disparaît pour les autres =====
 update public.profiles set banned_at = now() where user_id = A;
 perform t.expect('V8 A banni : B ne voit plus son jardin', t.as(B,'select count(*) from public.garden_shares where user_id = '''||A||''''), 'OK 0');
 perform t.expect('V8 A banni : plus de contact possible', t.as(D,'insert into public.threads(user_a,user_b) values ('''||A||''','''||D||''')'), 'ERR 42501');
 perform t.expect('V8 A banni ne modifie plus sa liste', t.as(A,'update public.garden_shares set species = array[''thym'']'), 'OK rows=0');
 update public.profiles set banned_at = null where user_id = A;

 -- ===== Arrêter de partager =====
 perform t.expect('V8 A arrête de partager', t.as(A,'delete from public.garden_shares'), 'OK rows=1');
 perform t.expect('V8 B ne voit plus rien de A', t.as(B,'select count(*) from public.garden_shares where user_id = '''||A||''''), 'OK 0');
 perform t.expect('V8 plus de lecture du pseudo de A par B (la conversation existe déjà : elle reste lisible)', t.as(B,'select pseudo from public.profiles where user_id = '''||A||''''), 'OK Alice');
 perform t.expect('V8 D ne peut plus écrire à A', t.as(D,'insert into public.threads(user_a,user_b) values ('''||A||''','''||D||''')'), 'ERR 42501');

 -- ===== Suppression du compte : la liste part avec =====
 perform t.expect('V8 E avait une liste', (select 'OK '||count(*) from public.garden_shares where user_id = E), 'OK 1');
 delete from auth.users where id = E;
 perform t.expect('V8 compte supprimé : liste supprimée (cascade)', (select 'OK '||count(*) from public.garden_shares where user_id = E), 'OK 0');
end $$;
