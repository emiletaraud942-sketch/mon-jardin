-- Scénarios v7, S8 : masquage automatique (signaleurs de plus de 7 jours ET déjà actifs) et avertissements avant masquage.
-- Base JETABLE uniquement. Lancé par run.sh après scenarios_v7.sql (qui définit t.u, t.mk, t.age).
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id, email) select t.u(n), 'u' || n || '@x.fr' from generate_series(1, 40) n;

create or replace function t.logs(kind text, tid uuid) returns text language sql as $$
  select coalesce(string_agg(action, ',' order by id), '-') from public.moderation_log where target_kind = kind and target_id = tid $$;
create or replace function t.rep(n int, kind text, tid uuid) returns text language sql as $$
  select t.as(t.u(n), format('insert into public.reports(target_kind,target_id,reason) values (%L,%L,''spam'')', kind, tid)) $$;
-- Rend un signaleur « qualifié » : profil de 8 jours et une annonce publiée.
create or replace function t.qualify(n int) returns void language plpgsql as $$
begin
  perform t.age(n, interval '8 days');
  perform t.as(t.u(n), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')');
end $$;

do $$
declare
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; q uuid; ev uuid; rid uuid; i int; w1 int; w2 int; th uuid;
begin
 -- Tous au même endroit. 1 = auteur ; 2..9 = signaleurs.
 for i in 1..9 loop perform t.mk(i, 'Membre' || i, 48.86, 2.34); end loop;
 for i in 1..9 loop perform t.age(i, interval '30 days'); end loop;   -- tous anciens ; on ajuste ensuite
 perform t.as(t.u(1), 'insert into public.posts(kind,title,body) values (''don'',''Annonce 1'',''x'')');
 perform t.as(t.u(1), 'insert into public.posts(kind,title,body) values (''don'',''Annonce 2'',''x'')');
 perform t.as(t.u(1), 'insert into public.posts(kind,title,body) values (''don'',''Annonce 3'',''x'')');
 perform t.as(t.u(1), 'insert into public.posts(kind,title,body) values (''don'',''Annonce 4'',''x'')');
 select id into p1 from public.posts where title = 'Annonce 1';
 select id into p2 from public.posts where title = 'Annonce 2';
 select id into p3 from public.posts where title = 'Annonce 3';
 select id into p4 from public.posts where title = 'Annonce 4';

 -- ===== Cas 1 : 3 comptes de plus de 24 h mais de moins de 7 jours, tous actifs (le scénario d'avant la v7) : PAS de masquage =====
 for i in 2..4 loop perform t.age(i, interval '3 days'); perform t.as(t.u(i), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')'); end loop;
 perform t.expect('S8 jeunes comptes (3 jours, actifs) : 1er signalement', t.rep(2, 'post', p1), 'OK rows=1');
 perform t.expect('S8 ... 2e', t.rep(3, 'post', p1), 'OK rows=1');
 perform t.expect('S8 ... 3e', t.rep(4, 'post', p1), 'OK rows=1');
 perform t.expect('S8 ... l''annonce reste ouverte (3 faux comptes de 3 jours ne masquent plus)', (select 'OK '||status from public.posts where id = p1), 'OK open');
 perform t.expect('S8 ... l''éditeur est prévenu : 3 signalements dont 0 qualifié, pas de masquage', t.logs('post', p1), 'warn');
 perform t.expect('S8 ... avec la raison', (select 'OK '||reason from public.moderation_log where target_id = p1), 'OK 3 signalements dont seulement 0 de comptes qualifiés');
 perform t.expect('S8 ... aucun auto_hide', (select 'OK '||count(*) from public.moderation_log where target_id = p1 and action = 'auto_hide'), 'OK 0');

 -- ===== Cas 2 : 3 comptes de 8 jours mais SANS aucune activité : pas de masquage =====
 for i in 5..7 loop perform t.age(i, interval '8 days'); end loop;
 perform t.rep(5, 'post', p2); perform t.rep(6, 'post', p2); perform t.rep(7, 'post', p2);
 perform t.expect('S8 comptes de 8 jours sans aucune activité : annonce ouverte', (select 'OK '||status from public.posts where id = p2), 'OK open');
 perform t.expect('S8 ... avertissement « à examiner » seulement', t.logs('post', p2), 'warn');

 -- ===== Cas 3 : 3 comptes qualifiés (8 jours + annonce / réponse / message) : masquage, avertissement AVANT =====
 -- 5 : annonce ; 6 : réponse à une question ; 7 : message privé.
 perform t.as(t.u(5), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')');
 perform t.as(t.u(2), 'insert into public.posts(kind,title) values (''question'',''Quand semer ?'')');
 select id into q from public.posts where kind = 'question' and author = t.u(2);
 perform t.as(t.u(6), format('insert into public.replies(post_id,body) values (%L,''En mars'')', q));
 perform t.expect('S8 7 ouvre une conversation avec l''auteur (annonce visible)', t.as(t.u(7), format('insert into public.threads(user_a,user_b) values (%L,%L)', least(t.u(1), t.u(7)), greatest(t.u(1), t.u(7)))), 'OK rows=1');
 select id into th from public.threads where t.u(7) in (user_a, user_b);
 perform t.expect('S8 ... et lui écrit', t.as(t.u(7), format('insert into public.messages(thread_id,body) values (%L,''Bonjour'')', th)), 'OK rows=1');
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
 perform t.expect('S8 ... l''auteur ne la rouvre pas', t.as(t.u(1), format('update public.posts set status = ''open'' where id = %L', p3)), 'OK rows=0');
 -- Signalements suivants sur un contenu déjà masqué : pas de nouvelle ligne de journal.
 perform t.age(8, interval '9 days'); perform t.as(t.u(8), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')');
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
 perform t.as(t.u(1), 'insert into public.posts(kind,title) values (''don'',''Annonce 5'')');
 select id into p5 from public.posts where title = 'Annonce 5';
 perform set_config('request.jwt.claim.sub', '', true);
 update public.profiles set banned_at = now() where user_id = t.u(8);
 perform t.expect('S8 un banni ne peut plus signaler', t.rep(8, 'post', p5), 'ERR 42501');
 perform t.age(9, interval '9 days'); perform t.as(t.u(9), 'insert into public.posts(kind,title) values (''don'',''Mes graines'')');
 perform t.rep(5, 'post', p5); perform t.rep(6, 'post', p5);
 perform set_config('request.jwt.claim.sub', '', true);
 update public.profiles set banned_at = now() where user_id = t.u(6);
 perform t.expect('S8 7 signale après le bannissement de 6 : 5 et 7 seulement comptent, pas de masquage', t.rep(7, 'post', p5), 'OK rows=1');
 perform t.expect('S8 ... p5 ouverte (le signalement du banni ne compte plus)', (select 'OK '||status from public.posts where id = p5), 'OK open');
 perform t.expect('S8 9 signale : 5, 7, 9 = 3 qualifiés', t.rep(9, 'post', p5), 'OK rows=1');
 perform t.expect('S8 ... p5 masquée', (select 'OK '||status from public.posts where id = p5), 'OK hidden');

 -- ===== Cas 6 : réponse =====
 perform t.as(t.u(3), 'insert into public.posts(kind,title) values (''question'',''Quand tailler ?'')');
 q := (select id from public.posts where title = 'Quand tailler ?');
 perform t.as(t.u(4), format('insert into public.replies(post_id,body) values (%L,''Réponse douteuse'')', q));
 rid := (select id from public.replies where post_id = q);
 perform t.rep(5, 'reply', rid); perform t.rep(7, 'reply', rid);
 perform t.expect('S8 réponse : 2 qualifiés, encore ouverte', (select 'OK '||status from public.replies where id = rid), 'OK open');
 perform t.rep(9, 'reply', rid);
 perform t.expect('S8 réponse : 3 qualifiés, masquée', (select 'OK '||status from public.replies where id = rid), 'OK hidden');
 perform t.expect('S8 ... journal de la réponse', t.logs('reply', rid), 'warn,warn,auto_hide');

 -- ===== Cas 7 : événement =====
 perform t.expect('S8 3 devient organisateur', t.as(t.u(3), format('insert into public.organizers(user_id,name) values (%L,''Jardins ouverts'')', t.u(3))), 'OK rows=1');
 perform set_config('request.jwt.claim.sub', '', true);
 update public.organizers set verified_at = now() where user_id = t.u(3);
 perform t.as(t.u(3), 'insert into public.events(title,starts_at,ends_at,place) values (''Troc'',now()+interval ''2 days'',now()+interval ''3 days'',''Salle'')');
 ev := (select id from public.events limit 1);
 perform t.rep(5, 'event', ev); perform t.rep(7, 'event', ev);
 perform t.expect('S8 événement : 2 qualifiés, encore ouvert', (select 'OK '||status from public.events where id = ev), 'OK open');
 perform t.rep(9, 'event', ev);
 perform t.expect('S8 événement : 3 qualifiés, masqué', (select 'OK '||status from public.events where id = ev), 'OK hidden');
 perform t.expect('S8 ... journal de l''événement', t.logs('event', ev), 'warn,warn,auto_hide');

 -- ===== Cas 8 : profil et message (jamais masqués seuls ; l'éditeur est prévenu une fois au 3e) =====
 perform t.rep(5, 'profile', t.u(2)); perform t.rep(7, 'profile', t.u(2));
 perform t.expect('S8 profil : 2 qualifiés, rien dans le journal', t.logs('profile', t.u(2)), '-');
 perform t.rep(9, 'profile', t.u(2));
 perform t.expect('S8 profil : 3 qualifiés, l''éditeur est prévenu (pas de masquage)', t.logs('profile', t.u(2)), 'warn');
 perform t.expect('S8 ... le profil n''est pas banni', (select 'OK '||(banned_at is null) from public.profiles where user_id = t.u(2)), 'OK true');
 perform t.expect('S8 un 4e signalement du profil n''ajoute rien', t.as(t.u(1), format('insert into public.reports(target_kind,target_id,reason) values (''profile'',%L,''spam'')', t.u(2))), 'OK rows=1');
 perform t.expect('S8 ... journal inchangé', t.logs('profile', t.u(2)), 'warn');

 -- ===== Cas 9 : le même compte ne compte qu'une fois ; contenu déjà masqué =====
 perform t.expect('S8 doublon refusé', t.rep(5, 'event', ev), 'ERR');
end $$;
