-- Scénarios hostiles n° 2 (audit du 23 octobre 2026, 2e passe) : contact hors zone, énumération par blocage/signalement,
-- fenêtre de longitude, comptes anonymes. Base JETABLE uniquement (vide auth.users). Lancé par run.sh après scenarios.sql.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set C '''cccccccc-0000-4000-8000-000000000003'''
\set G '''99999999-0000-4000-8000-0000000000a7'''
\set H '''88888888-0000-4000-8000-0000000000a8'''
\set X '''77777777-0000-4000-8000-0000000000a9'''
\set Z '''66666666-0000-4000-8000-0000000000aa'''
truncate auth.users cascade; truncate storage.objects;
insert into auth.users(id,email) values (:A,'a@x.fr'),(:B,'b@x.fr'),(:C,'c@x.fr'),(:G,'g@x.fr'),(:H,'h@x.fr'),(:X,'x@x.fr'),(:Z,'z@x.fr');
do $$
declare A uuid:='aaaaaaaa-0000-4000-8000-000000000001'; B uuid:='bbbbbbbb-0000-4000-8000-000000000002'; C uuid:='cccccccc-0000-4000-8000-000000000003';
        G uuid:='99999999-0000-4000-8000-0000000000a7'; H uuid:='88888888-0000-4000-8000-0000000000a8'; X uuid:='77777777-0000-4000-8000-0000000000a9';
        Z uuid:='66666666-0000-4000-8000-0000000000aa'; pb uuid; tid uuid;
begin
 perform t.as(A,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||A||''',''Alice'',48.86,2.35)');
 perform t.as(B,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||B||''',''Bob'',48.87,2.36)');
 perform t.as(C,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||C||''',''Carole'',10.00,10.00)');
 perform t.as(G,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||G||''',''Gaston'',48.86,3.35)');   -- 1,0° à l'est : ~73 km
 perform t.as(H,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||H||''',''Hector'',48.86,2.85)');   -- 0,5° à l'est : ~37 km
 perform t.as(X,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||X||''',''Xavier'',48.86,2.35)');   -- membre sans annonce
 perform t.as(B,'insert into public.posts(kind,title) values (''don'',''Boutures de B'')');
 perform t.as(C,'insert into public.posts(kind,title) values (''don'',''Annonce lointaine'')');
 perform t.as(G,'insert into public.posts(kind,title) values (''don'',''Annonce de G'')');
 perform t.as(H,'insert into public.posts(kind,title) values (''don'',''Annonce de H'')');
 select id into pb from public.posts where author = B;

 -- Fenêtre de lecture : ~55 km d'est en ouest aussi (avant : 1,5° de longitude = ~112 km à Paris).
 perform t.expect('A1 A voit B (1 km) et H (37 km)', t.as(A,'select count(*) from public.posts'), 'OK 2');
 perform t.expect('A1 A ne voit pas G (73 km à l''est)', t.as(A,'select count(*) from public.posts where author='''||G||''''), 'OK 0');
 perform t.expect('A1 A ne voit pas C (loin)', t.as(A,'select count(*) from public.posts where author='''||C||''''), 'OK 0');
 perform t.expect('A1 symétrie : G ne voit pas A', t.as(G,'select count(*) from public.posts where author in ('''||B||''','''||A||''')'), 'OK 0');

 -- Contact : seulement une personne dont on voit déjà un contenu.
 perform t.expect('A2 fil avec C (hors zone, identifiant connu)', t.as(A,'insert into public.threads(user_a,user_b) values ('''||A||''','''||C||''')'), 'ERR 42501');
 perform t.expect('A2 fil avec X (membre sans contenu visible)', t.as(A,'insert into public.threads(user_a,user_b) values ('''||X||''','''||A||''')'), 'ERR 42501');
 perform t.expect('A2 fil avec G (hors zone est)', t.as(A,'insert into public.threads(user_a,user_b) values ('''||A||''','''||G||''')'), 'ERR 42501');
 perform t.expect('A2 fil avec un identifiant inexistant', t.as(A,'insert into public.threads(user_a,user_b) values ('''||A||''',''ffffffff-ffff-4fff-8fff-ffffffffffff'')'), 'ERR');
 perform t.expect('A2 A ne lit toujours pas le profil de C', t.as(A,'select count(*) from public.profiles where user_id='''||C||''''), 'OK 0');
 perform t.expect('A2 fil citant l''annonce d''un tiers (H) avec B', t.as(A,'insert into public.threads(user_a,user_b,post_id) values ('''||A||''','''||B||''','''||(select id from public.posts where author = H)||''')'), 'ERR 42501');
 perform t.expect('A2 fil avec B citant l''annonce de B', t.as(A,'insert into public.threads(user_a,user_b,post_id) values ('''||A||''','''||B||''','''||pb||''')'), 'OK rows=1');
 perform t.expect('A2 fil avec soi-même', t.as(A,'insert into public.threads(user_a,user_b) values ('''||A||''','''||A||''')'), 'ERR');

 -- Signalement et blocage : pas de sondage d'identifiants.
 perform t.expect('A3 signaler le profil de C (invisible)', t.as(A,'insert into public.reports(target_kind,target_id,reason) values (''profile'','''||C||''',''spam'')'), 'ERR 42501');
 perform t.expect('A3 signaler le profil de X (invisible)', t.as(A,'insert into public.reports(target_kind,target_id,reason) values (''profile'','''||X||''',''spam'')'), 'ERR 42501');
 perform t.expect('A3 signaler un profil inexistant : même réponse que C', t.as(A,'insert into public.reports(target_kind,target_id,reason) values (''profile'',''ffffffff-ffff-4fff-8fff-ffffffffffff'',''spam'')'), 'ERR 42501');
 perform t.expect('A3 signaler le profil de B (visible)', t.as(A,'insert into public.reports(target_kind,target_id,reason) values (''profile'','''||B||''',''spam'')'), 'OK rows=1');
 perform t.expect('A3 bloquer C (invisible) ne révèle pas son pseudo', t.as(A,'insert into public.blocks(blocked) values ('''||C||''')'), 'ERR 42501');
 perform t.expect('A3 bloquer un identifiant inexistant : même réponse', t.as(A,'insert into public.blocks(blocked) values (''ffffffff-ffff-4fff-8fff-ffffffffffff'')'), 'ERR 42501');
 perform t.expect('A3 bloquer B (visible) copie le pseudo', t.as(A,'insert into public.blocks(blocked) values ('''||B||''') returning blocked_pseudo'), 'OK rows=1');
 perform t.expect('A3 liste des blocages', t.as(A,'select blocked_pseudo from public.blocks'), 'OK Bob');

 -- Banni : plus joignable.
 update public.profiles set banned_at = now() where user_id = H;
 perform t.expect('A4 fil avec H banni (annonce masquée)', t.as(X,'insert into public.threads(user_a,user_b) values ('''||H||''','''||X||''')'), 'ERR 42501');

 -- Comptes anonymes (rôle authenticated, claim is_anonymous) : jamais de profil.
 perform set_config('request.jwt.claims', '{"is_anonymous": true}', false);
 perform t.expect('A5 compte anonyme: pas de profil', t.as(Z,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||Z||''',''Zorro'',48.86,2.35)'), 'ERR 42501');
 perform set_config('request.jwt.claims', '{"is_anonymous": false}', false);
 perform t.expect('A5 compte normal: profil créé', t.as(Z,'insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values ('''||Z||''',''Zorro'',48.86,2.35)'), 'OK rows=1');
 perform set_config('request.jwt.claims', '', false);

 -- Fonctions : seules les aides de politiques sont appelables, et elles ne parlent que de l'appelant.
 perform t.expect('A6 anon: neighbors_can_contact', t.as(null,'select neighbors_private.neighbors_can_contact('''||B||''')'), 'ERR 42501');
 perform t.expect('A6 membre: neighbors_can_contact(X) faux', t.as(A,'select neighbors_private.neighbors_can_contact('''||X||''')'), 'OK false');
 perform t.expect('A6 membre: neighbors_can_contact(B) vrai avant blocage ... ', t.as(X,'select neighbors_private.neighbors_can_contact('''||B||''')'), 'OK true');
end $$;
