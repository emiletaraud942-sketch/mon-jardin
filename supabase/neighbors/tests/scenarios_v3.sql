-- Scénarios de la version 3 : date de dernière lecture par conversation (thread_reads). Base JETABLE uniquement. Lancé par run.sh en dernier.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr');
do $$
declare A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
  pid uuid; tid uuid;
begin
 perform t.as(A,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||A||''',''Alice'',48.86,2.35)');
 perform t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''Bob'',48.87,2.36)');
 perform t.as(C,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||C||''',''Carole'',48.86,2.36)');
 perform t.as(A,'insert into public.posts(kind,title) values (''don'',''Boutures'')');
 select id into pid from public.posts limit 1;
 perform t.as(B,'insert into public.threads(user_a,user_b,post_id) values (least('''||A||'''::uuid,'''||B||'''::uuid),greatest('''||A||'''::uuid,'''||B||'''::uuid),'''||pid||''')');
 select id into tid from public.threads limit 1;
 perform t.as(B,'insert into public.messages(thread_id,body) values ('''||tid||''',''Bonjour'')');

 -- Lecture et écriture de sa propre ligne
 perform t.expect('V3 A marque la conversation lue', t.as(A,'insert into public.thread_reads(thread_id,user_id) values ('''||tid||''','''||A||''')'), 'OK rows=1');
 perform t.expect('V3 A lit sa ligne', t.as(A,'select count(*) from public.thread_reads'), 'OK 1');
 perform t.expect('V3 B ne voit pas la ligne de A', t.as(B,'select count(*) from public.thread_reads'), 'OK 0');
 perform t.expect('V3 B marque lue de son côté', t.as(B,'insert into public.thread_reads(thread_id,user_id) values ('''||tid||''','''||B||''')'), 'OK rows=1');
 perform t.expect('V3 chacun a sa ligne', (select 'OK '||count(*) from public.thread_reads), 'OK 2');
 -- Usurpation et conversations étrangères
 perform t.expect('V3 B ne peut pas écrire la ligne de A', t.as(B,'insert into public.thread_reads(thread_id,user_id) values ('''||tid||''','''||A||''') on conflict (thread_id,user_id) do update set last_read_at=now()'), 'ERR 42501');
 perform t.expect('V3 C (tiers) ne peut pas marquer cette conversation', t.as(C,'insert into public.thread_reads(thread_id,user_id) values ('''||tid||''','''||C||''')'), 'ERR 42501');
 perform t.expect('V3 C ne voit rien', t.as(C,'select count(*) from public.thread_reads'), 'OK 0');
 perform t.expect('V3 conversation inconnue refusée', t.as(A,'insert into public.thread_reads(thread_id,user_id) values (gen_random_uuid(),'''||A||''')'), 'ERR 42501');
 perform t.expect('V3 anon ne lit rien', t.as(null,'select count(*) from public.thread_reads'), 'ERR 42501');
 perform t.expect('V3 anon n''écrit rien', t.as(null,'insert into public.thread_reads(thread_id,user_id) values ('''||tid||''','''||A||''')'), 'ERR 42501');
 -- Mise à jour : date serveur, jamais celle du client
 perform t.expect('V3 doublon refusé (une ligne par personne)', t.as(A,'insert into public.thread_reads(thread_id,user_id) values ('''||tid||''','''||A||''')'), 'ERR 23505');
 perform t.expect('V3 A met à jour sa lecture (upsert)', t.as(A,'insert into public.thread_reads(thread_id,user_id,last_read_at) values ('''||tid||''','''||A||''',''2000-01-01'') on conflict (thread_id,user_id) do update set last_read_at=excluded.last_read_at'), 'OK rows=1');
 perform t.expect('V3 la date vient du serveur (pas 2000)', (select case when last_read_at > now() - interval '1 minute' and last_read_at <= now() then 'OK ok' else 'KO '||last_read_at end from public.thread_reads where user_id = A), 'OK ok');
 perform t.expect('V3 date future refusée = écrasée par now()', t.as(A,'update public.thread_reads set last_read_at=''2999-01-01'''), 'OK rows=1');
 perform t.expect('V3 pas de date future en base', (select 'OK '||count(*) from public.thread_reads where last_read_at > now() + interval '1 minute'), 'OK 0');
 perform t.expect('V3 thread_id non modifiable', t.as(A,'update public.thread_reads set thread_id=gen_random_uuid()'), 'ERR 42501');
 perform t.expect('V3 user_id non modifiable', t.as(A,'update public.thread_reads set user_id='''||B||''''), 'ERR 42501');
 perform t.expect('V3 B ne met pas à jour la ligne de A', t.as(B,'update public.thread_reads set last_read_at=now() where user_id='''||A||''''), 'OK rows=0');
 perform t.expect('V3 pas de suppression par le client', t.as(A,'delete from public.thread_reads'), 'ERR 42501');
 -- Blocage : la conversation disparaît, le marquage aussi
 perform t.expect('V3 A bloque B', t.as(A,'insert into public.blocks(blocker,blocked) values ('''||A||''','''||B||''')'), 'OK rows=1');
 perform t.expect('V3 A ne marque plus une conversation bloquée', t.as(A,'update public.thread_reads set last_read_at=now()'), 'OK rows=1');
 delete from public.blocks;
 -- Bannissement : plus d'écriture
 update public.profiles set banned_at = now() where user_id = B;
 perform t.expect('V3 banni ne lit rien de neuf (update refusé)', t.as(B,'update public.thread_reads set last_read_at=now()'), 'OK rows=0');
 update public.profiles set banned_at = null where user_id = B;
 -- Cascades
 perform t.expect('V3 suppression du compte de B efface sa ligne', (select 'OK '||count(*) from public.thread_reads where user_id = B), 'OK 1');
 delete from auth.users where id = B;
 perform t.expect('V3 ligne de B supprimée en cascade', (select 'OK '||count(*) from public.thread_reads where user_id = B), 'OK 0');
 perform t.expect('V3 ligne de A supprimée avec la conversation', (select 'OK '||count(*) from public.thread_reads), 'OK 0');
end $$;
