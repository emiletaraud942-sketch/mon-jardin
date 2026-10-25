-- Données « d'avant la v6 » (cellules de 0,01°), semées EN PROPRIÉTAIRE avant d'appliquer la migration v6.
-- Base JETABLE uniquement. Lancé par run.sh après v1..v5 et le harnais, avant v6.
truncate auth.users cascade;
insert into auth.users(id,email) values
  ('11111111-0000-4000-8000-000000000001','l1@x.fr'),('11111111-0000-4000-8000-000000000002','l2@x.fr'),
  ('11111111-0000-4000-8000-000000000003','l3@x.fr'),('11111111-0000-4000-8000-000000000004','l4@x.fr');
-- L1 rural, L2 organisateur, L3 hémisphère sud et égalité exacte (-33,87 / 0,02 = -1693,5), L4 déjà sur la nouvelle grille.
insert into public.profiles(user_id,pseudo,cell_lat,cell_lon) values
  ('11111111-0000-4000-8000-000000000001','Rural',47.22,2.06),
  ('11111111-0000-4000-8000-000000000002','Orga',47.23,2.08),
  ('11111111-0000-4000-8000-000000000003','Sydney',-33.87,151.21),
  ('11111111-0000-4000-8000-000000000004','DejaBon',47.24,2.07);
set session_replication_role = replica;  -- postes d'avant : on force une ancienne cellule, comme si le profil avait déménagé
insert into public.posts(author,kind,title,body,cell_lat,cell_lon,status) values
  ('11111111-0000-4000-8000-000000000001','don','Boutures de menthe','',47.22,2.06,'open'),
  ('11111111-0000-4000-8000-000000000001','don','Vieille annonce close','',47.31,2.19,'closed'),
  ('11111111-0000-4000-8000-000000000003','don','Graines','',-33.87,151.21,'open');
reset session_replication_role;
insert into public.organizers(user_id,name,verified_at) values ('11111111-0000-4000-8000-000000000002','Association Test',now());
set session_replication_role = replica;
insert into public.events(organizer,title,starts_at,ends_at,place,cell_lat,cell_lon) values
  ('11111111-0000-4000-8000-000000000002','Troc de plantes',now()+interval '3 days',now()+interval '3 days 2 hours','Salle',47.23,2.08);
reset session_replication_role;
-- Un quota déjà pris par L1 aujourd'hui (la migration ne doit pas y toucher).
insert into public.quotas(user_id,action,day,n) values ('11111111-0000-4000-8000-000000000001','profile',(now() at time zone 'utc')::date,2);
