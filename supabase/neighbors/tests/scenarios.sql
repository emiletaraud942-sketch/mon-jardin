-- Scénarios hostiles : chaque ligne PASS/FAIL. Exécuter avec run.sh (base jetable uniquement : le script vide auth.users).
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
\set D '''dddddddd-0000-4000-8000-000000000004'''
\set E '''eeeeeeee-0000-4000-8000-000000000005'''
\set F '''ffffffff-0000-4000-8000-000000000006'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr'),(:D,'d@x.fr'),(:E,'e@x.fr'),(:F,'f@x.fr');
do $$
declare A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
        D uuid:='dddddddd-0000-4000-8000-000000000004'; E uuid:='eeeeeeee-0000-4000-8000-000000000005'; F uuid:='ffffffff-0000-4000-8000-000000000006';
  pid uuid; qid uuid; tid uuid; r text; i int;
begin
 -- S1 anon
 perform t.expect('S1 anon ne lit pas profiles', t.as(null,'select * from public.profiles'), 'ERR 42501');
 perform t.expect('S1 anon ne lit pas posts', t.as(null,'select * from public.posts'), 'ERR 42501');
 perform t.expect('S1 anon rpc delete_my_account', t.as(null,'select public.delete_my_account()'), 'ERR 42501');
 perform t.expect('S1 anon is_member', t.as(null,'select public.neighbors_is_member()'), 'ERR 42501');
 perform t.expect('S1 anon storage list', t.as(null,'select * from storage.objects'), 'OK <0 rows>');
 -- S2 sans profil
 perform t.expect('S2 sans profil: insert post refusé', t.as(A,'insert into public.posts(kind,title) values (''don'',''x'')'), 'ERR');
 -- S3 profils
 perform t.expect('S3 profil A (arrondi)', t.as(A,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||A||''',''Alice'',48.856614,2.352222)'), 'OK rows=1');
 perform t.expect('S3 cellule arrondie', t.as(A,'select cell_lat||'' ''||cell_lon from public.profiles'), 'OK 48.86 2.34');
 perform t.expect('S3 banned_at non insérable', t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon,banned_at) values ('''||B||''',''Bob'',48.86,2.36,now())'), 'ERR 42501');
 perform t.expect('S3 profil pour un autre refusé', t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||C||''',''Mallory'',48.86,2.36)'), 'ERR 42501');
 perform t.expect('S3 pseudo <b>', t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''<b>bob</b>'',48.86,2.36)'), 'ERR 23514');
 perform t.expect('S3 pseudo RLO', t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''Bo'||chr(8238)||'b'',48.86,2.36)'), 'ERR 23514');
 perform t.expect('S3 pseudo invisible', t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''','''||chr(12644)||chr(12644)||chr(12644)||''',48.86,2.36)'), 'ERR 23514');
 perform t.expect('S3 pseudo sans alnum', t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''...'',48.86,2.36)'), 'ERR 23514');
 perform t.expect('S3 pseudo doublon casse', t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''ALICE'',48.86,2.36)'), 'ERR 23505');
 perform t.expect('S3 profil B', t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''Bob'',48.87,2.36)'), 'OK rows=1');
 perform t.expect('S3 profil C', t.as(C,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||C||''',''Carole'',48.86,2.34)'), 'OK rows=1');
 perform t.expect('S3 profil D (loin, +2deg)', t.as(D,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||D||''',''Denis'',50.86,2.34)'), 'OK rows=1');
 perform t.expect('S3 profil E', t.as(E,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||E||''',''Eve'',48.86,2.34)'), 'OK rows=1');
 perform t.expect('S3 profil F', t.as(F,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||F||''',''Farid'',48.86,2.34)'), 'OK rows=1');
 perform t.expect('S3 colonne banned_at illisible', t.as(A,'select banned_at from public.profiles'), 'ERR 42501');
 perform t.expect('S3 select * illisible (banned_at)', t.as(A,'select * from public.profiles'), 'ERR 42501');
 perform t.expect('S3 update banned_at refusé', t.as(A,'update public.profiles set banned_at=null'), 'ERR 42501');
 perform t.expect('S3 B ne voit pas encore A (aucun contenu)', t.as(B,'select pseudo from public.profiles where user_id='''||A||''''), 'OK <0 rows>');
 -- S4 annonces
 perform t.expect('S4 cell_lat non insérable', t.as(A,'insert into public.posts(kind,title,cell_lat) values (''don'',''x'',1)'), 'ERR 42501');
 perform t.expect('S4 status non insérable', t.as(A,'insert into public.posts(kind,title,status) values (''don'',''x'',''open'')'), 'ERR 42501');
 perform t.expect('S4 expires_at non insérable', t.as(A,'insert into public.posts(kind,title,expires_at) values (''don'',''x'',now()+interval ''9 years'')'), 'ERR 42501');
 perform t.expect('S4 usurper auteur', t.as(A,'insert into public.posts(author,kind,title) values ('''||B||''',''don'',''x'')'), 'ERR 42501');
 perform t.expect('S4 usurpation ne consomme pas le quota de B', (select 'OK '||count(*) from public.quotas where user_id=B), 'OK 0');
 perform t.expect('S4 photo hors dossier', t.as(A,'insert into public.posts(kind,title,photo_path) values (''don'',''x'','''||B||'/x.jpg'')'), 'ERR 23514');
 perform t.expect('S4 photo traversée', t.as(A,'insert into public.posts(kind,title,photo_path) values (''don'',''x'','''||A||'/../'||B||'/x.jpg'')'), 'ERR 23514');
 perform t.expect('S4 titre vide', t.as(A,'insert into public.posts(kind,title) values (''don'',''  '')'), 'ERR 23514');
 perform t.expect('S4 type inconnu', t.as(A,'insert into public.posts(kind,title) values (''vente'',''x'')'), 'ERR 23514');
 perform t.expect('S4 annonce A (don)', t.as(A,'insert into public.posts(kind,title,body,photo_path) values (''don'',''Boutures'',''ok'','''||A||'/11111111-1111-4111-8111-111111111111.jpg'')'), 'OK rows=1');
 perform t.expect('S4 cellule recopiée', t.as(A,'select cell_lat||'' ''||cell_lon from public.posts'), 'OK 48.86 2.34');
 perform t.expect('S4 A question', t.as(A,'insert into public.posts(kind,title) values (''question'',''Quand tailler ?'')'), 'OK rows=1');
 -- S5 quota
 for i in 1..3 loop perform t.as(A,'insert into public.posts(kind,title) values (''pret'',''t'')'); end loop;
 perform t.expect('S5 6e annonce refusée', t.as(A,'insert into public.posts(kind,title) values (''pret'',''t6'')'), 'ERR P0001 quota_exceeded:post');
 perform t.expect('S5 supprimer ne rend pas le quota', t.as(A,'delete from public.posts where title=''t'''), 'OK rows=3');
 perform t.expect('S5 toujours refusé', t.as(A,'insert into public.posts(kind,title) values (''pret'',''t7'')'), 'ERR P0001 quota_exceeded:post');
 perform t.expect('S5 quotas illisibles', t.as(A,'select * from public.quotas'), 'ERR 42501');
 perform t.expect('S5 take_quota non appelable', t.as(A,'select public.neighbors_take_quota('''||A||''',''post'',-1)'), 'ERR 42501');
 perform t.expect('S5 fonction trigger non appelable', t.as(A,'select public.neighbors_post_before_insert()'), 'ERR 42501');
 perform t.expect('S5 purge non appelable', t.as(A,'select public.neighbors_purge_expired()'), 'ERR 42501');
 perform t.expect('S5 orphan non appelable', t.as(A,'select public.neighbors_orphan_photos()'), 'ERR 42501');
 -- S6 visibilité
 perform t.expect('S6 B voit 2 annonces de A', t.as(B,'select count(*) from public.posts'), 'OK 2');
 perform t.expect('S6 B voit maintenant le pseudo de A', t.as(B,'select pseudo from public.profiles where user_id='''||A||''''), 'OK Alice');
 perform t.expect('S6 D (200 km) ne voit rien', t.as(D,'select count(*) from public.posts'), 'OK 0');
 perform t.expect('S6 D ne voit pas le profil de A', t.as(D,'select count(*) from public.profiles where user_id='''||A||''''), 'OK 0');
 perform t.expect('S6 sans profil: rien', t.as('99999999-0000-4000-8000-000000000009','select count(*) from public.posts'), 'OK 0');
 perform t.expect('S6 B ne lit pas le profil de C (aucun lien)', t.as(B,'select count(*) from public.profiles where user_id='''||C||''''), 'OK 0');
 -- S7 update
 perform t.expect('S7 modifier titre refusé', t.as(A,'update public.posts set title=''y'''), 'ERR 42501');
 perform t.expect('S7 se mettre hidden refusé', t.as(A,'update public.posts set status=''hidden'' where kind=''don'''), 'ERR 42501');
 perform t.expect('S7 fermer ok', t.as(A,'update public.posts set status=''closed'' where kind=''don'''), 'OK rows=1');
 perform t.expect('S7 B ne voit plus la fermée', t.as(B,'select count(*) from public.posts'), 'OK 1');
 perform t.expect('S7 rouvrir ok', t.as(A,'update public.posts set status=''open'' where kind=''don'''), 'OK rows=1');
 perform t.expect('S7 B ne modifie pas', t.as(B,'update public.posts set status=''closed'''), 'OK rows=0');
 perform t.expect('S7 B ne supprime pas', t.as(B,'delete from public.posts'), 'OK rows=0');
 -- S17 réponses
 select id into pid from public.posts where kind='don'; select id into qid from public.posts where kind='question';
 perform t.expect('S17 réponse sur un don refusée', t.as(B,'insert into public.replies(post_id,body) values ('''||pid||''',''salut'')'), 'ERR P0001 reply_not_allowed');
 perform t.expect('S17 réponse usurpée', t.as(B,'insert into public.replies(post_id,author,body) values ('''||qid||''','''||C||''',''salut'')'), 'ERR 42501');
 perform t.expect('S17 réponse B', t.as(B,'insert into public.replies(post_id,body) values ('''||qid||''',''en février'')'), 'OK rows=1');
 perform t.expect('S17 D (loin) ne peut pas répondre', t.as(D,'insert into public.replies(post_id,body) values ('''||qid||''',''x'')'), 'ERR');
 perform t.expect('S17 C voit la réponse', t.as(C,'select body from public.replies'), 'OK en février');
 perform t.expect('S17 C ne supprime pas la réponse', t.as(C,'delete from public.replies'), 'OK rows=0');
 perform t.expect('S17 statut non modifiable', t.as(B,'update public.replies set status=''open'''), 'ERR 42501');
 -- S8 messages
 perform t.expect('S8 fil sans être participant', t.as(C,'insert into public.threads(user_a,user_b) values ('''||A||''','''||B||''')'), 'ERR 42501');
 perform t.expect('S8 fil ordre inversé', t.as(B,'insert into public.threads(user_a,user_b) values ('''||B||''','''||A||''')'), 'ERR 23514');
 perform t.expect('S8 fil B-A', t.as(B,'insert into public.threads(user_a,user_b) values ('''||A||''','''||B||''')'), 'OK rows=1');
 select id into tid from public.threads;
 perform t.expect('S8 fil: post_id invisible refusé (C->E avec post fermé)', t.as(C,'insert into public.threads(user_a,user_b,post_id) values ('''||C||''','''||E||''',''00000000-0000-4000-8000-000000000000'')'), 'ERR');
 perform t.expect('S8 message B', t.as(B,'insert into public.messages(thread_id,body) values ('''||tid||''',''Bonjour'')'), 'OK rows=1');
 perform t.expect('S8 message usurpé', t.as(B,'insert into public.messages(thread_id,sender,body) values ('''||tid||''','''||A||''',''Bonjour'')'), 'ERR 42501');
 perform t.expect('S8 C ne lit pas', t.as(C,'select count(*) from public.messages'), 'OK 0');
 perform t.expect('S8 C ne lit pas le fil', t.as(C,'select count(*) from public.threads'), 'OK 0');
 perform t.expect('S8 C ne peut pas écrire', t.as(C,'insert into public.messages(thread_id,body) values ('''||tid||''',''intrus'')'), 'ERR 42501');
 perform t.expect('S8 A lit', t.as(A,'select body from public.messages'), 'OK Bonjour');
 perform t.expect('S8 message non modifiable', t.as(B,'update public.messages set body=''x'''), 'ERR 42501');
 perform t.expect('S8 message non supprimable', t.as(B,'delete from public.messages'), 'ERR 42501');
 perform t.expect('S8 fil non modifiable', t.as(B,'update public.threads set user_a=user_a'), 'ERR 42501');
 -- blocage
 perform t.expect('S8 A bloque B', t.as(A,'insert into public.blocks(blocked) values ('''||B||''')'), 'OK rows=1');
 perform t.expect('S8 pseudo gardé', t.as(A,'select blocked_pseudo from public.blocks'), 'OK Bob');
 perform t.expect('S8 blocked_pseudo non forgeable', t.as(A,'insert into public.blocks(blocked,blocked_pseudo) values ('''||C||''',''Zed'')'), 'ERR 42501');
 perform t.expect('S8 B ne voit plus les annonces de A', t.as(B,'select count(*) from public.posts'), 'OK 0');
 perform t.expect('S8 B ne voit plus le profil de A', t.as(B,'select count(*) from public.profiles where user_id='''||A||''''), 'OK 0');
 perform t.expect('S8 B ne voit plus les réponses', t.as(B,'select count(*) from public.replies'), 'OK 0'); -- la question de A est invisible, donc sa réponse aussi
 perform t.expect('S8 B ne lit plus le fil', t.as(B,'select count(*) from public.threads'), 'OK 0');
 perform t.expect('S8 B ne peut plus écrire', t.as(B,'insert into public.messages(thread_id,body) values ('''||tid||''',''encore'')'), 'ERR 42501');
 perform t.expect('S8 B ne peut plus répondre à A', t.as(B,'insert into public.replies(post_id,body) values ('''||qid||''',''encore'')'), 'ERR');
 perform t.expect('S8 B ne peut plus ouvrir de fil', t.as(B,'insert into public.threads(user_a,user_b) values ('''||A||''','''||B||''')'), 'ERR');
 perform t.expect('S8 A ne voit plus le fil', t.as(A,'select count(*) from public.threads'), 'OK 0');
 perform t.expect('S8 B ne voit pas la table blocks de A', t.as(B,'select count(*) from public.blocks'), 'OK 0');
 perform t.expect('S8 B ne supprime pas le blocage de A', t.as(B,'delete from public.blocks'), 'OK rows=0');
 perform t.expect('S8 B ne peut pas signaler le msg... (fil masqué par le blocage)', t.as(B,'insert into public.reports(target_kind,target_id,reason) select ''message'',id,''abus'' from public.messages'), 'OK rows=0');
 perform t.expect('S8 A débloque', t.as(A,'delete from public.blocks'), 'OK rows=1');
 perform t.expect('S8 fil de retour', t.as(A,'select count(*) from public.threads'), 'OK 1');
 -- S9 signalements
 update public.profiles set created_at = now() - interval '3 days' where user_id in (B,C,D,E);
 perform t.expect('S9 auto-signalement', t.as(A,'insert into public.reports(target_kind,target_id,reason) values (''post'','''||pid||''',''spam'')'), 'ERR P0001 report_self');
 perform t.expect('S9 signalement cible inconnue', t.as(B,'insert into public.reports(target_kind,target_id,reason) values (''post'',''00000000-0000-4000-8000-000000000001'',''spam'')'), 'ERR');
 perform t.expect('S9 D (hors zone) ne peut signaler', t.as(D,'insert into public.reports(target_kind,target_id,reason) values (''post'','''||pid||''',''spam'')'), 'ERR 42501');
 perform t.expect('S9 B signale', t.as(B,'insert into public.reports(target_kind,target_id,reason) values (''post'','''||pid||''',''spam'')'), 'OK rows=1');
 perform t.expect('S9 B doublon', t.as(B,'insert into public.reports(target_kind,target_id,reason) values (''post'','''||pid||''',''spam'')'), 'ERR 23505');
 perform t.expect('S9 C signale', t.as(C,'insert into public.reports(target_kind,target_id,reason) values (''post'','''||pid||''',''abus'')'), 'OK rows=1');
 perform t.expect('S9 pas encore masquée', (select 'OK '||status from public.posts where id=pid), 'OK open');
 perform t.expect('S9 F (compte < 24 h) signale', t.as(F,'insert into public.reports(target_kind,target_id,reason) values (''post'','''||pid||''',''abus'')'), 'OK rows=1');
 perform t.expect('S9 compte récent ne compte pas', (select 'OK '||status from public.posts where id=pid), 'OK open');
 perform t.expect('S9 E signale (3e valide)', t.as(E,'insert into public.reports(target_kind,target_id,reason) values (''post'','''||pid||''',''abus'')'), 'OK rows=1');
 perform t.expect('S9 masquée', (select 'OK '||status from public.posts where id=pid), 'OK hidden');
 perform t.expect('S9 journal: masquage automatique tracé', (select 'OK '||actor||' '||action||' '||target_kind||' '||reason from public.moderation_log where action='auto_hide'), 'OK auto auto_hide post 3 signalements');
 perform t.expect('S9 journal inaccessible aux membres', t.as(B,'select * from public.moderation_log'), 'ERR 42501');
 perform t.expect('S9 journal non inscriptible', t.as(B,'insert into public.moderation_log(action) values (''other'')'), 'ERR 42501');
 perform t.expect('S9 A (auteur) la voit encore', t.as(A,'select status from public.posts where id='''||pid||''''), 'OK hidden');
 perform t.expect('S9 A ne la rouvre pas', t.as(A,'update public.posts set status=''open'' where id='''||pid||''''), 'OK rows=0');
 perform t.expect('S9 C ne la voit plus', t.as(C,'select count(*) from public.posts where id='''||pid||''''), 'OK 0');
 perform t.expect('S9 C ne signale plus ce qu''il ne voit pas', t.as(C,'insert into public.reports(target_kind,target_id,reason) values (''post'','''||pid||''',''spam'')'), 'ERR');
 perform t.expect('S9 reports: B ne voit que les siens', t.as(B,'select count(*) from public.reports'), 'OK 1');
 perform t.expect('S9 reports non supprimables', t.as(B,'delete from public.reports'), 'ERR 42501');
 perform t.expect('S9 reports non modifiables', t.as(B,'update public.reports set reason=''autre'''), 'ERR 42501');
 perform t.expect('S9 signaler un message d''un fil étranger', t.as(C,'insert into public.reports(target_kind,target_id,reason) select ''message'',id,''abus'' from public.messages'), 'OK rows=0');
 perform t.expect('S9 signaler un msg par participant', t.as(A,'insert into public.reports(target_kind,target_id,reason) values (''message'',(select id from public.messages limit 1),''abus'')'), 'OK rows=1');
 -- S14 profil quotas
 for i in 1..5 loop perform t.as(C,'update public.profiles set pseudo=''Carole'||i||''''); end loop;
 perform t.expect('S14 6e changement refusé', t.as(C,'update public.profiles set pseudo=''Carole9'''), 'ERR P0001 quota_exceeded:profile');
 perform t.expect('S14 update sans changement ne coûte rien', t.as(C,'update public.profiles set pseudo=pseudo'), 'OK rows=1');
 alter table public.profiles disable trigger neighbors_profile_before_update;   -- v7 : une zone par semaine, la date de zone d'E est reculée
 update public.profiles set cell_changed_at = now() - interval '30 days' where user_id = E;
 alter table public.profiles enable trigger neighbors_profile_before_update;
 perform t.expect('S14 update cellule arrondie', t.as(E,'update public.profiles set cell_lat=45.123456'), 'OK rows=1');
 perform t.expect('S14 ...', t.as(E,'select cell_lat::text from public.profiles where user_id='''||E||''''), 'OK 45.12');
 -- S13 bannissement
 perform t.expect('S13 lecture B avant ban', t.as(B,'select count(*) from public.posts'), 'OK 1');
 update public.profiles set banned_at = now() where user_id = A;
 perform t.expect('S13 ban masque les annonces', (select 'OK '||count(*) from public.posts where author=A and status<>'hidden'), 'OK 0');
 perform t.expect('S13 banni: ne publie plus', t.as(A,'insert into public.posts(kind,title) values (''don'',''x'')'), 'ERR');
 perform t.expect('S13 banni: ne modifie plus son profil', t.as(A,'update public.profiles set pseudo=''Alicia'''), 'OK rows=0');
 perform t.expect('S13 banni: ne lit plus les annonces des autres', t.as(A,'select count(*) from public.posts where author<>'''||A||''''), 'OK 0');
 perform t.expect('S13 banni: ne peut plus envoyer', t.as(A,'insert into public.messages(thread_id,body) values ('''||tid||''',''x'')'), 'ERR 42501');
 perform t.expect('S13 banni: ne bloque plus (ne voit plus personne)', t.as(A,'insert into public.blocks(blocked) values ('''||C||''')'), 'ERR 42501');
 perform t.expect('S13 journal: bannissement tracé', (select 'OK '||count(*) from public.moderation_log where action='ban' and target_id=A), 'OK 1');
 update public.profiles set banned_at = null where user_id = A;
 perform t.expect('S13 journal: levée tracée', (select 'OK '||count(*) from public.moderation_log where action='unban' and target_id=A), 'OK 1');
 -- S10 définitions
 perform t.expect('S10 aucune fonction definer sans search_path', (select 'OK '||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%')), 'OK 0');
 perform t.expect('S10 aucune table sans RLS', (select 'OK '||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), 'OK 0');
 perform t.expect('S10 anon n''a aucun droit sur les tables', (select 'OK '||count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','PUBLIC')), 'OK 0');
 perform t.expect('S10 fonctions exécutables par anon/public', (select 'OK '||coalesce(string_agg(p.proname,','),'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (has_function_privilege('anon',p.oid,'execute'))), 'OK ');
end $$;

-- Suite : stockage, purge, suppression de compte (rejouée après une deuxième application de la migration par run.sh).
do $$
declare A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
        D uuid:='dddddddd-0000-4000-8000-000000000004'; pid uuid; i int; f text;
begin
 delete from public.quotas; update public.profiles set banned_at=null;
 perform t.expect('S9b post toujours masqué', (select 'OK '||status from public.posts where kind='don' and author=A), 'OK hidden');
 -- stockage
 f := A||'/11111111-1111-4111-8111-111111111111.jpg';
 perform t.expect('S12 A envoie dans son dossier', t.as(A,'insert into storage.objects(bucket_id,name) values (''neighbors-photos'','''||f||''')'), 'OK rows=1');
 perform t.expect('S12 B dans le dossier de A', t.as(B,'insert into storage.objects(bucket_id,name) values (''neighbors-photos'','''||A||'/22222222-1111-4111-8111-111111111111.jpg'')'), 'ERR 42501');
 perform t.expect('S12 nom hors modèle', t.as(A,'insert into storage.objects(bucket_id,name) values (''neighbors-photos'','''||A||'/shell.html'')'), 'ERR 42501');
 perform t.expect('S12 sous-dossier', t.as(A,'insert into storage.objects(bucket_id,name) values (''neighbors-photos'','''||A||'/x/22222222-1111-4111-8111-111111111111.jpg'')'), 'ERR 42501');
 perform t.expect('S12 autre bucket', t.as(A,'insert into storage.objects(bucket_id,name) values (''public'','''||A||'/22222222-1111-4111-8111-111111111111.jpg'')'), 'ERR');
 perform t.expect('S12 sans profil', t.as('99999999-0000-4000-8000-000000000009','insert into storage.objects(bucket_id,name) values (''neighbors-photos'',''99999999-0000-4000-8000-000000000009/22222222-1111-4111-8111-111111111111.jpg'')'), 'ERR 42501');
 for i in 2..20 loop perform t.as(A,'insert into storage.objects(bucket_id,name) values (''neighbors-photos'','''||A||'/'||lpad(i::text,8,'0')||'-1111-4111-8111-111111111111.jpg'')'); end loop;
 perform t.expect('S12 21e fichier refusé', t.as(A,'insert into storage.objects(bucket_id,name) values (''neighbors-photos'','''||A||'/99999999-1111-4111-8111-111111111111.jpg'')'), 'ERR 42501');
 perform t.expect('S12 B ne liste pas les fichiers de A (annonce masquée/non référencée)', t.as(B,'select count(*) from storage.objects'), 'OK 0');
 perform t.expect('S12 A liste les siens', t.as(A,'select count(*) from storage.objects'), 'OK 20');
 perform t.expect('S12 B ne supprime pas', t.as(B,'delete from storage.objects'), 'OK rows=0');
 perform t.expect('S12 pas de update (écrasement)', t.as(A,'update storage.objects set name=name'), 'OK rows=0');
 -- publier une annonce avec photo, visible par B
 perform t.expect('S12 annonce avec photo', t.as(A,'insert into public.posts(kind,title,photo_path) values (''don'',''Photo'','''||f||''')'), 'OK rows=1');
 perform t.expect('S12 B lit la photo de l''annonce visible (seule)', t.as(B,'select count(*) from storage.objects'), 'OK 1');
 perform t.expect('S12 D (loin) ne la lit pas', t.as(D,'select count(*) from storage.objects'), 'OK 0');
 delete from public.blocks; perform set_config('request.jwt.claim.sub','',true); insert into public.blocks(blocker, blocked) values (A, C); -- inséré par l'éditeur : C n'a aucun contenu visible de A (voir scenarios_audit.sql)
 perform t.expect('S12 C bloqué par A (ligne présente)', (select 'OK '||count(*) from public.blocks where blocker=A and blocked=C), 'OK 1');
 perform t.expect('S12 C bloqué ne la lit pas', t.as(C,'select count(*) from storage.objects'), 'OK 0');
 delete from public.blocks;
 -- orphelins
 update storage.objects set created_at = now() - interval '2 days';
 perform t.expect('S12 orphelins = 19 fichiers non rattachés', (select 'OK '||count(*) from public.neighbors_orphan_photos()), 'OK 19');
 -- purge
 update public.posts set expires_at = now() - interval '1 minute' where title='Photo';
 perform t.expect('S15 purge renvoie le chemin', (select 'OK '||coalesce(string_agg(x,','),'') from public.neighbors_purge_expired() x), 'OK '||f);
 perform t.expect('S15 B ne voit plus l''expirée', t.as(B,'select count(*) from public.posts where title=''Photo'''), 'OK 0');
 -- suppression de compte
 perform t.expect('S11 anon: delete_my_account', t.as(null,'select public.delete_my_account()'), 'ERR 42501');
 perform t.expect('S11 B supprime son compte', t.as(B,'select public.delete_my_account()'), 'OK ');
 perform t.expect('S11 plus d''utilisateur', (select 'OK '||count(*) from auth.users where id=B), 'OK 0');
 perform t.expect('S11 profil parti', (select 'OK '||count(*) from public.profiles where user_id=B), 'OK 0');
 perform t.expect('S11 messages/fils partis', (select 'OK '||(select count(*) from public.messages where sender=B)||(select count(*) from public.threads where user_a=B or user_b=B)||(select count(*) from public.replies where author=B)||(select count(*) from public.reports where reporter=B)||(select count(*) from public.quotas where user_id=B)), 'OK 00000');
 perform t.expect('S11 sans session, delete_my_account', t.as('99999999-0000-4000-8000-000000000009','select public.delete_my_account()'), 'OK ');
end $$;
