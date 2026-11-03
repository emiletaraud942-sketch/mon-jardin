-- Après la v7 rejouée sur des données qui violent la nouvelle règle : la migration n'a pas échoué (ON_ERROR_STOP), n'a rien modifié,
-- la contrainte reste « not valid » mais contrôle les nouvelles écritures. Pass 1 : avec l'ancienne ligne ; pass 2 : après nettoyage.
select set_config('v7.pass', :'pass', false);
do $$
declare
  uid_ uuid := 'abababab-0000-4000-8000-000000000001'; r text; pass text := current_setting('v7.pass');
begin
 if pass = '1' then
   perform t.expect('LEG la migration a laissé la contrainte NOT VALID (ancienne ligne conservée)', (select 'OK '||convalidated from pg_constraint where conname = 'posts_title_text_check'), 'OK false');
   perform t.expect('LEG ... l''ancienne annonce n''a pas été modifiée ni supprimée', (select 'OK '||(title like 'Vieux titre %'||chr(8238)||'piégé') from public.posts where author = uid_), 'OK true');
   perform t.expect('LEG ... les autres contraintes de texte sont validées', (select 'OK '||count(*) from pg_constraint where conname like '%\_text\_check' and convalidated), 'OK 8');
   perform t.expect('LEG ... une nouvelle écriture piégée est refusée quand même', t.as(uid_, 'insert into public.posts(kind,title) values (''don'', ''nouveau''||chr(8238)||''x'')'), 'ERR 23514');
   perform t.expect('LEG ... une nouvelle écriture saine passe', t.as(uid_, 'insert into public.posts(kind,title) values (''don'', ''nouveau titre'')'), 'OK rows=1');
   -- Limite connue : tant que la ligne n'est pas nettoyée, la modifier (même un autre champ) est refusée par la contrainte non validée.
   perform t.expect('LEG limite connue : fermer l''ancienne annonce est refusé tant qu''elle n''est pas nettoyée', t.as(uid_, 'update public.posts set status = ''closed'' where title like ''Vieux%'''), 'ERR 23514');
   perform set_config('request.jwt.claim.sub', '', true);
   update public.posts set title = 'Vieux titre nettoyé' where title like 'Vieux titre%';   -- nettoyage par l'éditeur (la nouvelle valeur est saine)
 else
   perform t.expect('LEG après nettoyage, la migration rejouée valide la contrainte', (select 'OK '||convalidated from pg_constraint where conname = 'posts_title_text_check'), 'OK true');
   perform t.expect('LEG ... toutes les contraintes de texte sont validées', (select 'OK '||count(*) from pg_constraint where conname like '%\_text\_check' and convalidated), 'OK 9');
   perform t.expect('LEG ... l''annonce nettoyée peut être fermée', t.as(uid_, 'update public.posts set status = ''closed'' where title like ''Vieux%'''), 'OK rows=1');
 end if;
end $$;
