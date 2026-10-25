-- Scénarios de la version 5 : abonnements d'alerte (push_subscriptions), préférences (notification_prefs), faits de la fonction notify-message.
-- Base JETABLE uniquement (vide auth.users). Lancé par run.sh en dernier. Chaque ligne PASS/FAIL est une attaque ou une règle vérifiée.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
\set D '''dddddddd-0000-4000-8000-000000000004'''
\set E '''eeeeeeee-0000-4000-8000-000000000005'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr'),(:D,'d@x.fr'),(:E,'e@x.fr');

-- Insertion d'un abonnement (adresse de service d'alerte, clés au bon format). `n` rend l'adresse unique.
create or replace function t.subsql(n text, host text default 'fcm.googleapis.com', scheme text default 'https', p256dh text default null, auth text default null) returns text language sql as $$
  select format('insert into public.push_subscriptions(endpoint,p256dh,auth) values (%L,%L,%L)',
    scheme || '://' || host || '/fcm/send/' || n || repeat('x', 20),
    coalesce(p256dh, repeat('A', 87)), coalesce(auth, repeat('B', 22))) $$;

do $$
declare
  A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
  D uuid:='dddddddd-0000-4000-8000-000000000004'; E uuid:='eeeeeeee-0000-4000-8000-000000000005';
  pid uuid; tid uuid; mid uuid; mid2 uuid; f jsonb; r text; i int;
begin
 perform t.as(A,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||A||''',''Alice'',48.86,2.35)');
 perform t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''Bob'',48.87,2.36)');
 perform t.as(C,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||C||''',''Carole'',48.86,2.36)');
 perform t.as(D,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||D||''',''Denis'',48.86,2.36)');
 perform t.as(E,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||E||''',''Edith'',48.86,2.36)');

 -- ===== Abonnements : droits et lecture =====
 perform t.expect('V5 A enregistre son appareil', t.as(A, t.subsql('a1')), 'OK rows=1');
 perform t.expect('V5 A voit sa ligne (adresse)', t.as(A,'select count(*) from public.push_subscriptions'), 'OK 1');
 perform t.expect('V5 B ne voit rien de A', t.as(B,'select count(*) from public.push_subscriptions'), 'OK 0');
 perform t.expect('V5 C (tiers) ne voit rien', t.as(C,'select count(*) from public.push_subscriptions'), 'OK 0');
 perform t.expect('V5 B ne retrouve pas l''adresse de A par filtre', t.as(B,'select count(*) from public.push_subscriptions where endpoint like ''%a1%'''), 'OK 0');
 perform t.expect('V5 anon ne lit rien', t.as(null,'select count(*) from public.push_subscriptions'), 'ERR 42501');
 perform t.expect('V5 anon n''écrit rien', t.as(null, t.subsql('anon1')), 'ERR 42501');
 perform t.expect('V5 les clés p256dh ne se lisent pas (même les siennes)', t.as(A,'select p256dh from public.push_subscriptions'), 'ERR 42501');
 perform t.expect('V5 les clés auth ne se lisent pas', t.as(A,'select auth from public.push_subscriptions'), 'ERR 42501');
 perform t.expect('V5 select * refusé (colonnes protégées)', t.as(A,'select * from public.push_subscriptions'), 'ERR 42501');
 perform t.expect('V5 user_id non lisible par le client', t.as(A,'select user_id from public.push_subscriptions'), 'ERR 42501');
 perform t.expect('V5 la ligne est bien au nom de A', (select 'OK '||(user_id = A) from public.push_subscriptions limit 1), 'OK true');

 -- ===== Abonnements : usurpation, doublon, adresse =====
 perform t.expect('V5 B ne peut pas inscrire un appareil au nom de A', t.as(B,'insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values ('''||A||''',''https://fcm.googleapis.com/fcm/send/zzzzzzzzzzzzzzzzzzzzzz'','''||repeat('A',87)||''','''||repeat('B',22)||''')'), 'ERR 42501');
 perform t.expect('V5 B ne peut pas reprendre l''adresse de A (doublon)', t.as(B, format('insert into public.push_subscriptions(endpoint,p256dh,auth) select endpoint,p256dh,auth from (select %L::text endpoint) q, (select %L p256dh, %L auth) k', 'https://fcm.googleapis.com/fcm/send/a1'||repeat('x',20), repeat('A',87), repeat('B',22))), 'ERR 23505');
 perform t.expect('V5 le doublon ne change pas le propriétaire', (select 'OK '||count(*) from public.push_subscriptions where user_id = A), 'OK 1');
 perform t.expect('V5 adresse en http refusée', t.as(B, t.subsql('b1', scheme => 'http')), 'ERR 23514');
 perform t.expect('V5 adresse hors service d''alerte refusée (SSRF)', t.as(B, t.subsql('b2', host => 'evil.example.com')), 'ERR 23514');
 perform t.expect('V5 adresse interne refusée', t.as(B, t.subsql('b3', host => '169.254.169.254')), 'ERR 23514');
 perform t.expect('V5 localhost refusé', t.as(B, t.subsql('b4', host => 'localhost')), 'ERR 23514');
 perform t.expect('V5 astuce « utilisateur@ » refusée', t.as(B, t.subsql('b5', host => 'fcm.googleapis.com@evil.example.com')), 'ERR 23514');
 perform t.expect('V5 faux sous-domaine refusé', t.as(B, t.subsql('b6', host => 'fcm.googleapis.com.evil.example.com')), 'ERR 23514');
 perform t.expect('V5 service Mozilla accepté', t.as(B, t.subsql('b7', host => 'updates.push.services.mozilla.com')), 'OK rows=1');
 perform t.expect('V5 service Apple accepté', t.as(B, t.subsql('b8', host => 'web.push.apple.com')), 'OK rows=1');
 perform t.expect('V5 service Microsoft accepté', t.as(B, t.subsql('b9', host => 'db5p.notify.windows.com')), 'OK rows=1');
 perform t.expect('V5 adresse trop longue refusée', t.as(C, format('insert into public.push_subscriptions(endpoint,p256dh,auth) values (%L,%L,%L)', 'https://fcm.googleapis.com/fcm/send/'||repeat('y',720), repeat('A',87), repeat('B',22))), 'ERR 23514');
 perform t.expect('V5 clé p256dh mal formée refusée', t.as(C, t.subsql('c1', p256dh => 'pas une clé !')), 'ERR 23514');
 perform t.expect('V5 clé auth mal formée refusée', t.as(C, t.subsql('c2', auth => 'x')), 'ERR 23514');
 perform t.expect('V5 adresse avec espace refusée', t.as(C, format('insert into public.push_subscriptions(endpoint,p256dh,auth) values (%L,%L,%L)', 'https://fcm.googleapis.com/fcm/send/ab cdefghijklmnop', repeat('A',87), repeat('B',22))), 'ERR 23514');

 -- ===== Modification et suppression =====
 perform t.expect('V5 aucune mise à jour (adresse)', t.as(A,'update public.push_subscriptions set endpoint = ''https://fcm.googleapis.com/fcm/send/autre-adresse-xxxxx'''), 'ERR 42501');
 perform t.expect('V5 aucune mise à jour (propriétaire)', t.as(A,'update public.push_subscriptions set user_id = '''||B||''''), 'ERR 42501');
 perform t.expect('V5 B ne supprime pas la ligne de A', t.as(B,'delete from public.push_subscriptions where endpoint like ''%a1%'''), 'OK rows=0');
 perform t.expect('V5 anon ne supprime rien', t.as(null,'delete from public.push_subscriptions'), 'ERR 42501');
 perform t.expect('V5 la ligne de A est toujours là', (select 'OK '||count(*) from public.push_subscriptions where user_id = A), 'OK 1');
 perform t.expect('V5 A supprime son appareil', t.as(A,'delete from public.push_subscriptions where endpoint like ''%a1%'''), 'OK rows=1');
 perform t.expect('V5 A peut se réabonner après suppression', t.as(A, t.subsql('a1')), 'OK rows=1');

 -- ===== Plafond de 5 appareils par personne =====
 perform t.expect('V5 A : 2e appareil', t.as(A, t.subsql('a2')), 'OK rows=1');
 perform t.expect('V5 A : 3e appareil', t.as(A, t.subsql('a3')), 'OK rows=1');
 perform t.expect('V5 A : 4e appareil', t.as(A, t.subsql('a4')), 'OK rows=1');
 perform t.expect('V5 A : 5e appareil', t.as(A, t.subsql('a5')), 'OK rows=1');
 perform t.expect('V5 A : 6e appareil refusé (plafond 5)', t.as(A, t.subsql('a6')), 'ERR P0001 push_limit');
 perform t.expect('V5 A garde 5 lignes', (select 'OK '||count(*) from public.push_subscriptions where user_id = A), 'OK 5');
 perform t.expect('V5 le plafond de A ne gêne pas B', (select 'OK '||count(*) from public.push_subscriptions where user_id = B), 'OK 3');
 perform t.expect('V5 B : 4e appareil accepté', t.as(B, t.subsql('b10')), 'OK rows=1');
 perform t.expect('V5 B : 5e appareil accepté', t.as(B, t.subsql('b12')), 'OK rows=1');
 perform t.expect('V5 B : 6e refusé', t.as(B, t.subsql('b11')), 'ERR P0001 push_limit');
 perform t.expect('V5 A libère une place puis se réabonne', t.as(A,'delete from public.push_subscriptions where endpoint like ''%a5%'''), 'OK rows=1');
 perform t.expect('V5 A : nouvel appareil accepté', t.as(A, t.subsql('a7')), 'OK rows=1');

 -- ===== Quota quotidien (20 abonnements par jour) : abonnement puis retrait en boucle =====
 for i in 1..19 loop
   perform t.as(D, t.subsql('d'||i));
   perform t.as(D, 'delete from public.push_subscriptions');
 end loop;
 perform t.expect('V5 D : 20e abonnement du jour accepté', t.as(D, t.subsql('d20')), 'OK rows=1');
 perform t.as(D, 'delete from public.push_subscriptions');
 perform t.expect('V5 D : 21e abonnement du jour refusé (quota)', t.as(D, t.subsql('d21')), 'ERR P0001 quota_exceeded:push');
 delete from public.quotas where user_id = D and action = 'push';

 -- ===== Bannissement : plus d'abonnement =====
 update public.profiles set banned_at = now() where user_id = E;
 perform t.expect('V5 un membre banni ne peut pas s''abonner', t.as(E, t.subsql('e1')), 'ERR 42501');
 update public.profiles set banned_at = null where user_id = E;

 -- ===== Préférences =====
 perform t.expect('V5 aucune ligne par défaut', (select 'OK '||count(*) from public.notification_prefs), 'OK 0');
 perform t.expect('V5 A crée ses préférences (valeurs par défaut)', t.as(A,'insert into public.notification_prefs default values'), 'OK rows=1');
 perform t.expect('V5 par défaut : messages oui, nouveautés non, événements non', (select 'OK '||messages||nouveautes||evenements from public.notification_prefs where user_id = A), 'OK truefalsefalse');
 perform t.expect('V5 A lit ses préférences', t.as(A,'select messages from public.notification_prefs'), 'OK true');
 perform t.expect('V5 création sans écraser l''existant (on conflict do nothing)', t.as(A,'insert into public.notification_prefs(messages) values (false) on conflict (user_id) do nothing'), 'OK rows=0');
 perform t.expect('V5 la valeur de A n''a pas bougé', (select 'OK '||messages from public.notification_prefs where user_id = A), 'OK true');
 perform t.expect('V5 C crée ses préférences en un appel (on conflict do nothing)', t.as(C,'insert into public.notification_prefs(messages) values (true) on conflict (user_id) do nothing'), 'OK rows=1');
 perform t.expect('V5 C ne peut pas écraser celles de A par cette voie', t.as(C,'insert into public.notification_prefs(user_id,messages) values ('''||A||''',false) on conflict (user_id) do update set messages = false'), 'ERR 42501');
 delete from public.notification_prefs where user_id = C;
 perform t.expect('V5 B ne lit pas celles de A', t.as(B,'select count(*) from public.notification_prefs'), 'OK 0');
 perform t.expect('V5 anon ne lit rien', t.as(null,'select count(*) from public.notification_prefs'), 'ERR 42501');
 perform t.expect('V5 anon n''écrit rien', t.as(null,'insert into public.notification_prefs default values'), 'ERR 42501');
 perform t.expect('V5 B ne crée pas de préférences au nom de A', t.as(B,'insert into public.notification_prefs(user_id,messages) values ('''||A||''',false)'), 'ERR 42501');
 perform t.expect('V5 B ne modifie pas celles de A', t.as(B,'update public.notification_prefs set messages = false where user_id = '''||A||''''), 'OK rows=0');
 perform t.expect('V5 les préférences de A sont intactes', (select 'OK '||messages from public.notification_prefs where user_id = A), 'OK true');
 perform t.expect('V5 A désactive les messages', t.as(A,'update public.notification_prefs set messages = false'), 'OK rows=1');
 perform t.expect('V5 A active les nouveautés', t.as(A,'update public.notification_prefs set nouveautes = true, evenements = true'), 'OK rows=1');
 perform t.expect('V5 doublon refusé (une ligne par membre)', t.as(A,'insert into public.notification_prefs default values'), 'ERR 23505');
 perform t.expect('V5 A change en un appel (upsert)', t.as(A,'insert into public.notification_prefs(messages,nouveautes,evenements) values (true,false,false) on conflict (user_id) do update set messages = excluded.messages, nouveautes = excluded.nouveautes, evenements = excluded.evenements'), 'OK rows=1');
 perform t.expect('V5 l''upsert a bien écrit', (select 'OK '||messages||nouveautes||evenements from public.notification_prefs where user_id = A), 'OK truefalsefalse');
 perform t.expect('V5 user_id non modifiable', t.as(A,'update public.notification_prefs set user_id = '''||B||''''), 'ERR 42501');
 perform t.expect('V5 pas de suppression par le client', t.as(A,'delete from public.notification_prefs'), 'ERR 42501');
 perform t.expect('V5 valeur absurde refusée (type booléen)', t.as(A,'update public.notification_prefs set messages = ''peut-être'''), 'ERR 22P02');
 perform t.expect('V5 NULL refusé', t.as(A,'update public.notification_prefs set messages = null'), 'ERR 23502');
 update public.profiles set banned_at = now() where user_id = A;
 perform t.expect('V5 un membre banni ne modifie plus ses préférences', t.as(A,'update public.notification_prefs set messages = false'), 'OK rows=0');
 update public.profiles set banned_at = null where user_id = A;
 update public.profiles set banned_at = now() where user_id = E;
 perform t.expect('V5 un membre banni ne crée plus de préférences', t.as(E,'insert into public.notification_prefs default values'), 'ERR 42501');
 update public.profiles set banned_at = null where user_id = E;

 -- ===== Faits pour la fonction notify-message =====
 perform t.as(A,'insert into public.posts(kind,title) values (''don'',''Boutures'')');
 select id into pid from public.posts limit 1;
 perform t.as(B,'insert into public.threads(user_a,user_b,post_id) values (least('''||A||'''::uuid,'''||B||'''::uuid),greatest('''||A||'''::uuid,'''||B||'''::uuid),'''||pid||''')');
 select id into tid from public.threads limit 1;
 perform t.as(B,'insert into public.messages(thread_id,body) values ('''||tid||''',''Texte secret du message'')');
 select id into mid from public.messages limit 1;

 perform t.expect('V5 le client ne peut pas appeler les faits (connecté)', t.as(A,'select public.neighbors_push_facts('''||mid||''')'), 'ERR 42501');
 perform t.expect('V5 le client ne peut pas appeler les faits (anon)', t.as(null,'select public.neighbors_push_facts('''||mid||''')'), 'ERR 42501');
 set local role service_role;
 select public.neighbors_push_facts(mid) into f;
 reset role;
 perform t.expect('V5 service_role : faits d''un message', 'OK '||(f->>'recipient')||' '||(f->>'sender'), 'OK '||A||' '||B);
 perform t.expect('V5 le destinataire est l''autre participant (jamais l''expéditeur)', 'OK '||((f->>'recipient')::uuid <> (f->>'sender')::uuid), 'OK true');
 perform t.expect('V5 faits : ni texte ni pseudo', 'OK '||(f::text ~ 'secret' or f::text ~ 'Alice' or f::text ~ 'Bob'), 'OK false');
 perform t.expect('V5 faits : clés exactes', 'OK '||(select string_agg(k, ',' order by k) from jsonb_object_keys(f) k), 'OK blocked,message_id,prefs_messages,previous_at,recipient,recipient_banned,sender,sender_banned,sent_at,subscriptions');
 perform t.expect('V5 faits : les appareils sont ceux de A seulement', 'OK '||jsonb_array_length(f->'subscriptions'), 'OK 5');
 perform t.expect('V5 faits : préférences messages = true', 'OK '||(f->>'prefs_messages'), 'OK true');
 perform t.expect('V5 faits : pas de blocage ni de bannissement', 'OK '||(f->>'blocked')||(f->>'sender_banned')||(f->>'recipient_banned'), 'OK falsefalsefalse');
 perform t.expect('V5 faits : pas de message précédent', 'OK '||coalesce(f->>'previous_at','<null>'), 'OK <null>');

 -- message précédent du même expéditeur
 update public.messages set created_at = now() - interval '10 minutes' where id = mid;
 perform t.as(B,'insert into public.messages(thread_id,body) values ('''||tid||''',''Deuxième'')');
 select id into mid2 from public.messages where id <> mid limit 1;
 set local role service_role; select public.neighbors_push_facts(mid2) into f; reset role;
 perform t.expect('V5 faits : date du message précédent du même expéditeur', 'OK '||(f->>'previous_at' is not null), 'OK true');
 -- la réponse du destinataire n'est pas un « message précédent » de l'expéditeur
 perform t.as(A,'insert into public.messages(thread_id,body) values ('''||tid||''',''Réponse'')');
 set local role service_role; select public.neighbors_push_facts((select id from public.messages where sender = A)) into f; reset role;
 perform t.expect('V5 faits : A écrit, le destinataire est B', 'OK '||(f->>'recipient'), 'OK '||B);
 perform t.expect('V5 faits : B a ses 5 appareils et aucune préférence', 'OK '||jsonb_array_length(f->'subscriptions')||coalesce(f->>'prefs_messages','<null>'), 'OK 5<null>');

 -- blocage dans les deux sens
 perform t.expect('V5 A bloque B', t.as(A,'insert into public.blocks(blocker,blocked) values ('''||A||''','''||B||''')'), 'OK rows=1');
 set local role service_role; select public.neighbors_push_facts(mid2) into f; reset role;
 perform t.expect('V5 faits : blocage vu (A a bloqué B)', 'OK '||(f->>'blocked'), 'OK true');
 delete from public.blocks;
 perform t.expect('V5 B bloque A', t.as(B,'insert into public.blocks(blocker,blocked) values ('''||B||''','''||A||''')'), 'OK rows=1');
 set local role service_role; select public.neighbors_push_facts(mid2) into f; reset role;
 perform t.expect('V5 faits : blocage vu (B a bloqué A)', 'OK '||(f->>'blocked'), 'OK true');
 delete from public.blocks;

 -- bannissement
 update public.profiles set banned_at = now() where user_id = A;
 set local role service_role; select public.neighbors_push_facts(mid2) into f; reset role;
 perform t.expect('V5 faits : destinataire banni', 'OK '||(f->>'recipient_banned'), 'OK true');
 update public.profiles set banned_at = null where user_id = A;
 update public.profiles set banned_at = now() where user_id = B;
 set local role service_role; select public.neighbors_push_facts(mid2) into f; reset role;
 perform t.expect('V5 faits : expéditeur banni', 'OK '||(f->>'sender_banned'), 'OK true');
 update public.profiles set banned_at = null where user_id = B;

 -- préférences absentes ou refusées
 update public.notification_prefs set messages = false where user_id = A;
 set local role service_role; select public.neighbors_push_facts(mid2) into f; reset role;
 perform t.expect('V5 faits : préférence « messages » refusée', 'OK '||(f->>'prefs_messages'), 'OK false');
 delete from public.notification_prefs where user_id = A;
 set local role service_role; select public.neighbors_push_facts(mid2) into f; reset role;
 perform t.expect('V5 faits : pas de ligne de préférences = null', 'OK '||coalesce(f->>'prefs_messages','<null>'), 'OK <null>');

 -- message inconnu
 set local role service_role; select public.neighbors_push_facts(gen_random_uuid()) into f; reset role;
 perform t.expect('V5 faits : message inconnu = null', 'OK '||coalesce(f::text,'<null>'), 'OK <null>');

 -- ===== Droits sur les objets de v5 =====
 perform t.expect('V5 aucune fonction de v5 appelable par anon', (select 'OK '||count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('neighbors_push_before_insert','neighbors_push_facts') and has_function_privilege('anon', p.oid, 'execute')), 'OK 0');
 perform t.expect('V5 aucune fonction de v5 appelable par les connectés', (select 'OK '||count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('neighbors_push_before_insert','neighbors_push_facts') and has_function_privilege('authenticated', p.oid, 'execute')), 'OK 0');
 perform t.expect('V5 aucune table de v5 sans politique', (select 'OK '||count(*) from pg_class c where c.relname in ('push_subscriptions','notification_prefs') and not exists (select 1 from pg_policy pl where pl.polrelid = c.oid)), 'OK 0');
 perform t.expect('V5 RLS activée sur les deux tables', (select 'OK '||count(*) from pg_class c where c.relname in ('push_subscriptions','notification_prefs') and c.relrowsecurity), 'OK 2');
 perform t.expect('V5 toutes les politiques de v5 visent authenticated seulement', (select 'OK '||count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid where c.relname in ('push_subscriptions','notification_prefs') and pl.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]), 'OK 0');
 perform t.expect('V5 anon n''a aucun droit sur les tables de v5', (select 'OK '||count(*) from information_schema.role_table_grants where grantee = 'anon' and table_name in ('push_subscriptions','notification_prefs')), 'OK 0');
 perform t.expect('V5 aucun droit de mise à jour sur push_subscriptions', (select 'OK '||count(*) from information_schema.column_privileges where grantee = 'authenticated' and table_name = 'push_subscriptions' and privilege_type = 'UPDATE'), 'OK 0');
 perform t.expect('V5 les clés ne sont lisibles par aucun rôle client', (select 'OK '||count(*) from information_schema.column_privileges where grantee in ('authenticated','anon') and table_name = 'push_subscriptions' and column_name in ('p256dh','auth') and privilege_type = 'SELECT'), 'OK 0');

 -- ===== Cascades =====
 perform t.expect('V5 B a des appareils avant suppression du compte', (select 'OK '||(count(*) > 0) from public.push_subscriptions where user_id = B), 'OK true');
 perform t.as(B,'insert into public.notification_prefs default values');
 perform t.expect('V5 B a des préférences avant suppression du compte', (select 'OK '||count(*) from public.notification_prefs where user_id = B), 'OK 1');
 delete from auth.users where id = B;
 perform t.expect('V5 suppression du compte efface les appareils', (select 'OK '||count(*) from public.push_subscriptions where user_id = B), 'OK 0');
 perform t.expect('V5 suppression du compte efface les préférences', (select 'OK '||count(*) from public.notification_prefs where user_id = B), 'OK 0');
 perform t.expect('V5 les appareils des autres sont intacts', (select 'OK '||count(*) from public.push_subscriptions where user_id = A), 'OK 5');
end $$;
