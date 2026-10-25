-- Vérifie la migration v6 sur des données d'avant (voir v6_legacy_seed.sql). Lancé par run.sh juste après la première application de v6.
-- Argument : :pass = 1 (première application) ou 2 (rejouée, doit ne rien changer).
select set_config('t.pass', :'pass', false) \gset
do $$
declare p text := current_setting('t.pass');
begin
 perform t.expect('M'||p||' L1 rural : 47.22 2.06 -> 47.22 2.07', (select 'OK '||cell_lat||' '||cell_lon||' '||cell_size from public.profiles where pseudo='Rural'), 'OK 47.22 2.07 standard');
 perform t.expect('M'||p||' L2 : 47.23 -> 47.24 (égalité arrondie vers le haut)', (select 'OK '||cell_lat||' '||cell_lon from public.profiles where pseudo='Orga'), 'OK 47.24 2.07');
 perform t.expect('M'||p||' L3 sud : -33.87 -> -33.86 ; 151.21 -> 151.20', (select 'OK '||cell_lat||' '||cell_lon from public.profiles where pseudo='Sydney'), 'OK -33.86 151.20');
 perform t.expect('M'||p||' L4 déjà sur la grille : inchangé', (select 'OK '||cell_lat||' '||cell_lon from public.profiles where pseudo='DejaBon'), 'OK 47.24 2.07');
 perform t.expect('M'||p||' toutes les cellules sont sur la grille standard',
   (select 'OK '||count(*) from public.profiles where (cell_lat*100)::int % 2 <> 0 or (cell_lon*100)::int % 3 <> 0), 'OK 0');
 perform t.expect('M'||p||' annonce ouverte de L1 arrondie', (select 'OK '||cell_lat||' '||cell_lon from public.posts where title='Boutures de menthe'), 'OK 47.22 2.07');
 perform t.expect('M'||p||' vieille annonce close : arrondie aussi, ne déménage pas', (select 'OK '||cell_lat||' '||cell_lon from public.posts where title='Vieille annonce close'), 'OK 47.32 2.19');
 perform t.expect('M'||p||' annonce sud arrondie', (select 'OK '||cell_lat||' '||cell_lon from public.posts where title='Graines'), 'OK -33.86 151.20');
 perform t.expect('M'||p||' événement arrondi', (select 'OK '||cell_lat||' '||cell_lon from public.events where title='Troc de plantes'), 'OK 47.24 2.07');
 perform t.expect('M'||p||' aucune annonce ni événement hors grille',
   (select 'OK '||((select count(*) from public.posts where (cell_lat*100)::int % 2 <> 0 or (cell_lon*100)::int % 3 <> 0)
                 + (select count(*) from public.events where (cell_lat*100)::int % 2 <> 0 or (cell_lon*100)::int % 3 <> 0))), 'OK 0');
 perform t.expect('M'||p||' quota de L1 intact (2) et aucun quota pris pour les autres',
   (select 'OK '||coalesce(sum(n),0)||'/'||count(*) from public.quotas where action='profile'), 'OK 2/1');
 perform t.expect('M'||p||' le déclencheur de quota est bien remis en route',
   (select 'OK '||tgenabled::text from pg_trigger where tgname='neighbors_profile_before_update' and tgrelid='public.profiles'::regclass), 'OK O');
 perform t.expect('M'||p||' le déclencheur d''arrondi est actif',
   (select 'OK '||tgenabled::text from pg_trigger where tgname='neighbors_profile_round' and tgrelid='public.profiles'::regclass), 'OK O');
 perform t.expect('M'||p||' les 4 profils existent toujours', (select 'OK '||count(*) from public.profiles), 'OK 4');
 perform t.expect('M'||p||' colonne cell_size : défaut standard, non nulle',
   (select 'OK '||column_default||'/'||is_nullable from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='cell_size'), 'OK ''standard''::text/NO');
end $$;
