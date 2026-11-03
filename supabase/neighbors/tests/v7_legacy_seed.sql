-- Données d'AVANT la v7 : une annonce dont le titre contient une marque d'inversion de sens (U+202E). Base JETABLE uniquement.
truncate auth.users cascade;
insert into auth.users(id, email) values ('abababab-0000-4000-8000-000000000001', 'legacy@x.fr');
select set_config('request.jwt.claim.sub', '', false);
insert into public.profiles(user_id, pseudo, cell_lat, cell_lon) values ('abababab-0000-4000-8000-000000000001', 'Ancien', 48.86, 2.34);
alter table public.posts drop constraint if exists posts_title_text_check;
insert into public.posts(author, kind, title) values ('abababab-0000-4000-8000-000000000001', 'don', 'Vieux titre ' || chr(8238) || 'piégé');
