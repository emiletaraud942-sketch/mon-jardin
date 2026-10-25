-- Scénarios de la version 2 : « Je cherche » et catégories. Base JETABLE uniquement (vide auth.users). Lancé par run.sh en dernier.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set D '''dddddddd-0000-4000-8000-000000000004'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:D,'d@x.fr');
do $$
declare A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; D uuid:='dddddddd-0000-4000-8000-000000000004';
  pid uuid; tid uuid;
begin
 perform t.as(A,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||A||''',''Alice'',48.86,2.35)');
 perform t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''Bob'',48.87,2.36)');
 perform t.as(D,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||D||''',''Denis'',50.86,2.34)');
 -- Création
 perform t.expect('V2 cherche + catégorie', t.as(A,'insert into public.posts(kind,title,category) values (''cherche'',''Cherche une bêche'',''outils'')'), 'OK rows=1');
 perform t.expect('V2 cherche sans catégorie refusé', t.as(A,'insert into public.posts(kind,title) values (''cherche'',''Cherche quelque chose'')'), 'ERR 23514');
 perform t.expect('V2 cherche catégorie null refusé', t.as(A,'insert into public.posts(kind,title,category) values (''cherche'',''x'',null)'), 'ERR 23514');
 perform t.expect('V2 catégorie inconnue refusée', t.as(A,'insert into public.posts(kind,title,category) values (''don'',''x'',''voitures'')'), 'ERR 23514');
 perform t.expect('V2 catégorie vide refusée', t.as(A,'insert into public.posts(kind,title,category) values (''don'',''x'','''')'), 'ERR 23514');
 perform t.expect('V2 type inconnu toujours refusé', t.as(A,'insert into public.posts(kind,title,category) values (''vente'',''x'',''autre'')'), 'ERR 23514');
 perform t.expect('V2 don sans catégorie accepté', t.as(A,'insert into public.posts(kind,title) values (''don'',''Boutures'')'), 'OK rows=1');
 perform t.expect('V2 don avec catégorie accepté', t.as(A,'insert into public.posts(kind,title,category) values (''don'',''Graines de courge'',''graines'')'), 'OK rows=1');
 -- Droits de colonnes : la catégorie s'écrit à la création, jamais après.
 perform t.expect('V2 category non modifiable', t.as(A,'update public.posts set category=''autre'' where kind=''cherche'''), 'ERR 42501');
 perform t.expect('V2 kind non modifiable', t.as(A,'update public.posts set kind=''don'' where kind=''cherche'''), 'ERR 42501');
 perform t.expect('V2 category lisible', t.as(A,'select category from public.posts where kind=''cherche'''), 'OK outils');
 perform t.expect('V2 anon ne lit rien', t.as(null,'select category from public.posts'), 'ERR 42501');
 -- Quota et lecture inchangés
 perform t.expect('V2 4e annonce du jour ok', t.as(A,'insert into public.posts(kind,title,category) values (''cherche'',''Cherche du compost'',''compost'')'), 'OK rows=1');
 perform t.expect('V2 5e annonce du jour ok', t.as(A,'insert into public.posts(kind,title,category) values (''cherche'',''Cherche des plants'',''plantes'')'), 'OK rows=1');
 perform t.expect('V2 6e refusée (quota inchangé)', t.as(A,'insert into public.posts(kind,title,category) values (''cherche'',''Une de trop'',''autre'')'), 'ERR P0001 quota_exceeded:post');
 perform t.expect('V2 B (voisin) voit les demandes', t.as(B,'select count(*) from public.posts where kind=''cherche'''), 'OK 3');
 perform t.expect('V2 D (hors zone) ne les voit pas', t.as(D,'select count(*) from public.posts where kind=''cherche'''), 'OK 0');
 -- Pas de réponses publiques sur une demande (réservées aux questions)
 select id into pid from public.posts where title='Cherche une bêche';
 perform t.expect('V2 réponse publique sur une demande refusée', t.as(B,'insert into public.replies(post_id,body) values ('''||pid||''',''J''''en ai une'')'), 'ERR');
 -- Contact privé depuis une demande
 perform t.expect('V2 B écrit en privé à A depuis la demande', t.as(B,'insert into public.threads(user_a,user_b,post_id) values (least('''||A||'''::uuid,'''||B||'''::uuid),greatest('''||A||'''::uuid,'''||B||'''::uuid),'''||pid||''')'), 'OK rows=1');
 -- Auto-masquage et blocage inchangés pour une demande
 perform t.expect('V2 B signale la demande', t.as(B,'insert into public.reports(target_kind,target_id,reason) values (''post'','''||pid||''',''spam'')'), 'OK rows=1');
 -- L'auteur peut terminer et supprimer sa demande
 perform t.expect('V2 A termine sa demande', t.as(A,'update public.posts set status=''closed'' where id='''||pid||''''), 'OK rows=1');
 perform t.expect('V2 B ne voit plus la demande terminée', t.as(B,'select count(*) from public.posts where id='''||pid||''''), 'OK 0');
 perform t.expect('V2 A supprime sa demande', t.as(A,'delete from public.posts where id='''||pid||''''), 'OK rows=1');
 -- Les anciennes lignes (category null) restent valides
 perform t.expect('V2 lignes sans catégorie présentes', (select 'OK '||count(*) from public.posts where category is null), 'OK 1');
end $$;
